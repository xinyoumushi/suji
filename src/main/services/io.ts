import ExcelJS from 'exceljs'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { getDb, nowIso } from '../db'
import type { ImportIssue, ImportOptions, ImportPreview, ImportResult, TreeNode } from '../../shared/types'
import { listNodes } from './tree'
import { toPlainText } from '../util/rich'

const MAX_DEPTH = 10
const SHEETS = { guide: '说明', tree: '目录', cards: '卡片', tags: '标签' } as const
const HEADERS = {
  tree: ['路径', '类型', '卡片编号', '备注'],
  cards: ['编号', '正面（题干）', '背面（答案）', '标签'],
  tags: ['标签名称']
}

// ---------------------------------------------------------------- 模板

const GUIDE_LINES: string[][] = [
  ['速记 · 批量导入模板'],
  [''],
  ['填写前请先阅读本页，然后只修改「目录」「卡片」「标签」三张表。'],
  [''],
  ['一、目录表'],
  ['路径    必填。用 / 分隔层级，例如：英语/词汇/abandon。上级文件夹不需要单独写行，系统会自动补建。'],
  ['类型    必填。只能填「文件夹」或「卡片」。'],
  ['卡片编号 当类型为「卡片」时必填，对应「卡片」表里的编号；当类型为「文件夹」时留空。'],
  ['备注    选填。只有文件夹可以使用，用于记录章节说明。'],
  ['排序    行的先后顺序就是同一父文件夹下的显示顺序，靠前的显示在上面。'],
  [''],
  ['二、同一张卡片可以被引用到多个位置'],
  ['在「目录」表里让同一个「卡片编号」出现在不同路径下即可。例如 C001 同时出现在'],
  ['「英语/词汇/abandon」和「随身清单/易错词/abandon」，导入后就是一条卡片、两处引用，'],
  ['修改卡片内容时两处会同时更新。'],
  [''],
  ['三、卡片表'],
  ['编号    必填且唯一，仅用于本文件内部关联，导入后由系统重新生成。'],
  ['正面    必填，题干。'],
  ['背面    选填，答案。'],
  ['标签    选填，多个标签用分号 ; 分隔，例如：四级;高频。'],
  [''],
  ['四、标签表'],
  ['标签名称 选填。可以不写，卡片表里用到的标签会自动创建。'],
  [''],
  ['五、限制'],
  ['· 目录最多 10 层；单个名称不超过 100 字；卡片正反面各不超过 10000 字。'],
  ['· 同一路径下不能重复出现同一张卡片。'],
  ['· 导入前会先做格式检查，有错误会逐行提示，你可以修正后重新导入。'],
  ['· 建议先导出一次备份，再导入。']
]

const SAMPLE_TREE: string[][] = [
  ['英语', '文件夹', '', '公共课，按题型拆分'],
  ['英语/词汇', '文件夹', '', '大纲 1200 词，按频次排序'],
  ['英语/词汇/abandon', '卡片', 'C001', ''],
  ['英语/词汇/abandon 词组', '卡片', 'C002', ''],
  ['英语/语法', '文件夹', '', '时态与从句'],
  ['政治', '文件夹', '', ''],
  ['政治/马原/矛盾的普遍性', '卡片', 'C003', ''],
  ['随身清单', '文件夹', '', '考前速览'],
  ['随身清单/易错词/abandon', '卡片', 'C001', '']
]

const SAMPLE_CARDS: string[][] = [
  ['C001', 'abandon', 'v. 放弃；抛弃；遗弃', '四级;高频'],
  ['C002', 'abandon oneself to', '沉溺于……，纵情于……', '四级'],
  ['C003', '矛盾的普遍性', '矛盾存在于一切事物之中，并贯穿于每一事物发展过程的始终。', '马原']
]

function styleSheet(sheet: ExcelJS.Worksheet, widths: number[]): void {
  const header = sheet.getRow(1)
  header.font = { bold: true, color: { argb: 'FF1F2937' }, size: 11 }
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } }
  header.height = 22
  header.alignment = { vertical: 'middle' }
  widths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w
  })
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  sheet.eachRow((row, index) => {
    if (index === 1) return
    row.alignment = { vertical: 'top', wrapText: true }
  })
}

