import type { TreeNode } from '../../../shared/types'

export function buildChildren(nodes: TreeNode[]): Map<string | null, TreeNode[]> {
  const map = new Map<string | null, TreeNode[]>()
  for (const node of nodes) {
    const key = node.parentId
    const list = map.get(key)
    if (list) list.push(node)
    else map.set(key, [node])
  }
  for (const list of map.values()) list.sort((a, b) => a.sortOrder - b.sortOrder)
  return map
}

export function byId(nodes: TreeNode[]): Map<string, TreeNode> {
  return new Map(nodes.map((n) => [n.id, n]))
}

/** 自根到父节点的祖先 id 列表 */
export function ancestorsOf(nodes: TreeNode[], id: string): string[] {
  const map = byId(nodes)
  const result: string[] = []
  let cursor = map.get(id)
  let guard = 0
  while (cursor?.parentId && guard < 64) {
    result.unshift(cursor.parentId)
    cursor = map.get(cursor.parentId)
    guard += 1
  }
  return result
}

export function pathLabels(nodes: TreeNode[], id: string): string[] {
  const map = byId(nodes)
  const labels: string[] = []
  let cursor = map.get(id)
  let guard = 0
  while (cursor && guard < 64) {
    labels.unshift(cursor.type === 'folder' ? cursor.name ?? '未命名' : (cursor.front ?? '').split('\n')[0].slice(0, 24))
    cursor = cursor.parentId ? map.get(cursor.parentId) : undefined
    guard += 1
  }
  return labels
}

/** 深度优先收集某个文件夹（含自身）下的卡片引用节点 id，按树顺序 */
export function collectCardNodes(nodes: TreeNode[], folderId: string | null): string[] {
  const children = buildChildren(nodes)
  const result: string[] = []
  const walk = (id: string | null): void => {
    for (const child of children.get(id) ?? []) {
      if (child.type === 'card') result.push(child.id)
      else walk(child.id)
    }
  }
  walk(folderId)
  return result
}

export function countDescendants(nodes: TreeNode[], id: string): { folders: number; cards: number } {
  const children = buildChildren(nodes)
  let folders = 0
  let cards = 0
  const walk = (nodeId: string): void => {
    for (const child of children.get(nodeId) ?? []) {
      if (child.type === 'folder') {
        folders += 1
        walk(child.id)
      } else {
        cards += 1
      }
    }
  }
  walk(id)
  return { folders, cards }
}

export function firstLine(text: string | null | undefined, max = 60): string {
  const line = (text ?? '').split('\n')[0].trim()
  return line.length > max ? `${line.slice(0, max)}…` : line
}
