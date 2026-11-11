import type { TreeNode } from '../../../shared/types'
import { buildChildren } from './tree'
import { toPlain } from './rich'

export interface DiagramNode {
  id: string
  kind: 'folder' | 'card'
  label: string
  full: string
  depth: number
  row: number
  x: number
  y: number
  textW: number
  hasChildren: boolean
}

export interface DiagramLine {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface Diagram {
  nodes: DiagramNode[]
  lines: DiagramLine[]
  width: number
  height: number
  /** 每列文字起始 x，供表头/辅助线使用 */
  columns: number[]
  maxDepth: number
}

export interface DiagramOptions {
  /** 是否把卡片引用画成叶子节点 */
  includeCards: boolean
  measure: (text: string) => number
  rowHeight?: number
  /** 文字与竖线之间的留白 */
  gap?: number
  padding?: number
  /** 单个标签最多显示多少字 */
  maxLabel?: number
}

export function clipLabel(text: string, max: number): string {
  const line = (text ?? '').split('\n')[0].trim()
  if (line.length <= max) return line
  return `${line.slice(0, max)}…`
}

/**
 * 把目录树排成「左→右、方括号连接」的层级图。
 *
 * 行分配：每个叶子占一行，父节点纵向居中对齐其第一个和最后一个子节点。
 * 列分配：同层节点共用一条文字起始线，列宽取该层最宽的文字。
 */
export function buildDiagram(nodes: TreeNode[], rootId: string | null, options: DiagramOptions): Diagram {
  const rowHeight = options.rowHeight ?? 34
  const gap = options.gap ?? 22
  const padding = options.padding ?? 24
  const maxLabel = options.maxLabel ?? 26
  const children = buildChildren(nodes)
  const byId = new Map(nodes.map((n) => [n.id, n]))

  const kidsOf = (node: TreeNode): TreeNode[] => {
    const list = children.get(node.id) ?? []
    if (options.includeCards) return list
    return list.filter((child) => child.type === 'folder')
  }

  const roots = rootId ? [byId.get(rootId)].filter((n): n is TreeNode => !!n) : (children.get(null) ?? [])
  if (!roots.length) {
    return { nodes: [], lines: [], width: 0, height: 0, columns: [], maxDepth: 0 }
  }

  const rows = new Map<string, number>()
  const depths = new Map<string, number>()
  let cursor = 0

  const assign = (node: TreeNode, depth: number): number => {
    depths.set(node.id, depth)
    const kids = kidsOf(node)
    if (!kids.length) {
      const row = cursor
      cursor += 1
      rows.set(node.id, row)
      return row
    }
    const first = assign(kids[0], depth + 1)
    for (let i = 1; i < kids.length; i += 1) assign(kids[i], depth + 1)
    const last = rows.get(kids[kids.length - 1].id) ?? first
    const middle = (first + last) / 2
    rows.set(node.id, middle)
    return middle
  }

  for (const root of roots) assign(root, 0)

  const labels = new Map<string, { label: string; full: string; width: number }>()
  let maxDepth = 0
  const measureAll = (node: TreeNode): void => {
    const full =
      node.type === 'folder' ? (node.name ?? '') : toPlain(node.front ?? '').split('\n')[0].trim() || '（空卡片）'
    const label = clipLabel(full, maxLabel)
    labels.set(node.id, { label, full, width: options.measure(label) })
    maxDepth = Math.max(maxDepth, depths.get(node.id) ?? 0)
    for (const kid of kidsOf(node)) measureAll(kid)
  }
  for (const root of roots) measureAll(root)

  const colWidth: number[] = new Array(maxDepth + 1).fill(0)
  for (const [id, info] of labels) {
    const d = depths.get(id) ?? 0
    colWidth[d] = Math.max(colWidth[d], info.width)
  }

  const columns: number[] = []
  let x = padding
  for (let d = 0; d <= maxDepth; d += 1) {
    columns.push(x)
    x += colWidth[d] + gap * 2
  }

  const diagramNodes: DiagramNode[] = []
  const lines: DiagramLine[] = []

  const place = (node: TreeNode): void => {
    const depth = depths.get(node.id) ?? 0
    const row = rows.get(node.id) ?? 0
    const info = labels.get(node.id)!
    const y = padding + row * rowHeight + rowHeight / 2
    const nodeX = columns[depth]
    const kids = kidsOf(node)
    diagramNodes.push({
      id: node.id,
      kind: node.type,
      label: info.label,
      full: info.full,
      depth,
      row,
      x: nodeX,
      y,
      textW: info.width,
      hasChildren: kids.length > 0
    })

    if (kids.length) {
      const spineX = nodeX + colWidth[depth] + gap
      lines.push({ x1: nodeX + info.width, y1: y, x2: spineX, y2: y })
      const childYs = kids.map((kid) => padding + (rows.get(kid.id) ?? 0) * rowHeight + rowHeight / 2)
      lines.push({ x1: spineX, y1: childYs[0], x2: spineX, y2: childYs[childYs.length - 1] })
      for (const kidY of childYs) {
        lines.push({ x1: spineX, y1: kidY, x2: columns[depth + 1], y2: kidY })
      }
      for (const kid of kids) place(kid)
    }
  }

  for (const root of roots) place(root)

  const width = columns[maxDepth] + colWidth[maxDepth] + padding
  const height = padding * 2 + Math.max(cursor - 1, 0) * rowHeight + rowHeight

  return { nodes: diagramNodes, lines, width: Math.ceil(width), height: Math.ceil(height), columns, maxDepth }
}
