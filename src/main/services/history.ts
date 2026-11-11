import { randomUUID } from 'node:crypto'
import { getDb, nowIso } from '../db'
import type { HistoryEntry } from '../../shared/types'

export type HistoryEntity = 'card' | 'folder'
export type HistoryField = 'front' | 'back' | 'note'

export type { HistoryEntry }

/** 每个字段最多保留多少条历史 */
const LIMIT = 20

/**
 * 保存前把旧内容留一份。
 * 内容没变、或旧内容本身是空的，都不记录。
 */
export function record(entityType: HistoryEntity, entityId: string, field: HistoryField, content: string): void {
  const value = content ?? ''
  if (!value.trim()) return
  const db = getDb()

  const last = db.get<{ content: string }>(
    `SELECT content FROM content_history
     WHERE entity_type = ? AND entity_id = ? AND field = ?
     ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    [entityType, entityId, field]
  )
  if (last && last.content === value) return

  db.run(
    `INSERT INTO content_history (id, entity_type, entity_id, field, content, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [randomUUID(), entityType, entityId, field, value, nowIso()]
  )

  db.run(
    `DELETE FROM content_history WHERE id IN (
       SELECT id FROM content_history
       WHERE entity_type = ? AND entity_id = ? AND field = ?
       ORDER BY created_at DESC, rowid DESC LIMIT -1 OFFSET ?
     )`,
    [entityType, entityId, field, LIMIT]
  )
}

export function listHistory(entityType: HistoryEntity, entityId: string): HistoryEntry[] {
  const rows = getDb().all<{ id: string; field: HistoryField; content: string; created_at: string }>(
    `SELECT id, field, content, created_at FROM content_history
     WHERE entity_type = ? AND entity_id = ?
     ORDER BY created_at DESC, rowid DESC LIMIT 60`,
    [entityType, entityId]
  )
  return rows.map((row) => ({
    id: row.id,
    field: row.field,
    content: row.content,
    createdAt: row.created_at
  }))
}

export function purgeHistory(entityType: HistoryEntity, entityId: string): void {
  getDb().run('DELETE FROM content_history WHERE entity_type = ? AND entity_id = ?', [entityType, entityId])
}