export function buildTemplateWorkbook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  wb.creator = '速记'
  wb.created = new Date()

  const guide = wb.addWorksheet(SHEETS.guide)
  guide.getColumn(1).width = 110
  GUIDE_LINES.forEach((line, i) => {
    const row = guide.addRow([line[0]])
    row.alignment = { wrapText: true, vertical: 'top' }
    if (i === 0) row.font = { bold: true, size: 16, color: { argb: 'FF4F46E5' } }
    else if (/^[一二三四五]、/.test(line[0])) row.font = { bold: true, size: 11 }
    else row.font = { size: 10.5, color: { argb: 'FF374151' } }
  })

  const tree = wb.addWorksheet(SHEETS.tree)
  tree.addRow(HEADERS.tree)
  SAMPLE_TREE.forEach((r) => tree.addRow(r))
  styleSheet(tree, [34, 10, 12, 30])

  const cards = wb.addWorksheet(SHEETS.cards)
  cards.addRow(HEADERS.cards)
  SAMPLE_CARDS.forEach((r) => cards.addRow(r))
  styleSheet(cards, [10, 34, 52, 18])

  const tags = wb.addWorksheet(SHEETS.tags)
  tags.addRow(HEADERS.tags)
  ;['四级', '高频', '马原'].forEach((t) => tags.addRow([t]))
  styleSheet(tags, [22])

  return wb
}

export async function writeTemplate(filePath: string): Promise<number> {
  const wb = buildTemplateWorkbook()
  const buffer = await wb.xlsx.writeBuffer()
  fs.writeFileSync(filePath, Buffer.from(buffer as ArrayBuffer))
  return fs.statSync(filePath).size
}

// ---------------------------------------------------------------- 解析

interface ParsedFolder {
  path: string
  segments: string[]
  note: string
}

interface ParsedCard {
  code: string
  front: string
  back: string
  tags: string[]
}

interface ParsedRef {
  parentSegments: string[]
  code: string
}

interface ParsedImport {
  folders: ParsedFolder[]
  cards: ParsedCard[]
  refs: ParsedRef[]
  tags: string[]
  issues: ImportIssue[]
  autoFolders: number
}

function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((t) => t.text ?? '').join('').trim()
    }
    if ('text' in value && typeof value.text === 'string') return value.text.trim()
    if ('result' in value && value.result !== undefined && value.result !== null) return String(value.result).trim()
  }
  return ''
}

function normalizeSegments(raw: string): string[] {
  return raw
    .replace(/\\/g, '/')
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== '.')
}

