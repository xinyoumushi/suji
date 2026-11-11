import { getDb, type SqlParam } from '../db'
import type { SearchField, SearchHit, SearchResult } from '../../shared/types'
import { refLocations } from './tree'
import { toPlainText } from '../util/rich'

const LIMIT = 300
const CONTEXT = 40

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (m) => `\\${m}`)
}

function snippetOf(text: string, terms: string[]): string {
  const source = text ?? ''
  const lower = source.toLowerCase()
  let at = -1
  for (const term of terms) {
    const idx = lower.indexOf(term.toLowerCase())
    if (idx >= 0 && (at < 0 || idx < at)) at = idx
  }
  if (at < 0) return source.slice(0, CONTEXT * 2)
  const start = Math.max(0, at - CONTEXT)
  const end = Math.min(source.length, at + CONTEXT * 2)
  return `${start > 0 ? '…' : ''}${source.slice(start, end)}${end < source.length ? '…' : ''}`
}

function rank(field: SearchField): number {
  return field === 'name' || field === 'front' ? 0 : 1
}

export function search(rawKeyword: string): SearchResult {
  const keyword = (rawKeyword ?? '').trim()
  const terms = keyword.split(/\s+/).filter(Boolean)
  const empty: SearchResult = { keyword, terms, folders: [], cards: [], total: 0 }
  if (!terms.length) return empty

  const db = getDb()
  const folders: SearchHit[] = []
  const cards: SearchHit[] = []

  // ---- 文件夹：名称 / 备注 ----
  {
    const where: string[] = ["n.node_type = 'folder'"]
    const params: SqlParam[] = []
    for (const term of terms) {
      where.push("(n.name LIKE ? ESCAPE '\\' OR n.note LIKE ? ESCAPE '\\')")
      const like = `%${escapeLike(term)}%`
      params.push(like, like)
    }
    const rows = db.all<{ id: string; name: string; note: string; parent_id: string | null }>(
      `SELECT n.id, n.name, n.note, n.parent_id FROM tree_nodes n WHERE ${where.join(' AND ')} LIMIT ${LIMIT}`,
      params
    )
    for (const row of rows) {
      const nameHit = terms.every((t) => (row.name ?? '').toLowerCase().includes(t.toLowerCase()))
      const field: SearchField = nameHit ? 'name' : 'note'
      folders.push({
        kind: 'folder',
        id: row.id,
        nodeId: row.id,
        title: row.name ?? '未命名文件夹',
        field,
        snippet: field === 'name' ? (row.note ? snippetOf(toPlainText(row.note), terms) : '') : snippetOf(toPlainText(row.note ?? ''), terms),
        paths: [],
        refCount: 0
      })
    }
    folders.sort((a, b) => rank(a.field) - rank(b.field) || a.title.localeCompare(b.title, 'zh-Hans-CN'))
  }

  // ---- 卡片：正面 / 背面 ----
  {
    const where: string[] = []
    const params: SqlParam[] = []
    for (const term of terms) {
      where.push("(c.front LIKE ? ESCAPE '\\' OR c.back LIKE ? ESCAPE '\\')")
      const like = `%${escapeLike(term)}%`
      params.push(like, like)
    }
    const rows = db.all<{ id: string; front: string; back: string; updated_at: string }>(
      `SELECT c.id, c.front, c.back, c.updated_at FROM cards c WHERE ${where.join(' AND ')}
       ORDER BY c.updated_at DESC LIMIT ${LIMIT}`,
      params
    )
    for (const row of rows) {
      const plainFront = toPlainText(row.front)
      const plainBack = toPlainText(row.back)
      const frontHit = terms.every((t) => plainFront.toLowerCase().includes(t.toLowerCase()))
      const field: SearchField = frontHit ? 'front' : 'back'
      cards.push({
        kind: 'card',
        id: row.id,
        nodeId: null,
        title: plainFront,
        field,
        snippet: snippetOf(field === 'front' ? plainFront : plainBack, terms),
        paths: refLocations(row.id),
        refCount: 0
      })
    }
    cards.sort((a, b) => rank(a.field) - rank(b.field))
  }

  return { keyword, terms, folders, cards, total: folders.length + cards.length }
}
