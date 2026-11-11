import { randomUUID } from 'node:crypto'
import { getDb, nowIso } from '../db'
import { purgeHistory, record } from './history'
import type { DeleteStrategy, NodePath, SubtreeStats, TreeNode } from '../../shared/types'

const MAX_DEPTH = 10
const ORDER_STEP = 1024

interface NodeRow {
  id: string
  parent_id: string | null
  node_type: 'folder' | 'card'
  name: string | null
  note: string
  card_id: string | null
  sort_order: number
  created_at: string
  updated_at: string
  front?: string | null
  back?: string | null
  child_count?: number
}

interface SiblingRow {
  id: string
  sort_order: number
}

const SELECT_NODE = `
  SELECT n.id, n.parent_id, n.node_type, n.name, n.note, n.card_id, n.sort_order,
         n.created_at, n.updated_at,
         c.front AS front, c.back AS back,
         (SELECT COUNT(*) FROM tree_nodes ch WHERE ch.parent_id = n.id) AS child_count
  FROM tree_nodes n
  LEFT JOIN cards c ON c.id = n.card_id
`

function mapNode(row: NodeRow): TreeNode {
  return {
    id: row.id,
    parentId: row.parent_id,
    type: row.node_type,
    name: row.name,
    note: row.note ?? '',
    cardId: row.card_id,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    front: row.front ?? null,
    back: row.back ?? null,
    childCount: Number(row.child_count ?? 0)
  }
}

function getNode(id: string): NodeRow {
  const row = getDb().get<NodeRow>(`${SELECT_NODE} WHERE n.id = ?`, [id])
  if (!row) throw new Error('该节点不存在或已被删除')
  return row
}

function assertFolderParent(parentId: string | null): void {
  if (!parentId) return
  const parent = getNode(parentId)
  if (parent.node_type !== 'folder') throw new Error('卡片引用节点下不能再添加子节点')
}

/** 从某节点向上的层级数（根为 0） */
function depthOf(nodeId: string | null): number {
  if (!nodeId) return 0
  const row = getDb().get<{ d: number }>(
    `WITH RECURSIVE up(id, parent_id, d) AS (
       SELECT id, parent_id, 0 FROM tree_nodes WHERE id = ?
       UNION ALL
       SELECT t.id, t.parent_id, up.d + 1 FROM tree_nodes t JOIN up ON t.id = up.parent_id
     )
     SELECT MAX(d) AS d FROM up`,
    [nodeId]
  )
  return Number(row?.d ?? 0)
}

/** 以该节点为根的子树高度（叶子为 0） */
function heightOf(nodeId: string): number {
  const row = getDb().get<{ h: number }>(
    `WITH RECURSIVE down(id, d) AS (
       SELECT id, 0 FROM tree_nodes WHERE id = ?
       UNION ALL
       SELECT t.id, down.d + 1 FROM tree_nodes t JOIN down ON t.parent_id = down.id
     )
     SELECT MAX(d) AS h FROM down`,
    [nodeId]
  )
  return Number(row?.h ?? 0)
}

function subtreeIds(rootId: string): string[] {
  const rows = getDb().all<{ id: string }>(
    `WITH RECURSIVE sub(id) AS (
       SELECT id FROM tree_nodes WHERE id = ?
       UNION ALL
       SELECT t.id FROM tree_nodes t JOIN sub ON t.parent_id = sub.id
     )
     SELECT id FROM sub`,
    [rootId]
  )
  return rows.map((r) => r.id)
}

function siblingsOf(parentId: string | null, excludeId?: string): SiblingRow[] {
  const db = getDb()
  const rows = excludeId
    ? db.all<SiblingRow>(
        'SELECT id, sort_order FROM tree_nodes WHERE parent_id IS ? AND id <> ? ORDER BY sort_order ASC',
        [parentId, excludeId]
      )
    : db.all<SiblingRow>('SELECT id, sort_order FROM tree_nodes WHERE parent_id IS ? ORDER BY sort_order ASC', [
        parentId
      ])
  return rows
}

