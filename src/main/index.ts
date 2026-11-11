import { logLine } from './logger'
import { app, BrowserWindow, dialog, ipcMain, shell, Menu } from 'electron'
import { join } from 'node:path'
import fs from 'node:fs'
import { initDb, getDb, closeDb, nowIso } from './db'
import * as tree from './services/tree'
import * as cards from './services/cards'
import * as tags from './services/tags'
import * as search from './services/search'
import * as history from './services/history'
import * as io from './services/io'

app.setName('速记')
logLine('app.setName 完成')
if (process.env.SUJI_USER_DATA) app.setPath('userData', process.env.SUJI_USER_DATA)

let mainWindow: BrowserWindow | null = null
let dataDir = ''
let dbPath = ''
let backupDir = ''

type Handler = (...args: any[]) => unknown | Promise<unknown>

function handle(channel: string, fn: Handler): void {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      const data = await fn(...args)
      return { ok: true, data }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, error: message || '操作失败' }
    }
  })
}

function readSetting(key: string): string | null {
  const row = getDb().get<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', [key])
  return row?.value ?? null
}

function writeSetting(key: string, value: string): void {
  getDb().run(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value]
  )
}

function stamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`
}

function snapshotBackup(reason: string): string {
  const target = join(backupDir, `suji-${stamp()}-${reason}.db`)
  try {
    getDb().backupTo(target)
    pruneBackups()
    return target
  } catch {
    return ''
  }
}

function pruneBackups(): void {
  try {
    const files = fs
      .readdirSync(backupDir)
      .filter((f) => f.endsWith('.db'))
      .map((f) => ({ f, t: fs.statSync(join(backupDir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)
    files.slice(10).forEach((item) => fs.rmSync(join(backupDir, item.f), { force: true }))
  } catch {
    /* 忽略清理失败 */
  }
}

function autoBackupIfNeeded(): void {
  const last = readSetting('lastAutoBackupAt')
  const now = Date.now()
  if (last && now - Number(last) < 24 * 60 * 60 * 1000) return
  const target = snapshotBackup('auto')
  if (target) writeSetting('lastAutoBackupAt', String(now))
}

function registerIpc(): void {
  handle('tree:list', () => tree.listNodes())
  handle('tree:createFolder', (parentId: string | null, name: string) => tree.createFolder(parentId, name))
  handle('tree:createRefs', (parentId: string | null, cardIds: string[]) => tree.createRefs(parentId, cardIds))
  handle('tree:rename', (id: string, name: string) => tree.renameFolder(id, name))
  handle('tree:note', (id: string, note: string) => tree.setNote(id, note))
  handle('tree:move', (nodeId: string, parentId: string | null, index: number) => tree.moveNode(nodeId, parentId, index))
  handle('tree:removeRef', (id: string) => tree.removeRef(id))
  handle('tree:deleteFolder', (id: string, strategy: 'lift' | 'detach' | 'cascade') => {
    if (strategy === 'cascade') snapshotBackup('before-cascade')
    return tree.deleteFolder(id, strategy)
  })
  handle('tree:stats', (id: string) => tree.subtreeStats(id))
  handle('tree:path', (id: string) => tree.pathOf(id))
  handle('tree:history', (id: string) => history.listHistory('folder', id))

  handle('card:list', (filter) => cards.listCards(filter))
  handle('card:get', (id: string) => cards.getCard(id))
  handle('card:create', (input) => cards.createCard(input))
  handle('card:update', (id: string, input) => cards.updateCard(id, input))
  handle('card:remove', (id: string) => cards.deleteCard(id))
  handle('card:setTags', (cardId: string, tagIds: string[]) => cards.setCardTags(cardId, tagIds))
  handle('card:refs', (cardId: string) => cards.cardRefLocations(cardId))
  handle('card:history', (id: string) => history.listHistory('card', id))

  handle('tag:list', () => tags.listTags())
  handle('tag:create', (name: string) => tags.createTag(name))
  handle('tag:rename', (id: string, name: string) => tags.renameTag(id, name))
  handle('tag:remove', (id: string) => tags.deleteTag(id))

  handle('search:query', (keyword: string) => search.search(keyword))

  handle('io:template', async () => {
    const win = mainWindow
    if (!win) return null
    const result = await dialog.showSaveDialog(win, {
      title: '保存导入模板',
      defaultPath: join(app.getPath('documents'), '速记-导入模板.xlsx'),
      filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }]
    })
    if (result.canceled || !result.filePath) return null
    const bytes = await io.writeTemplate(result.filePath)
    return { path: result.filePath, kind: 'excel', bytes }
  })

  handle('io:pickImport', async () => {
    const win = mainWindow
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: '选择要导入的 Excel 模板或 JSON 备份',
      properties: ['openFile'],
      filters: [
        { name: '速记数据文件', extensions: ['xlsx', 'json'] },
        { name: 'Excel 模板', extensions: ['xlsx'] },
        { name: 'JSON 备份', extensions: ['json'] }
      ]
    })
    if (result.canceled || !result.filePaths.length) return null
    const preview = await io.prepareImport(result.filePaths[0])
    return preview
  })

  handle('io:commitImport', (token: string, options) => {
    snapshotBackup('before-import')
    const result = io.commitImport(token, options)
    writeSetting('lastImportAt', nowIso())
    return result
  })

  handle('io:exportJson', async () => {
    const win = mainWindow
    if (!win) return null
    const result = await dialog.showSaveDialog(win, {
      title: '导出备份（JSON）',
      defaultPath: join(app.getPath('documents'), `速记备份_${stamp()}.json`),
      filters: [{ name: 'JSON 备份', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return null
    const bytes = io.exportJsonTo(result.filePath)
    writeSetting('lastExportAt', nowIso())
    return { path: result.filePath, kind: 'json', bytes }
  })

  handle('io:exportExcel', async () => {
    const win = mainWindow
    if (!win) return null
    const result = await dialog.showSaveDialog(win, {
      title: '导出 Excel（可再导入）',
      defaultPath: join(app.getPath('documents'), `速记导出_${stamp()}.xlsx`),
      filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }]
    })
    if (result.canceled || !result.filePath) return null
    const bytes = await io.exportExcelTo(result.filePath)
    writeSetting('lastExportAt', nowIso())
    return { path: result.filePath, kind: 'excel', bytes }
  })

  handle('app:info', () => {
    const db = getDb()
    const count = (sql: string) => Number(db.get<{ c: number }>(sql)?.c ?? 0)
    return {
      version: app.getVersion(),
      dataDir,
      dbPath,
      nodeCount: count('SELECT COUNT(*) AS c FROM tree_nodes'),
      cardCount: count('SELECT COUNT(*) AS c FROM cards'),
      tagCount: count('SELECT COUNT(*) AS c FROM tags'),
      importCount: count("SELECT COUNT(*) AS c FROM cards WHERE source = 'import'"),
      lastExportAt: readSetting('lastExportAt'),
      lastImportAt: readSetting('lastImportAt')
    }
  })

  handle('app:openDataDir', async () => {
    await shell.openPath(dataDir)
  })

  handle('app:backup', () => snapshotBackup('manual'))
}

function createWindow(): void {
  const iconPath = join(__dirname, '../../resources/icon.png')
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1000,
    minHeight: 640,
    show: false,
    title: '速记',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    backgroundColor: '#f7f8fb',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // 兜底：万一 ready-to-show 没触发，也不能让用户对着空气发呆
  const showFallback = setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      logLine('ready-to-show 超时，强制显示窗口（可能渲染较慢）')
      mainWindow.show()
    }
  }, 4000)
  mainWindow.on('closed', () => clearTimeout(showFallback))

  mainWindow.webContents.on('did-finish-load', () => {
    logLine('renderer 已加载')
  })
  mainWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
    logLine(`renderer 加载失败 code=${code} ${description} url=${url}`)
  })
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logLine(`渲染进程退出：${details.reason}`)
  })
  mainWindow.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2) logLine(`renderer 控制台：${message}`)
  })

  // 开发期截图（仅当设置 SUJI_SHOT_PATH 时启用）
  const shotPath = process.env.SUJI_SHOT_PATH
  if (shotPath) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        void mainWindow?.webContents
          .capturePage()
          .then((image) => {
            fs.writeFileSync(shotPath, image.toPNG())
          })
          .finally(() => app.quit())
      }, 1800)
    })
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) mainWindow.loadURL(devUrl)
  else mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}

const gotLock = app.requestSingleInstanceLock()
logLine(`单实例锁：${gotLock ? '获取成功' : '已被其他实例占用'}`)
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    try {
      Menu.setApplicationMenu(null)
      logLine(`启动 v${app.getVersion()}，electron ${process.versions.electron} / node ${process.versions.node}`)
      dataDir = join(app.getPath('userData'), 'data')
      dbPath = join(dataDir, 'suji.db')
      backupDir = join(app.getPath('userData'), 'backups')
      fs.mkdirSync(backupDir, { recursive: true })

      initDb(dbPath)
      logLine(`数据库就绪：${dbPath}`)
      autoBackupIfNeeded()
      registerIpc()
      createWindow()
      logLine('窗口已创建')

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logLine(`启动失败：${message}`)
      dialog.showErrorBox(
        '速记启动失败',
        `初始化数据时出错，程序无法继续运行。\n\n${message}\n\n数据目录：${app.getPath('userData')}`
      )
      app.quit()
    }
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    closeDb()
  })
}
