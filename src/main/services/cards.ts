import { randomUUID } from 'node:crypto'
import { getDb, nowIso, type SqlParam } from '../db'
import type { CardDetail, CardFilter, CardInput, CardSummary, Tag } from '../../shared/types'
import { refLocations } from './tree'
import { purgeHistory, record } from './history'
import { toPlainText } from '../util/rich'

interface CardRow {
  id: string
  front: string
  back: string
  source: string
  created_at: string
  updated_at: string
  ref_count: number
}

const MAX_TEXT = 10000

function normalize(input: CardInput): { front: string; back: string; tagIds: string[] } {
  const front = (input?.front ?? '').trim()
  const back = (input?.back ?? '').trim()
  const plainFront = toPlainText(front)
  const plainBack = toPlainText(back)
  if (!plainFront) throw new Error('卡片正面（题干）不能为空')
  if (plainFront.length > MAX_TEXT) throw new Error('卡片正面内容过长（上限 10000 字）')
  if (plainBack.length > MAX_TEXT) throw new Error('卡片背面内容过长（上限 10000 字）')
  const tagIds = Array.from(new Set((input?.tagIds ?? []).filter(Boolean)))
  return { front, back, tagIds }
}

function tagsFor(db = getDb()): Map<string, Tag[]> {
  const rows = db.all<{ card_id: string; id: string; name: string }>(
    `SELECT ct.card_id, t.id, t.name FROM card_tags ct JOIN tags t ON t.id = ct.tag_id ORDER BY t.name ASC`
  )
  const map = new Map<string, Tag[]>()
  for (const r of rows) {
    const list = map.get(r.card_id) ?? []
    list.push({ id: r.id, name: r.name, count: 0 })
    map.set(r.card_id, list)
  }
  return map
}

function mapCard(row: CardRow, tags: Tag[]): CardSummary {
  return {
    id: row.id,
    front: row.front,
    back: row.back,
    tags,
    refCount: Number(row.ref_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

const SELECT_CARD = `
  SELECT c.id, c.front, c.back, c.source, c.created_at, c.updated_at,
         (SELECT COUNT(*) FROM tree_nodes n WHERE n.card_id = c.id) AS ref_count
  FROM cards c
`

export function listCards(filter: CardFilter = {}): CardSummary[] {
  const db = getDb()
  const where: string[] = []
  const params: SqlParam[] = []

  const keyword = (filter.keyword ?? '').trim()
  if (keyword) {
    for (const term of keyword.split(/\s+/).filter(Boolean)) {
      where.push(`(c.front LIKE ? ESCAPE '\\' OR c.back LIKE ? ESCAPE '\\')`)
      const like = `%${term.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
      params.push(like, like)
    }
  }

  const tagIds = Array.from(new Set((filter.tagIds ?? []).filter(Boolean)))
  if (tagIds.length) {
    const placeholders = tagIds.map(() => '?').join(',')
    if (filter.tagMode === 'or') {
      where.push(`EXISTS (SELECT 1 FROM card_tags ct WHERE ct.card_id = c.id AND ct.tag_id IN (${placeholders}))`)
      params.push(...tagIds)
    } else {
      where.push(
        `(SELECT COUNT(DISTINCT ct.tag_id) FROM card_tags ct WHERE ct.card_id = c.id AND ct.tag_id IN (${placeholders})) = ?`
      )
      params.push(...tagIds, tagIds.length)
    }
  }

  if (filter.unmountedOnly) {
    where.push('NOT EXISTS (SELECT 1 FROM tree_nodes n WHERE n.card_id = c.id)')
  }

  const sql = `${SELECT_CARD} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY c.updated_at DESC`
  const rows = db.all<CardRow>(sql, params)
  const tagMap = tagsFor(db)
  return rows.map((r) => mapCard(r, tagMap.get(r.id) ?? []))
}

export function getCard(id: string): CardDetail {
  const db = getDb()
  const row = db.get<CardRow>(`${SELECT_CARD} WHERE c.id = ?`, [id])
  if (!row) throw new Error('该卡片不存在或已被删除')
  const tagMap = tagsFor(db)
  return { ...mapCard(row, tagMap.get(id) ?? []), refs: refLocations(id) }
}

export function createCard(input: CardInput): CardDetail {
  const db = getDb()
  const data = normalize(input)
  const now = nowIso()
  const id = randomUUID()
  db.tx(() => {
    db.run(
      `INSERT INTO cards (id, front, back, source, created_at, updated_at) VALUES (?, ?, ?, 'manual', ?, ?)`,
      [id, data.front, data.back, now, now]
    )
    for (const tagId of data.tagIds) {
      if (!db.get('SELECT id FROM tags WHERE id = ?', [tagId])) continue
      db.run('INSERT OR IGNORE INTO card_tags (card_id, tag_id) VALUES (?, ?)', [id, tagId])
    }
  })
  return getCard(id)
}

export function updateCard(id: string, input: CardInput): CardDetail {
  const db = getDb()
  const data = normalize(input)
  const exists = db.get<{ id: string }>('SELECT id FROM cards WHERE id = ?', [id])
  if (!exists) throw new Error('该卡片不存在或已被删除')
  db.tx(() => {
    const before = db.get<{ front: string; back: string }>('SELECT front, back FROM cards WHERE id = ?', [id])
    if (before) {
      if (before.front !== data.front) record('card', id, 'front', before.front)
      if (before.back !== data.back) record('card', id, 'back', before.back)
    }
    db.run('UPDATE cards SET front = ?, back = ?, updated_at = ? WHERE id = ?', [data.front, data.back, nowIso(), id])
    db.run('DELETE FROM card_tags WHERE card_id = ?', [id])
    for (const tagId of data.tagIds) {
      if (!db.get('SELECT id FROM tags WHERE id = ?', [tagId])) continue
      db.run('INSERT OR IGNORE INTO card_tags (card_id, tag_id) VALUES (?, ?)', [id, tagId])
    }
  })
  return getCard(id)
}

export function deleteCard(id: string): void {
  const db = getDb()
  if (!db.get('SELECT id FROM cards WHERE id = ?', [id])) throw new Error('该卡片不存在或已被删除')
  db.tx(() => {
    // 外键级联会同时删除所有引用节点与标签关联
    db.run('DELETE FROM cards WHERE id = ?', [id])
    purgeHistory('card', id)
  })
}

export function setCardTags(cardId: string, tagIds: string[]): CardDetail {
  const db = getDb()
  if (!db.get('SELECT id FROM cards WHERE id = ?', [cardId])) throw new Error('该卡片不存在或已被删除')
  const ids = Array.from(new Set((tagIds ?? []).filter(Boolean)))
  db.tx(() => {
    db.run('DELETE FROM card_tags WHERE card_id = ?', [cardId])
    for (const tagId of ids) {
      if (!db.get('SELECT id FROM tags WHERE id = ?', [tagId])) continue
      db.run('INSERT OR IGNORE INTO card_tags (card_id, tag_id) VALUES (?, ?)', [cardId, tagId])
    }
    db.run('UPDATE cards SET updated_at = ? WHERE id = ?', [nowIso(), cardId])
  })
  return getCard(cardId)
}

export function cardRefLocations(cardId: string) {
  return refLocations(cardId)
}