function renumber(ids: string[]): void {
  const db = getDb()
  const now = nowIso()
  ids.forEach((id, i) => {
    db.run('UPDATE tree_nodes SET sort_order = ?, updated_at = ? WHERE id = ?', [(i + 1) * ORDER_STEP, now, id])
  })
}

function loadIndex(): Map<string, { id: string; parentId: string | null; name: string | null; type: string }> {
  const rows = getDb().all<{ id: string; parent_id: string | null; name: string | null; node_type: string }>(
    'SELECT id, parent_id, name, node_type FROM tree_nodes'
  )
  const map = new Map<string, { id: string; parentId: string | null; name: string | null; type: string }>()
  for (const r of rows) map.set(r.id, { id: r.id, parentId: r.parent_id, name: r.name, type: r.node_type })
  return map
}

function chainOf(
  index: Map<string, { id: string; parentId: string | null; name: string | null; type: string }>,
  parentId: string | null
): { id: string; name: string }[] {
  const chain: { id: string; name: string }[] = []
  let cursor = parentId
  let guard = 0
  while (cursor && guard < 64) {
    const node = index.get(cursor)
    if (!node) break
    chain.unshift({ id: node.id, name: node.name ?? '' })
    cursor = node.parentId
    guard += 1
  }
  return chain
}

export function listNodes(): TreeNode[] {
  const rows = getDb().all<NodeRow>(`${SELECT_NODE} ORDER BY n.sort_order ASC, n.created_at ASC`)
  return rows.map(mapNode)
}

export function createFolder(parentId: string | null, name: string, note = ''): TreeNode {
  const trimmed = (name ?? '').trim()
  if (!trimmed) throw new Error('文件夹名称不能为空')
  if (trimmed.length > 100) throw new Error('文件夹名称不能超过 100 个字符')
  assertFolderParent(parentId)
  if (depthOf(parentId) + 1 > MAX_DEPTH) throw new Error(`目录层级最多 ${MAX_DEPTH} 层`)

  const db = getDb()
  const siblings = siblingsOf(parentId)
  const nextOrder = siblings.length ? Number(siblings[siblings.length - 1].sort_order) + ORDER_STEP : ORDER_STEP
  const now = nowIso()
  const id = randomUUID()
  db.run(
    `INSERT INTO tree_nodes (id, parent_id, node_type, name, note, card_id, sort_order, created_at, updated_at)
     VALUES (?, ?, 'folder', ?, ?, NULL, ?, ?, ?)`,
    [id, parentId, trimmed, note ?? '', nextOrder, now, now]
  )
  return mapNode(getNode(id))
}

export function createRefs(parentId: string | null, cardIds: string[]): number {
  const ids = Array.from(new Set(cardIds.filter(Boolean)))
  if (!ids.length) throw new Error('请先选择要引用的卡片')
  assertFolderParent(parentId)
  if (depthOf(parentId) + 1 > MAX_DEPTH) throw new Error(`目录层级最多 ${MAX_DEPTH} 层`)

  const db = getDb()
  return db.tx(() => {
    let order = siblingsOf(parentId).reduce((max, s) => Math.max(max, Number(s.sort_order)), 0)
    const now = nowIso()
    let created = 0
    for (const cardId of ids) {
      const exists = db.get<{ id: string }>('SELECT id FROM cards WHERE id = ?', [cardId])
      if (!exists) continue
      order += ORDER_STEP
      db.run(
        `INSERT INTO tree_nodes (id, parent_id, node_type, name, note, card_id, sort_order, created_at, updated_at)
         VALUES (?, ?, 'card', NULL, '', ?, ?, ?, ?)`,
        [randomUUID(), parentId, cardId, order, now, now]
      )
      created += 1
    }
    return created
  })
}