function splitTags(raw: string): string[] {
  return raw
    .split(/[;；,，、]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export async function parseWorkbook(filePath: string): Promise<ParsedImport> {
  const issues: ImportIssue[] = []
  const ext = path.extname(filePath).toLowerCase()
  if (ext !== '.xlsx') throw new Error('仅支持 .xlsx 格式的导入文件，请使用下载的模板填写')

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(filePath)

  const cardsSheet = wb.getWorksheet(SHEETS.cards)
  const treeSheet = wb.getWorksheet(SHEETS.tree)
  const tagsSheet = wb.getWorksheet(SHEETS.tags)
  if (!treeSheet || !cardsSheet) throw new Error('文件缺少「目录」或「卡片」工作表，请使用速记提供的模板')

  // ---- 卡片 ----
  const cards = new Map<string, ParsedCard>()
  cardsSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const code = cellText(row.getCell(1))
    const front = cellText(row.getCell(2))
    const back = cellText(row.getCell(3))
    const tagRaw = cellText(row.getCell(4))
    if (!code && !front) return
    if (!code) {
      issues.push({ sheet: SHEETS.cards, row: rowNumber, column: '编号', message: '编号不能为空', level: 'error' })
      return
    }
    if (cards.has(code)) {
      issues.push({ sheet: SHEETS.cards, row: rowNumber, column: '编号', message: `编号「${code}」重复`, level: 'error' })
      return
    }
    if (!front) {
      issues.push({ sheet: SHEETS.cards, row: rowNumber, column: '正面', message: '正面（题干）不能为空', level: 'error' })
    }
    if (front.length > 10000) {
      issues.push({ sheet: SHEETS.cards, row: rowNumber, column: '正面', message: '正面超过 10000 字', level: 'error' })
    }
    if (back.length > 10000) {
      issues.push({ sheet: SHEETS.cards, row: rowNumber, column: '背面', message: '背面超过 10000 字', level: 'error' })
    }
    cards.set(code, { code, front, back, tags: splitTags(tagRaw) })
  })

  // ---- 目录 ----
  const folders = new Map<string, ParsedFolder>()
  const refs: ParsedRef[] = []
  let autoFolders = 0

  // 先扫一遍，记录「显式声明的文件夹」，用于统计自动补建的上级
  const explicitFolders = new Set<string>()
  treeSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const rawPath = cellText(row.getCell(1))
    const type = cellText(row.getCell(2))
    if (!rawPath) return
    if (type === '文件夹' || type === '') {
      const segs = normalizeSegments(rawPath)
      if (segs.length) explicitFolders.add(segs.join('/'))
    }
  })

  const ensureFolder = (segments: string[], note = '', row?: number): boolean => {
    let current: string[] = []
    for (let i = 0; i < segments.length; i += 1) {
      const segment = segments[i]
      const isLast = i === segments.length - 1
      if (segment.length > 100) {
        issues.push({
          sheet: SHEETS.tree,
          row: row ?? 0,
          column: '路径',
          message: `名称「${segment.slice(0, 12)}…」超过 100 字`,
          level: 'error'
        })
        return false
      }
      current = [...current, segment]
      const key = current.join('/')
      if (!folders.has(key)) {
        folders.set(key, { path: key, segments: current.slice(), note: isLast ? note : '' })
        if (!explicitFolders.has(key)) autoFolders += 1
      } else if (isLast && note) {
        const existing = folders.get(key)!
        if (!existing.note) existing.note = note
      }
    }
    return true
  }

  treeSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const rawPath = cellText(row.getCell(1))
    const type = cellText(row.getCell(2))
    const code = cellText(row.getCell(3))
    const note = cellText(row.getCell(4))
    if (!rawPath && !type && !code) return
    if (!rawPath) {
      issues.push({ sheet: SHEETS.tree, row: rowNumber, column: '路径', message: '路径不能为空', level: 'error' })
      return
    }
    const segments = normalizeSegments(rawPath)
    if (!segments.length) {
      issues.push({ sheet: SHEETS.tree, row: rowNumber, column: '路径', message: '路径格式不正确', level: 'error' })
      return
    }
    if (segments.length > MAX_DEPTH) {
      issues.push({
        sheet: SHEETS.tree,
        row: rowNumber,
        column: '路径',
        message: `层级超过 ${MAX_DEPTH} 层`,
        level: 'error'
      })
      return
    }
    if (type === '文件夹' || type === '') {
      if (code) {
        issues.push({
          sheet: SHEETS.tree,
          row: rowNumber,
          column: '卡片编号',
          message: '文件夹行不需要填写卡片编号',
          level: 'warn'
        })
      }
      if (type === '') {
        issues.push({
          sheet: SHEETS.tree,
          row: rowNumber,
          column: '类型',
          message: '类型为空，已按「文件夹」处理',
          level: 'warn'
        })
      }
      ensureFolder(segments, note, rowNumber)
      return
    }
    if (type === '卡片') {
      if (!code) {
        issues.push({ sheet: SHEETS.tree, row: rowNumber, column: '卡片编号', message: '卡片行必须填写卡片编号', level: 'error' })
        return
      }
      if (!cards.has(code)) {
        issues.push({
          sheet: SHEETS.tree,
          row: rowNumber,
          column: '卡片编号',
          message: `「卡片」表中找不到编号 ${code}`,
          level: 'error'
        })
        return
      }
      if (segments.length < 1) {
        issues.push({ sheet: SHEETS.tree, row: rowNumber, column: '路径', message: '卡片必须挂在文件夹下', level: 'error' })
        return
      }
      ensureFolder(segments.slice(0, -1), '', rowNumber)
      refs.push({ parentSegments: segments.slice(0, -1), code })
      return
    }
    issues.push({
      sheet: SHEETS.tree,
      row: rowNumber,
      column: '类型',
      message: `类型只能是「文件夹」或「卡片」，当前为「${type}」`,
      level: 'error'
    })
  })

  // 同一路径下重复引用同一张卡
  const seen = new Map<string, string>()
  for (const ref of refs) {
    const key = `${ref.parentSegments.join('/')}#${ref.code}`
    if (seen.has(key)) {
      issues.push({
        sheet: SHEETS.tree,
        row: 0,
        column: '路径',
        message: `路径「${ref.parentSegments.join('/') || '根目录'}」下重复引用卡片 ${ref.code}`,
        level: 'error'
      })
    } else {
      seen.set(key, ref.code)
    }
  }

  // ---- 标签 ----
  const tags = new Set<string>()
  if (tagsSheet) {
    tagsSheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return
      const name = cellText(row.getCell(1))
      if (!name) return
      if (name.length > 30) {
        issues.push({
          sheet: SHEETS.tags,
          row: rowNumber,
          column: '标签名称',
          message: '标签名称超过 30 字',
          level: 'error'
        })
        return
      }
      tags.add(name)
    })
  }
  for (const card of cards.values()) {
    for (const tag of card.tags) {
      if (!tags.has(tag)) tags.add(tag)
    }
  }

  // 未被引用的卡片（导入后成为未挂载卡片）
  const usedCodes = new Set(refs.map((r) => r.code))
  for (const card of cards.values()) {
    if (!usedCodes.has(card.code)) {
      issues.push({
        sheet: SHEETS.cards,
        row: 0,
        column: '编号',
        message: `卡片 ${card.code} 未在「目录」中引用，导入后将出现在卡片库的「未挂载」中`,
        level: 'warn'
      })
    }
  }

  return {
    folders: Array.from(folders.values()),
    cards: Array.from(cards.values()),
    refs,
    tags: Array.from(tags),
    issues,
    autoFolders
  }
}

