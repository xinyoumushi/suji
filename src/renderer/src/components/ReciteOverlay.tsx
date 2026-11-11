import { useEffect } from 'react'
import { useStore } from '../store'
import FlipCard from './FlipCard'
import { IconArrowLeft, IconArrowRight, IconFlip, IconX } from './Icons'

export default function ReciteOverlay(): JSX.Element | null {
  const { state, actions } = useStore()
  const recite = state.recite

  useEffect(() => {
    if (!recite) return
    const handler = (event: KeyboardEvent): void => {
      if (event.key === ' ') {
        event.preventDefault()
        actions.reciteFlip()
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        actions.reciteNext()
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        actions.recitePrev()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [recite, actions])

  if (!recite) return null
  const node = state.nodes.find((n) => n.id === recite.queue[recite.index])
  const total = recite.queue.length
  const percent = total ? ((recite.index + 1) / total) * 100 : 0

  return (
    <div className="recite">
      <header className="recite-head">
        <span className="recite-title">{recite.title}</span>
        <span className="recite-count">
          {recite.index + 1} / {total}
        </span>
        <button type="button" className="icon-btn" onClick={actions.reciteExit} title="退出背诵 (Esc)">
          <IconX size={18} />
        </button>
      </header>

      <div className="recite-stage">
        <FlipCard
          front={node?.front ?? ''}
          back={node?.back ?? ''}
          flipped={recite.flipped}
          onFlip={actions.reciteFlip}
          size="large"
        />
      </div>

      <div className="recite-bar">
        <button type="button" className="btn ghost" disabled={recite.index === 0} onClick={actions.recitePrev}>
          <IconArrowLeft size={15} /> 上一张
        </button>
        <button type="button" className="btn primary" onClick={actions.reciteFlip}>
          <IconFlip size={15} /> 翻面
        </button>
        <button
          type="button"
          className="btn ghost"
          disabled={recite.index >= total - 1}
          onClick={actions.reciteNext}
        >
          下一张 <IconArrowRight size={15} />
        </button>
      </div>

      <div className="recite-progress">
        <div className="recite-progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <p className="recite-hint">空格翻面 · ←/→ 切换 · Esc 退出</p>
    </div>
  )
}
