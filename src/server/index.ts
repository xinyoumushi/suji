import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { exec } from 'node:child_process'
import { initDb, getDb, nowIso } from '../main/db'
import * as tree from '../main/services/tree'
import * as cards from '../main/services/cards'
import * as tags from '../main/services/tags'
import * as search from '../main/services/search'
import * as history from '../main/services/history'
import * as io from '../main/services/io'

/**
 * 浏览器模式：把同一套业务服务挂到本地 HTTP 上，界面仍是 out/renderer 的构建产物。
 * 适用于 Electron 被安全策略拦截、或只想用浏览器用的场景。数据仍写入同一个 suji.db。
 */

const ROOT = path.resolve(__dirname, '../..')
const RENDERER_DIR = path.join(ROOT, 'out', 'renderer')
const SHIM = path.join(__dirname, 'shim.js')

/** 优先用 %APPDATA%\速记；不可写时退回到项目目录，保证服务一定能起来 */
function resolveUserData(): string {
  const preferred = process.env.SUJI_DATA_DIR || path.join(process.env.APPDATA || process.cwd(), '速记')
  try {
    fs.mkdirSync(path.join(preferred, 'data'), { recursive: true })
    return preferred
  } catch {
    const fallback = ROOT
    fs.mkdirSync(path.join(fallback, 'data'), { recursive: true })
    return fallback
  }
}

const userData = resolveUserData()
const dataDir = path.join(userData, 'data')
const backupDir = path.join(userData, 'backups')
const TEMP_DIR = path.join(userData, 'tmp')

function fatal(message: string): never {
  try {
    fs.mkdirSync(userData, { recursive: true })
    fs.writeFileSync(path.join(userData, 'server-error.log'), `[${new Date().toISOString()}] ${message}\n`, 'utf8')
  } catch {
    /* 日志失败也要退出 */
  }
  console.error(message)
  process.exit(1)
}

process.on('uncaughtException', (error) => {
  fatal(error instanceof Error ? (error.stack ?? error.message) : String(error))
})

try {
  fs.mkdirSync(dataDir, { recursive: true })
  fs.mkdirSync(backupDir, { recursive: true })
  fs.mkdirSync(TEMP_DIR, { recursive: true })
  initDb(path.join(dataDir, 'suji.db'))
} catch (error) {
  fatal(`初始化数据目录失败：${error instanceof Error ? error.message : String(error)}\n数据目录：${userData}`)
}

function snapshot(reason: string): string {
  try {
    const target = path.join(backupDir, `suji-${Date.now()}-${reason}.db`)
    getDb().backupTo(target)
    return target
  } catch {
    return ''
  }
}

const appInfo = () => {
  const db = getDb()
  const count = (sql: string) => Number(db.get<{ c: number }>(sql)?.c ?? 0)
  return {
    version: '1.0.0',
    dataDir: userData,
    dbPath: path.join(dataDir, 'suji.db'),
    nodeCount: count('SELECT COUNT(*) AS c FROM tree_nodes'),
    cardCount: count('SELECT COUNT(*) AS c FROM cards'),
    tagCount: count('SELECT COUNT(*) AS c FROM tags'),
    importCount: count("SELECT COUNT(*) AS c FROM cards WHERE source = 'import'"),
    lastExportAt: null as string | null,
    lastImportAt: null as string | null
  }
}

const handlers: Record<string, (...args: any[]) => unknown> = {
  'tree.list': () => tree.listNodes(),
  'tree.createFolder': (parentId, name) => tree.createFolder(parentId, name),
  'tree.createRefs': (parentId, cardIds) => tree.createRefs(parentId, cardIds),
  'tree.rename': (id, name) => tree.renameFolder(id, name),
  'tree.setNote': (id, note) => tree.setNote(id, note),
  'tree.move': (nodeId, parentId, index) => tree.moveNode(nodeId, parentId, index),
  'tree.removeRef': (id) => tree.removeRef(id),
  'tree.deleteFolder': (id, strategy) => {
    if (strategy === 'cascade') snapshot('before-cascade')
    return tree.deleteFolder(id, strategy)
  },
  'tree.stats': (id) => tree.subtreeStats(id),
  'tree.path': (id) => tree.pathOf(id),
  'tree.history': (id) => history.listHistory('folder', id),

  'card.list': (filter) => cards.listCards(filter ?? {}),
  'card.get': (id) => cards.getCard(id),
  'card.create': (input) => cards.createCard(input),
  'card.update': (id, input) => cards.updateCard(id, input),
  'card.remove': (id) => cards.deleteCard(id),
  'card.setTags': (cardId, tagIds) => cards.setCardTags(cardId, tagIds),
  'card.refs': (cardId) => cards.cardRefLocations(cardId),
  'card.history': (id) => history.listHistory('card', id),

  'tag.list': () => tags.listTags(),
  'tag.create': (name) => tags.createTag(name),
  'tag.rename': (id, name) => tags.renameTag(id, name),
  'tag.remove': (id) => tags.deleteTag(id),

  'search.query': (keyword) => search.search(keyword),

  'io.commitImport': (token, options) => {
    snapshot('before-import')
    return io.commitImport(token, options)
  },

  'app.info': () => appInfo(),
  'app.openDataDir': () => {
    exec(`explorer.exe "${userData.replace(/\//g, '\\')}"`)
    return true
  },
  'app.backup': () => snapshot('manual')
}

function send(res: http.ServerResponse, status: number, body: string, type = 'application/json; charset=utf-8'): void {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' })
  res.end(body)
}

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
}

