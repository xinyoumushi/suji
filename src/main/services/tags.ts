import { randomUUID } from 'node:crypto'
import { getDb, nowIso } from '../db'
import type { Tag } from '../../shared/types'

export function listTags(): Tag[] {
  const rows = getDb().all<{ id: string; name: string; count: number }>(
    `SELECT t.id, t.name, (SELECT COUNT(*) FROM card_tags ct WHERE ct.tag_id = t.id) AS count
     FROM tags t ORDER BY t.name ASC`
  )
  return rows.map((r) => ({ id: r.id, name: r.name, count: Number(r.count ?? 0) }))
}

function cleanName(name: string): string {
  const trimmed = (name ?? '').trim().replace(/\s+/g, ' ')
  if (!trimmed) throw new Error('标签名称不能为空')
  if (trimmed.length > 30) throw new Error('标签名称不能超过 30 个字符')
  return trimmed
}

export function createTag(name: string): Tag {
  const db = getDb()
  const value = cleanName(name)
  const exists = db.get<{ id: string }>('SELECT id FROM tags WHERE name = ? COLLATE NOCASE', [value])
  if (exists) throw new Error(`标签「${value}」已存在`)
  const id = randomUUID()
  db.run('INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)', [id, value, nowIso()])
  return { id, name: value, count: 0 }
}

export function renameTag(id: string, name: string): Tag {
  const db = getDb()
  const value = cleanName(name)
  const tag = db.get<{ id: string }>('SELECT id FROM tags WHERE id = ?', [id])
  if (!tag) throw new Error('该标签不存在')
  const dup = db.get<{ id: string }>('SELECT id FROM tags WHERE name = ? COLLATE NOCASE AND id <> ?', [value, id])
  if (dup) throw new Error(`标签「${value}」已存在`)
  db.run('UPDATE tags SET name = ? WHERE id = ?', [value, id])
  const count = db.get<{ c: number }>('SELECT COUNT(*) AS c FROM card_tags WHERE tag_id = ?', [id])
  return { id, name: value, count: Number(count?.c ?? 0) }
}

export function deleteTag(id: string): void {
  const db = getDb()
  if (!db.get('SELECT id FROM tags WHERE id = ?', [id])) throw new Error('该标签不存在')
  // 仅解除关联，卡片本体不受影响
  db.run('DELETE FROM tags WHERE id = ?', [id])
}
