import { useEffect, useRef } from 'react'
import { applyHighlight, HIGHLIGHT_COLORS, removeHighlight, sanitizeHtml, toHtml } from '../lib/rich'

interface RichEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: number
  autoFocus?: boolean
}

/** 可上色的编辑框：选中文字 → 点颜色即可画重点 */
export default function RichEditor({ value, onChange, placeholder, minHeight = 84, autoFocus }: RichEditorProps): JSX.Element {
  const editorRef = useRef<HTMLDivElement>(null)
  const lastValue = useRef<string>('')

  useEffect(() => {
    const el = editorRef.current
    if (!el) return
    // 正在输入时不要重置 DOM，否则光标和输入法会被打断
    if (document.activeElement === el) return
    const next = toHtml(value)
    if (next !== lastValue.current && el.innerHTML !== next) {
      el.innerHTML = next
      lastValue.current = next
    }
  }, [value])

  useEffect(() => {
    if (autoFocus) editorRef.current?.focus()
  }, [autoFocus])

  const emit = (): void => {
    const el = editorRef.current
    if (!el) return
    const html = sanitizeHtml(el.innerHTML)
    lastValue.current = html
    onChange(html)
  }

  const paint = (colorKey: string): void => {
    const el = editorRef.current
    if (!el) return
    if (applyHighlight(el, colorKey)) emit()
  }

  const clearPaint = (): void => {
    const el = editorRef.current
    if (!el) return
    if (removeHighlight(el)) emit()
  }

  return (
    <div className="rich-field">
      <div className="rich-toolbar" title="选中文字后点颜色即可画重点" onMouseDown={(e) => e.preventDefault()}>
        {HIGHLIGHT_COLORS.map((color) => (
          <button
            key={color.key}
            type="button"
            className="rich-swatch"
            style={{ background: color.hex }}
            title={`标记为${color.label}色重点`}
            onClick={() => paint(color.key)}
          />
        ))}
        <button type="button" className="rich-clear" title="去掉选中文字的高亮" onClick={clearPaint}>
          清除
        </button>
      </div>
      <div
        ref={editorRef}
        className="rich-editor"
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        style={{ minHeight }}
        data-placeholder={placeholder ?? ''}
        onInput={emit}
        onBlur={emit}
      />
    </div>
  )
}
