/** 轻量文本差异：取公共前后缀，中间部分标为「删掉 / 新增」，用于历史版本对比 */
export interface DiffPart {
  type: 'same' | 'del' | 'add'
  text: string
}

export interface DiffResult {
  parts: DiffPart[]
  removed: number
  added: number
  changed: boolean
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

export function diffText(oldText: string, newText: string, context = 36, maxPart = 90): DiffResult {
  const a = oldText ?? ''
  const b = newText ?? ''
  if (a === b) return { parts: [{ type: 'same', text: a }], removed: 0, added: 0, changed: false }

  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1

  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1
    endB -= 1
  }

  const removed = a.slice(start, endA)
  const added = b.slice(start, endB)
  const beforeRaw = a.slice(Math.max(0, start - context), start)
  const afterRaw = a.slice(endA, Math.min(a.length, endA + context))

  const parts: DiffPart[] = []
  if (beforeRaw) {
    parts.push({
      type: 'same',
      text: (start - context > 0 ? '…' : '') + clip(beforeRaw, context)
    })
  }
  if (removed) parts.push({ type: 'del', text: clip(removed, maxPart) })
  if (added) parts.push({ type: 'add', text: clip(added, maxPart) })
  if (afterRaw) {
    parts.push({
      type: 'same',
      text: clip(afterRaw, context) + (endA + context < a.length ? '…' : '')
    })
  }

  return { parts, removed: removed.length, added: added.length, changed: true }
}
