/**
 * 卡片正反面的富文本：纯文本 + <mark data-c="色"> 高亮。
 * 兼容历史纯文本：读取时按纯文本转义，保存时才变成 HTML。
 */

export interface HighlightColor {
  key: string
  label: string
  hex: string
}

export const HIGHLIGHT_COLORS: HighlightColor[] = [
  { key: 'y', label: '黄', hex: '#fde68a' },
  { key: 'g', label: '绿', hex: '#bbf7d0' },
  { key: 'b', label: '蓝', hex: '#bfdbfe' },
  { key: 'p', label: '粉', hex: '#fbcfe8' },
  { key: 'o', label: '橙', hex: '#fed7aa' }
]

const COLOR_KEYS = new Set(HIGHLIGHT_COLORS.map((c) => c.key))

const HTML_HINT = /<\/?(mark|div|br|span|p|b|strong|em|u)\b[^>]*>/i

export function looksLikeHtml(value: string): boolean {
  return HTML_HINT.test(value)
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 纯文本 → 可渲染的 HTML（保留换行） */
export function toHtml(value: string): string {
  if (!value) return ''
  if (!looksLikeHtml(value)) return escapeHtml(value).replace(/\r?\n/g, '<br>')
  return sanitizeHtml(value)
}

/** 富文本 → 纯文本（用于列表、树、结构图、导出） */
export function toPlain(value: string): string {
  if (!value) return ''
  if (!looksLikeHtml(value)) return value
  const doc = new DOMParser().parseFromString(`<body>${value}</body>`, 'text/html')
  const parts: string[] = []
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.nodeValue ?? '')
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as HTMLElement
    const tag = el.tagName.toLowerCase()
    if (tag === 'br') {
      parts.push('\n')
      return
    }
    if (tag === 'div' || tag === 'p') {
      if (parts.length && !parts[parts.length - 1].endsWith('\n')) parts.push('\n')
      el.childNodes.forEach(walk)
      return
    }
    el.childNodes.forEach(walk)
  }
  doc.body.childNodes.forEach(walk)
  return parts.join('').replace(/\u00a0/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

/** 只保留文本、<br>、<mark data-c>，其余标签一律拆掉 */
export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const out: string[] = []
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      out.push(escapeHtml(node.nodeValue ?? ''))
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as HTMLElement
    const tag = el.tagName.toLowerCase()
    if (tag === 'br') {
      out.push('<br>')
      return
    }
    if (tag === 'mark') {
      const raw = el.getAttribute('data-c') ?? ''
      const key = COLOR_KEYS.has(raw) ? raw : 'y'
      out.push(`<mark data-c="${key}">`)
      el.childNodes.forEach(walk)
      out.push('</mark>')
      return
    }
    if (tag === 'div' || tag === 'p') {
      if (out.length && out[out.length - 1] !== '<br>') out.push('<br>')
      el.childNodes.forEach(walk)
      return
    }
    el.childNodes.forEach(walk)
  }
  doc.body.childNodes.forEach(walk)
  return out
    .join('')
    .replace(/^(<br>)+/, '')
    .replace(/(<br>)+$/, '')
    .replace(/(<br>){3,}/g, '<br><br>')
}

function flattenMarks(root: ParentNode): void {
  root.querySelectorAll('mark').forEach((mark) => {
    const parent = mark.parentNode
    if (!parent) return
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
    parent.removeChild(mark)
  })
}

/** 给选区上色；已有高亮会被新颜色替换（不嵌套） */
export function applyHighlight(root: HTMLElement, colorKey: string): boolean {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return false
  const range = selection.getRangeAt(0)
  if (!root.contains(range.commonAncestorContainer)) return false

  const fragment = range.extractContents()
  flattenMarks(fragment)
  const mark = document.createElement('mark')
  mark.setAttribute('data-c', colorKey)
  mark.appendChild(fragment)
  range.insertNode(mark)

  const next = document.createRange()
  next.selectNodeContents(mark)
  selection.removeAllRanges()
  selection.addRange(next)
  return true
}

/** 去掉选区（或光标所在）高亮 */
export function removeHighlight(root: HTMLElement): boolean {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return false
  const range = selection.getRangeAt(0)
  if (!root.contains(range.commonAncestorContainer)) return false

  const targets = Array.from(root.querySelectorAll('mark')).filter((mark) =>
    selection.isCollapsed ? mark.contains(range.startContainer) : range.intersectsNode(mark)
  )
  if (!targets.length) return false
  targets.forEach((mark) => {
    const parent = mark.parentNode
    if (!parent) return
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
    parent.removeChild(mark)
  })
  root.normalize()
  return true
}
