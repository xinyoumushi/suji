/** 主进程用的富文本 → 纯文本（无 DOM 环境） */
export function toPlainText(value: string): string {
  if (!value) return ''
  if (!/<[a-z/][^>]*>/i.test(value)) return value
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