function serveIndex(res: http.ServerResponse): void {
  const htmlPath = path.join(RENDERER_DIR, 'index.html')
  if (!fs.existsSync(htmlPath)) {
    send(res, 500, '构建产物缺失，请先执行 pnpm build', 'text/plain; charset=utf-8')
    return
  }
  let html = fs.readFileSync(htmlPath, 'utf8')
  // 在应用主脚本之前注入 window.api 的 HTTP 实现
  html = html.replace('<head>', '<head>\n    <script src="/shim.js"></script>')
  send(res, 200, html, 'text/html; charset=utf-8')
}

async function handleImportUpload(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
  const buffer = await readBody(req)
  const name = (url.searchParams.get('name') || 'import.xlsx').replace(/[\\/:*?"<>|]/g, '_')
  const target = path.join(TEMP_DIR, `upload-${Date.now()}-${name}`)
  fs.writeFileSync(target, buffer)
  try {
    const preview = await io.prepareImport(target)
    send(res, 200, JSON.stringify({ ok: true, data: preview }))
  } catch (error) {
    send(res, 200, JSON.stringify({ ok: false, error: (error as Error).message }))
  }
}

function serveExport(res: http.ServerResponse, kind: 'json' | 'xlsx'): void {
  try {
    const name =
      kind === 'json'
        ? `速记备份_${new Date().toISOString().slice(0, 10)}.json`
        : `速记导出_${new Date().toISOString().slice(0, 10)}.xlsx`
    const target = path.join(TEMP_DIR, name)
    const bytes = kind === 'json' ? io.exportJsonTo(target) : null
    if (kind === 'xlsx') {
      io.exportExcelTo(target).then((size) => {
        res.writeHead(200, {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
          'Content-Length': size
        })
        res.end(fs.readFileSync(target))
      })
      return
    }
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Content-Length': bytes ?? 0
    })
    res.end(fs.readFileSync(target))
  } catch (error) {
    send(res, 500, (error as Error).message, 'text/plain; charset=utf-8')
  }
}

function serveTemplate(res: http.ServerResponse): void {
  const target = path.join(TEMP_DIR, '速记-导入模板.xlsx')
  io.writeTemplate(target)
    .then((size) => {
      res.writeHead(200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('速记-导入模板.xlsx')}`,
        'Content-Length': size
      })
      res.end(fs.readFileSync(target))
    })
    .catch((error: Error) => send(res, 500, error.message, 'text/plain; charset=utf-8'))
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1')
  const pathname = decodeURIComponent(url.pathname)

  if (pathname === '/') {
    serveIndex(res)
    return
  }

  if (pathname === '/shim.js') {
    send(res, 200, fs.readFileSync(SHIM, 'utf8'))
    return
  }

  if (pathname === '/api' && req.method === 'POST') {
    void readBody(req)
      .then((buffer) => {
        const payload = JSON.parse(buffer.toString('utf8') || '{}')
        const key = `${payload.domain}.${payload.method}`
        const fn = handlers[key]
        if (!fn) throw new Error(`未知接口：${key}`)
        const data = fn(...(payload.args || []))
        return Promise.resolve(data).then((result) => send(res, 200, JSON.stringify({ ok: true, data: result ?? null })))
      })
      .catch((error: Error) => send(res, 200, JSON.stringify({ ok: false, error: error.message || '操作失败' })))
    return
  }

  if (pathname === '/file/template') {
    serveTemplate(res)
    return
  }

  if (pathname === '/file/export-json') {
    serveExport(res, 'json')
    return
  }

  if (pathname === '/file/export-excel') {
    serveExport(res, 'xlsx')
    return
  }

  if (pathname === '/import/upload' && req.method === 'POST') {
    void handleImportUpload(req, res, url).catch((error: Error) => send(res, 500, error.message))
    return
  }

  const filePath = path.join(RENDERER_DIR, pathname)
  if (filePath.startsWith(RENDERER_DIR) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    })
    res.end(fs.readFileSync(filePath))
    return
  }

  send(res, 404, 'not found', 'text/plain; charset=utf-8')
})

const PORT_START = Number(process.env.SUJI_PORT || 45871)

/** 已有实例在跑？返回它的端口，避免重复起服务、避免多个进程抢同一个数据库 */
async function detectRunning(): Promise<number | null> {
  for (let p = PORT_START; p < PORT_START + 10; p += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${p}/`, { signal: AbortSignal.timeout(500) })
      const html = await response.text()
      if (html.includes('/shim.js')) return p
    } catch {
      /* 端口没人监听 */
    }
  }
  return null
}

function startServer(port: number): void {
  server.once('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE' && port < PORT_START + 10) {
      startServer(port + 1)
      return
    }
    fatal(`服务监听失败：${error.message}`)
  })
  server.listen(port, '127.0.0.1', () => {
    console.log(`速记 浏览器模式已启动：http://127.0.0.1:${port}`)
    fs.writeFileSync(path.join(dataDir, 'server-port.txt'), String(port))
    console.log(`数据文件：${path.join(dataDir, 'suji.db')}`)
    console.log('关闭这个窗口即停止服务。')
  })
}

async function boot(): Promise<void> {
  const running = await detectRunning()
  if (running) {
    // 已有实例：只写回端口，让启动器直接打开既有窗口，本进程立即退出
    fs.writeFileSync(path.join(dataDir, 'server-port.txt'), String(running))
    console.log(`速记 已经在运行（端口 ${running}），本次不再重复启动。`)
    process.exit(0)
  }
  startServer(PORT_START)
}

void boot()
