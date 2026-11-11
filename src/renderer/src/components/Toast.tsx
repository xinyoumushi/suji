import { useEffect } from 'react'
import { useStore } from '../store'
import { IconAlert, IconCheck } from './Icons'

export default function Toast(): JSX.Element | null {
  const { state } = useStore()
  const toast = state.toast
  if (!toast) return null
  return (
    <div className={`toast ${toast.kind}`} key={toast.id} role="status">
      <span className="toast-icon">
        {toast.kind === 'error' ? <IconAlert size={15} /> : <IconCheck size={15} />}
      </span>
      <span>{toast.text}</span>
    </div>
  )
}

/** 全局键盘：Esc 关闭弹窗 / 退出背诵 */
export function GlobalKeys(): null {
  const { state, actions } = useStore()
  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      if (state.dialog) {
        actions.closeDialog()
        return
      }
      if (state.recite) {
        actions.reciteExit()
        return
      }
      if (state.search.open) actions.closeSearch()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [state.dialog, state.recite, state.search.open, actions])
  return null
}