// ---------------------------------------------------------------- 导入提交

interface CachedImport {
  kind: 'xlsx' | 'json'
  parsed?: ParsedImport
  payload?: BackupPayload
  fileName: string
  at: number
}

interface BackupPayload {
  app: string
  kind: string
  formatVersion: number
  exportedAt: string
  nodes: Record<string, unknown>[]
  cards: Record<string, unknown>[]
  tags: Record<string, unknown>[]
  cardTags: Record<string, unknown>[]
}

const cache = new Map<string, CachedImport>()

function readBackup(filePath: string): BackupPayload {
  let raw: string
  try {
    raw = fs.readFileSync(filePath, 'utf8')
  } catch {
    throw new Error('无法读取该文件')
  }
  let payload: BackupPayload
  try {
    payload = JSON.parse(raw) as BackupPayload
  } catch {
    throw new Error('文件不是合法的 JSON，无法作为速记备份导入')
  }
  if (!payload || payload.kind !== 'suji-backup' || !Array.isArray(payload.nodes) || !Array.isArray(payload.cards)) {
    throw new Error('这不是速记导出的 JSON 备份文件')
  }
  if (payload.formatVersion > 1) throw new Error('备份来自更新版本的速记，请升级程序后再导入')
  return payload
}

export async function prepareImport(filePath: string): Promise<ImportPreview> {
  const token = randomUUID()
  const fileName = path.basename(filePath)
  const ext = path.extname(filePath).toLowerCase()
  cache.set(token, { kind: ext === '.json' ? 'json' : 'xlsx', fileName, at: Date.now() })

  if (ext === '.json') {
    const payload = readBackup(filePath)
    const folders = payload.nodes.filter((n) => n.node_type === 'folder').length
    const refs = payload.nodes.filter((n) => n.node_type === 'card').length
    cache.set(token, { kind: 'json', payload, fileName, at: Date.now() })
    return {
      token,
      fileName,
      folders,
      cards: payload.cards.length,
      refs,
      tags: payload.tags.length,
      autoFolders: 0,
      issues: [],
      errorCount: 0,
      warnCount: 0,
      canImport: payload.nodes.length > 0 || payload.cards.length > 0
    }
  }

  const parsed = await parseWorkbook(filePath)
  cache.set(token, { kind: 'xlsx', parsed, fileName, at: Date.now() })
  for (const [key, value] of cache) {
    if (Date.now() - value.at > 30 * 60 * 1000) cache.delete(key)
  }
  const errorCount = parsed.issues.filter((i) => i.level === 'error').length
  const warnCount = parsed.issues.filter((i) => i.level === 'warn').length
  return {
    token,
    fileName,
    folders: parsed.folders.length,
    cards: parsed.cards.length,
    refs: parsed.refs.length,
    tags: parsed.tags.length,
    autoFolders: parsed.autoFolders,
    issues: parsed.issues.slice(0, 200),
    errorCount,
    warnCount,
    canImport: errorCount === 0
  }
}