export function renameFolder(id: string, name: string): void {
  const node = getNode(id)
  if (node.node_type !== 'folder') throw new Error('只有文件夹可以重命名')
  const trimmed = (name ?? '').trim()
  if (!trimmed) throw new Error('文件夹名称不能为空')
  if (trimmed.length > 100) throw new Error('文件夹名称不能超过 100 个字符')
  getDb().run('UPDATE tree_nodes SET name = ?, updated_at = ? WHERE id = ?', [trimmed, nowIso(), id])
}

export function setNote(id: string, note: string): void {
  const node = getNode(id)
  if (node.node_type !== 'folder') throw new Error('只有文件夹可以填写备注')
  const text = note ?? ''
  if (text.length > 5000) throw new Error('备注不能超过 5000 个字符')
  if ((node.note ?? '') !== text) record('folder', id, 'note', node.note ?? '')
  getDb().run('UPDATE tree_nodes SET note = ?, updated_at = ? WHERE id = ?', [text, nowIso(), id])
}

export function moveNode(nodeId: string, parentId: string | null, index: number): void {
  const db = getDb()
  const node = getNode(nodeId)
  if (parentId === nodeId) throw new Error('不能把节点移动到它自己下面')
  assertFolderParent(parentId)
  if (parentId) {
    const target = subtreeIds(nodeId)
    if (target.includes(parentId)) throw new Error('不能把文件夹移动到它自己的子级')
  }
  if (depthOf(parentId) + 1 + heightOf(nodeId) > MAX_DEPTH) {
    throw new Error(`目录层级最多 ${MAX_DEPTH} 层，当前移动会超出限制`)
  }

  db.tx(() => {
    const siblings = siblingsOf(parentId, nodeId)
    const clamped = Math.max(0, Math.min(Number.isFinite(index) ? index : siblings.length, siblings.length))
    const ordered = siblings.map((s) => s.id)
    ordered.splice(clamped, 0, nodeId)
    const now = nowIso()
    db.run('UPDATE tree_nodes SET parent_id = ?, updated_at = ? WHERE id = ?', [parentId, now, nodeId])
    ordered.forEach((id, i) => {
      db.run('UPDATE tree_nodes SET sort_order = ?, updated_at = ? WHERE id = ?', [(i + 1) * ORDER_STEP, now, id])
    })
    if (node.parent_id !== parentId) {
      const old = siblingsOf(node.parent_id)
      renumber(old.map((s) => s.id))
    }
  })
}

export function removeRef(id: string): void {
  const node = getNode(id)
  if (node.node_type !== 'card') throw new Error('该节点不是卡片引用，请使用文件夹删除')
  const db = getDb()
  db.tx(() => {
    const parentId = node.parent_id
    db.run('DELETE FROM tree_nodes WHERE id = ?', [id])
    renumber(siblingsOf(parentId).map((s) => s.id))
  })
}

export function subtreeStats(id: string): SubtreeStats {
  const db = getDb()
  const stats = db.get<{ folders: number; refs: number; cards: number }>(
    `WITH RECURSIVE sub(id) AS (
       SELECT id FROM tree_nodes WHERE id = ?
       UNION ALL
       SELECT t.id FROM tree_nodes t JOIN sub ON t.parent_id = sub.id
     )
     SELECT
       SUM(CASE WHEN n.node_type = 'folder' THEN 1 ELSE 0 END) AS folders,
       SUM(CASE WHEN n.node_type = 'card' THEN 1 ELSE 0 END) AS refs,
       COUNT(DISTINCT CASE WHEN n.node_type = 'card' THEN n.card_id END) AS cards
     FROM tree_nodes n WHERE n.id IN (SELECT id FROM sub)`,
    [id]
  )
  const outside = db.get<{ outside: number }>(
    `WITH RECURSIVE sub(id) AS (
       SELECT id FROM tree_nodes WHERE id = ?
       UNION ALL
       SELECT t.id FROM tree_nodes t JOIN sub ON t.parent_id = sub.id
     )
     SELECT COUNT(*) AS outside FROM (
       SELECT n.card_id FROM tree_nodes n WHERE n.card_id IS NOT NULL AND n.id IN (SELECT id FROM sub)
       INTERSECT
       SELECT n.card_id FROM tree_nodes n WHERE n.card_id IS NOT NULL AND n.id NOT IN (SELECT id FROM sub)
     )`,
    [id]
  )
  return {
    folders: Number(stats?.folders ?? 0),
    refs: Number(stats?.refs ?? 0),
    cards: Number(stats?.cards ?? 0),
    cardsOutside: Number(outside?.outside ?? 0)
  }
}

