import { toHtml } from '../lib/rich'

interface RichTextProps {
  text: string
  className?: string
}

/** 只读渲染：把纯文本 / 带高亮的富文本显示出来 */
export default function RichText({ text, className }: RichTextProps): JSX.Element {
  return (
    <div
      className={className ? `rich-body ${className}` : 'rich-body'}
      dangerouslySetInnerHTML={{ __html: toHtml(text) }}
    />
  )
}