function existingFolderMap(): Map<string, string> {
  const nodes = listNodes()
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const map = new Map<string, string>()
  for (const node of nodes) {
    if (node.type !== 'folder') continue
    const names: string[] = []
    let cursor: TreeNode | undefined = node
    let guard = 0
    while (cursor && guard < 64) {
      names.unshift(cursor.name ?? '')
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
      guard += 1
    }
    const key = names.join('/')
    if (!map.has(key)) map.set(key, node.id)
  }
  return map
}

export function isImportCacheValid(token: string): boolean {
  return cache.has(token)
}

/** 从 JSON 备份整体还原：保留原始 ID 与排序，保证结构完全一致 */
function restoreBackup(payload: BackupPayload): ImportResult {
  const db = getDb()
  const now = nowIso()
  const result: ImportResult = { folders: 0, cards: 0, refs: 0, tags: 0, reusedCards: 0 }
  if (!payload.nodes.length && !payload.cards.length) throw new Error('备份里没有可还原的数据')

  const nodeById = new Map<string, Record<string, unknown>>()
  for (const node of payload.nodes) nodeById.set(String(node.id), node)

  const depth = (node: Record<string, unknown>, guard = 0): number => {
    const parent = node.parent_id ? nodeById.get(String(node.parent_id)) : undefined
    if (!parent || guard > 64) return 0
    return 1 + depth(parent, guard + 1)
  }
  // 先父后子，避免外键约束报错
  const ordered = [...payload.nodes].sort((a, b) => depth(a) - depth(b))

  db.tx(() => {
    db.run('DELETE FROM tree_nodes')
    db.run('DELETE FROM cards')
    db.run('DELETE FROM tags')

    for (const tag of payload.tags) {
      db.run('INSERT OR REPLACE INTO tags (id, name, created_at) VALUES (?, ?, ?)', [
        String(tag.id),
        String(tag.name),
        String(tag.created_at ?? now)
      ])
      result.tags += 1
    }

    for (const card of payload.cards) {
      db.run(
        'INSERT OR REPLACE INTO cards (id, front, back, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [
          String(card.id),
          String(card.front ?? ''),
          String(card.back ?? ''),
          String(card.source ?? 'import'),
          String(card.created_at ?? now),
          String(card.updated_at ?? now)
        ]
      )
      result.cards += 1
    }

    for (const node of ordered) {
      db.run(
        `INSERT OR REPLACE INTO tree_nodes (id, parent_id, node_type, name, note, card_id, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          String(node.id),
          node.parent_id ? String(node.parent_id) : null,
          String(node.node_type),
          node.name === null || node.name === undefined ? null : String(node.name),
          String(node.note ?? ''),
          node.card_id ? String(node.card_id) : null,
          Number(node.sort_order ?? 0),
          String(node.created_at ?? now),
          String(node.updated_at ?? now)
        ]
      )
      if (node.node_type === 'folder') result.folders += 1
      else result.refs += 1
    }

    for (const link of payload.cardTags) {
      db.run('INSERT OR IGNORE INTO card_tags (card_id, tag_id) VALUES (?, ?)', [
        String(link.card_id),
        String(link.tag_id)
      ])
    }
  })

  return result
}

export function commitImport(token: string, options: ImportOptions): ImportResult {
  const entry = cache.get(token)
  if (!entry) throw new Error('导入数据已过期，请重新选择文件')
  if (entry.kind === 'json') {
    const result = restoreBackup(entry.payload!)
    cache.delete(token)
    return result
  }
  const parsed = entry.parsed!
  if (parsed.issues.some((i) => i.level === 'error')) throw new Error('文件中仍有错误，无法导入')
  if (!parsed.folders.length && !parsed.cards.length) throw new Error('文件里没有可导入的数据')

  const db = getDb()
  const now = nowIso()
  const result: ImportResult = { folders: 0, cards: 0, refs: 0, tags: 0, reusedCards: 0 }

  db.tx(() => {
    if (options.mode === 'replace') {
      db.run('DELETE FROM tree_nodes')
      db.run('DELETE FROM cards')
      db.run('DELETE FROM tags')
    }

    // 标签
    const tagIdByName = new Map<string, string>()
    for (const row of db.all<{ id: string; name: string }>('SELECT id, name FROM tags')) {
      tagIdByName.set(row.name.toLowerCase(), row.id)
    }
    for (const name of parsed.tags) {
      const key = name.toLowerCase()
      if (tagIdByName.has(key)) continue
      const id = randomUUID()
      db.run('INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)', [id, name, now])
      tagIdByName.set(key, id)
      result.tags += 1
    }

    // 文件夹（按路径逐级创建）
    const folderId = existingFolderMap()
    let orderByParent = new Map<string, number>()
    const nextOrder = (parentId: string | null): number => {
      const key = parentId ?? '$root'
      if (!orderByParent.has(key)) {
        const max = db.get<{ m: number | null }>(
          'SELECT MAX(sort_order) AS m FROM tree_nodes WHERE parent_id IS ?',
          [parentId]
        )
        orderByParent.set(key, Number(max?.m ?? 0))
      }
      const next = (orderByParent.get(key) ?? 0) + 1024
      orderByParent.set(key, next)
      return next
    }

    for (const folder of parsed.folders) {
      if (folderId.has(folder.path)) continue
      const parentPath = folder.segments.slice(0, -1).join('/')
      const parentId = parentPath ? (folderId.get(parentPath) ?? null) : null
      const id = randomUUID()
      db.run(
        `INSERT INTO tree_nodes (id, parent_id, node_type, name, note, card_id, sort_order, created_at, updated_at)
         VALUES (?, ?, 'folder', ?, ?, NULL, ?, ?, ?)`,
        [id, parentId, folder.segments[folder.segments.length - 1], folder.note ?? '', nextOrder(parentId), now, now]
      )
      folderId.set(folder.path, id)
      result.folders += 1
    }

    // 卡片
    const cardIdByCode = new Map<string, string>()
    const existingByFront = new Map<string, string>()
    for (const row of db.all<{ id: string; front: string }>('SELECT id, front FROM cards')) {
      const key = row.front.trim()
      if (!existingByFront.has(key)) existingByFront.set(key, row.id)
    }
    const validTagIds = new Set(db.all<{ id: string }>('SELECT id FROM tags').map((r) => r.id))
    const tagResolve = (name: string): string | null => tagIdByName.get(name.toLowerCase()) ?? null

    for (const card of parsed.cards) {
      const existing = existingByFront.get(card.front)
      if (options.reuseExistingCards && existing) {
        cardIdByCode.set(card.code, existing)
        result.reusedCards += 1
        continue
      }
      const id = randomUUID()
      db.run(
        `INSERT INTO cards (id, front, back, source, created_at, updated_at) VALUES (?, ?, ?, 'import', ?, ?)`,
        [id, card.front, card.back, now, now]
      )
      for (const tagName of card.tags) {
        const tagId = tagResolve(tagName)
        if (tagId && validTagIds.has(tagId)) db.run('INSERT OR IGNORE INTO card_tags (card_id, tag_id) VALUES (?, ?)', [id, tagId])
      }
      cardIdByCode.set(card.code, id)
      existingByFront.set(card.front, id)
      result.cards += 1
    }

    // 引用挂载
    for (const ref of parsed.refs) {
      const parentPath = ref.parentSegments.join('/')
      const parentId = parentPath ? (folderId.get(parentPath) ?? null) : null
      const cardId = cardIdByCode.get(ref.code)
      if (!cardId) continue
      db.run(
        `INSERT INTO tree_nodes (id, parent_id, node_type, name, note, card_id, sort_order, created_at, updated_at)
         VALUES (?, ?, 'card', NULL, '', ?, ?, ?, ?)`,
        [randomUUID(), parentId, cardId, nextOrder(parentId), now, now]
      )
      result.refs += 1
    }
  })

  cache.delete(token)
  return result
}

// ---------------------------------------------------------------- 导出

export function buildExportPayload() {
  const db = getDb()
  const nodes = db.all<Record<string, unknown>>(
    `SELECT id, parent_id, node_type, name, note, card_id, sort_order, created_at, updated_at
     FROM tree_nodes ORDER BY sort_order ASC`
  )
  const cards = db.all<Record<string, unknown>>('SELECT * FROM cards ORDER BY created_at ASC')
  const tags = db.all<Record<string, unknown>>('SELECT * FROM tags ORDER BY name ASC')
  const cardTags = db.all<Record<string, unknown>>('SELECT card_id, tag_id FROM card_tags')
  return {
    app: '速记',
    kind: 'suji-backup',
    formatVersion: 1,
    exportedAt: nowIso(),
    counts: { nodes: nodes.length, cards: cards.length, tags: tags.length, cardTags: cardTags.length },
    nodes,
    cards,
    tags,
    cardTags
  }
}

export function exportJsonTo(filePath: string): number {
  const payload = buildExportPayload()
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8')
  return fs.statSync(filePath).size
}

function folderPaths(nodes: TreeNode[]): Map<string, string> {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const paths = new Map<string, string>()
  for (const node of nodes) {
    if (node.type !== 'folder') continue
    const names: string[] = []
    let cursor: TreeNode | undefined = node
    let guard = 0
    while (cursor && guard < 64) {
      names.unshift((cursor.name ?? '未命名').replace(/[\\/]/g, ' '))
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
      guard += 1
    }
    paths.set(node.id, names.join('/'))
  }
  return paths
}

export async function exportExcelTo(filePath: string): Promise<number> {
  const db = getDb()
  const nodes = listNodes()
  const paths = folderPaths(nodes)
  const cards = db.all<{ id: string; front: string; back: string; created_at: string }>(
    'SELECT id, front, back, created_at FROM cards ORDER BY created_at ASC'
  )
  const tagsByCard = new Map<string, string[]>()
  for (const row of db.all<{ card_id: string; name: string }>(
    'SELECT ct.card_id, t.name FROM card_tags ct JOIN tags t ON t.id = ct.tag_id ORDER BY t.name ASC'
  )) {
    const list = tagsByCard.get(row.card_id) ?? []
    list.push(row.name)
    tagsByCard.set(row.card_id, list)
  }

  const codeOf = new Map<string, string>()
  cards.forEach((card, index) => codeOf.set(card.id, `C${String(index + 1).padStart(3, '0')}`))

  const wb = new ExcelJS.Workbook()
  wb.creator = '速记'
  wb.created = new Date()

  const guide = wb.addWorksheet(SHEETS.guide)
  guide.getColumn(1).width = 100
  const exportAt = new Date().toLocaleString('zh-CN')
  ;[
    ['速记 · 数据导出'],
    [''],
    [`导出时间：${exportAt}`],
    [`节点 ${nodes.length} 个 · 卡片 ${cards.length} 张 · 标签 ${db.all('SELECT id FROM tags').length} 个`],
    [''],
    ['本文件与导入模板结构一致，可以直接再次导入以还原目录结构、备注、卡片与标签。'],
    ['如需完整无损备份（含内部 ID），请使用「导出 JSON」。']
  ].forEach((line, i) => {
    const row = guide.addRow([line[0]])
    row.font = i === 0 ? { bold: true, size: 15, color: { argb: 'FF4F46E5' } } : { size: 10.5 }
  })

  const tree = wb.addWorksheet(SHEETS.tree)
  tree.addRow(HEADERS.tree)
  for (const node of nodes) {
    if (node.type === 'folder') {
      tree.addRow([paths.get(node.id) ?? node.name, '文件夹', '', toPlainText(node.note ?? '')])
    } else {
      const parent = node.parentId ? paths.get(node.parentId) : ''
      const label = toPlainText(node.front ?? '').split('\n')[0].slice(0, 24).replace(/[\\/]/g, ' ')
      tree.addRow([[parent, label].filter(Boolean).join('/'), '卡片', codeOf.get(node.cardId ?? '') ?? '', ''])
    }
  }
  styleSheet(tree, [34, 10, 12, 30])

  const cardSheet = wb.addWorksheet(SHEETS.cards)
  cardSheet.addRow(HEADERS.cards)
  for (const card of cards) {
    cardSheet.addRow([codeOf.get(card.id), toPlainText(card.front), toPlainText(card.back), (tagsByCard.get(card.id) ?? []).join(';')])
  }
  styleSheet(cardSheet, [10, 34, 52, 18])

  const tagSheet = wb.addWorksheet(SHEETS.tags)
  tagSheet.addRow(HEADERS.tags)
  for (const row of db.all<{ name: string }>('SELECT name FROM tags ORDER BY name ASC')) tagSheet.addRow([row.name])
  styleSheet(tagSheet, [22])

  const buffer = await wb.xlsx.writeBuffer()
  fs.writeFileSync(filePath, Buffer.from(buffer as ArrayBuffer))
  return fs.statSync(filePath).size
}