/**
 * 删除文件夹。三种策略：
 * lift    —— 只删除这一层，子节点上移到父级并保持相对顺序
 * detach  —— 删除整棵子树中的目录与引用节点，卡片本体保留
 * cascade —— 删除整棵子树，并删除子树内所有卡片本体
 */
export function deleteFolder(id: string, strategy: DeleteStrategy): SubtreeStats {
  const db = getDb()
  const node = getNode(id)
  if (node.node_type !== 'folder') throw new Error('只有文件夹可以使用该删除方式')
  const stats = subtreeStats(id)

  db.tx(() => {
    const now = nowIso()
    if (strategy === 'lift') {
      const parentId = node.parent_id
      const children = db.all<{ id: string }>(
        'SELECT id FROM tree_nodes WHERE parent_id = ? ORDER BY sort_order ASC',
        [id]
      )
      db.run('UPDATE tree_nodes SET parent_id = ?, updated_at = ? WHERE parent_id = ?', [parentId, now, id])
      const siblings = siblingsOf(parentId, id)
      const order = siblings.map((s) => s.id)
      const position = siblings.filter((s) => Number(s.sort_order) < Number(node.sort_order)).length
      order.splice(Math.min(position, order.length), 0, ...children.map((c) => c.id))
      db.run('DELETE FROM tree_nodes WHERE id = ?', [id])
      purgeHistory('folder', id)
      order.forEach((nid, i) => {
        db.run('UPDATE tree_nodes SET sort_order = ?, updated_at = ? WHERE id = ?', [(i + 1) * ORDER_STEP, now, nid])
      })
      return
    }

    const ids = subtreeIds(id)
    if (strategy === 'detach') {
      db.run('DELETE FROM tree_nodes WHERE id = ?', [id])
      for (const nodeId of ids) purgeHistory('folder', nodeId)
      renumber(siblingsOf(node.parent_id).map((s) => s.id))
      return
    }

    // cascade：先删卡片本体（外键级联清掉所有引用与标签关联），再清剩余的目录节点
    const cardIds = db
      .all<{ card_id: string }>(
        `SELECT DISTINCT card_id FROM tree_nodes WHERE card_id IS NOT NULL AND id IN (${ids.map(() => '?').join(',')})`,
        ids
      )
      .map((r) => r.card_id)
    for (const cardId of cardIds) {
      db.run('DELETE FROM cards WHERE id = ?', [cardId])
    }
    db.run('DELETE FROM tree_nodes WHERE id = ?', [id])
    for (const nodeId of ids) purgeHistory('folder', nodeId)
    renumber(siblingsOf(node.parent_id).map((s) => s.id))
  })
  return stats
}

export function pathOf(nodeId: string): { id: string; name: string }[] {
  const index = loadIndex()
  const node = index.get(nodeId)
  if (!node) throw new Error('该节点不存在或已被删除')
  return chainOf(index, node.parentId)
}

/** 引用位置：某张卡在目录树中的所有路径 */
export function refLocations(cardId: string): NodePath[] {
  const db = getDb()
  const nodes = db.all<{ id: string; parent_id: string | null }>(
    'SELECT id, parent_id FROM tree_nodes WHERE card_id = ? ORDER BY sort_order ASC',
    [cardId]
  )
  const index = loadIndex()
  return nodes.map((n) => ({ nodeId: n.id, folders: chainOf(index, n.parent_id) }))
}
