import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import type { CardSummary } from '../../../shared/types'
import { formatRelative } from '../lib/format'
import { IconCard, IconPlus, IconSearch, IconTag, IconTrash, IconX } from './Icons'
import { toPlain } from '../lib/rich'
import CardDetail from './CardDetail'

export default function CardLibrary(): JSX.Element {
  const { state, actions } = useStore()
  const [keyword, setKeyword] = useState('')
  const [tagIds, setTagIds] = useState<string[]>([])
  const [tagMode, setTagMode] = useState<'and' | 'or'>('and')
  const [unmountedOnly, setUnmountedOnly] = useState(false)
  const [cards, setCards] = useState<CardSummary[]>([])
  const [loading, setLoading] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current)
    setLoading(true)
    timer.current = window.setTimeout(async () => {
      try {
        const list = await window.api.card.list({ keyword, tagIds, tagMode, unmountedOnly })
        setCards(list)
      } catch {
        setCards([])
      } finally {
        setLoading(false)
      }
    }, 180)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [keyword, tagIds, tagMode, unmountedOnly, state.nodes, state.tags])

  const toggleTag = (id: string): void => {
    setTagIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]))
  }

  const hasFilter = !!keyword || tagIds.length > 0 || unmountedOnly
  const emptyHint = useMemo(() => {
    if (hasFilter) return '没有符合筛选条件的卡片'
    return '卡片库还是空的，点右上角「新建卡片」开始吧'
  }, [hasFilter])

  return (
    <section className="library">
      <div className="library-main">
        <div className="library-toolbar">
          <div className="lib-search">
            <IconSearch size={15} />
            <input
              placeholder="搜索卡片正反面…"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            {!!keyword && (
              <button type="button" className="icon-btn tiny" onClick={() => setKeyword('')}>
                <IconX size={13} />
              </button>
            )}
          </div>
          <button
            type="button"
            className={unmountedOnly ? 'chip on' : 'chip'}
            onClick={() => setUnmountedOnly((v) => !v)}
            title="只显示没有挂载到目录的卡片"
          >
            只看未挂载
          </button>
          <span className="muted lib-count">{loading ? '加载中…' : `${cards.length} 张`}</span>
          <button
            type="button"
            className="btn primary small"
            onClick={() => actions.openDialog({ kind: 'newCard', parentId: null })}
          >
            <IconPlus size={14} /> 新建卡片
          </button>
        </div>

        <div className="tag-filter">
          <span className="filter-label">
            <IconTag size={13} /> 标签
          </span>
          <div className="tag-scroll">
            {state.tags.length === 0 && <span className="muted small">还没有标签</span>}
            {state.tags.map((tag) => (
              <button
                type="button"
                key={tag.id}
                className={tagIds.includes(tag.id) ? 'tag-pill on' : 'tag-pill'}
                onClick={() => toggleTag(tag.id)}
              >
                #{tag.name}
                <span className="tag-pill-count">{tag.count}</span>
              </button>
            ))}
          </div>
          {tagIds.length > 0 && (
            <div className="filter-right">
              <button
                type="button"
                className="link"
                onClick={() => setTagMode(tagMode === 'and' ? 'or' : 'and')}
                title="切换多标签筛选逻辑"
              >
                {tagMode === 'and' ? '同时满足' : '任一满足'}
              </button>
              <button type="button" className="link" onClick={() => setTagIds([])}>
                清除
              </button>
            </div>
          )}
        </div>

        <div className="table-wrap">
          {cards.length === 0 ? (
            <div className="table-empty">{emptyHint}</div>
          ) : (
            <table className="card-table">
              <thead>
                <tr>
                  <th className="col-front">正面（题干）</th>
                  <th className="col-back">背面（答案）</th>
                  <th className="col-tags">标签</th>
                  <th className="col-ref">引用</th>
                  <th className="col-time">更新时间</th>
                  <th className="col-op" />
                </tr>
              </thead>
              <tbody>
                {cards.map((card) => (
                  <tr
                    key={card.id}
                    className={state.selectedCardId === card.id ? 'selected' : ''}
                    onClick={() => actions.selectCard(card.id)}
                    onDoubleClick={() => actions.selectCard(card.id)}
                  >
                    <td className="col-front">
                      <span className="cell-clamp">{toPlain(card.front).split('\n')[0] || '（空）'}</span>
                    </td>
                    <td className="col-back">
                      <span className="cell-clamp muted">{toPlain(card.back).split('\n')[0] || '—'}</span>
                    </td>
                    <td className="col-tags">
                      <span className="tag-inline">
                        {card.tags.slice(0, 2).map((t) => (
                          <span key={t.id} className="tag-mini">
                            #{t.name}
                          </span>
                        ))}
                        {card.tags.length > 2 && <span className="tag-mini">+{card.tags.length - 2}</span>}
                        {card.tags.length === 0 && <span className="muted small">—</span>}
                      </span>
                    </td>
                    <td className="col-ref">
                      {card.refCount > 0 ? (
                        <span className="ref-count">
                          <IconCard size={12} /> {card.refCount}
                        </span>
                      ) : (
                        <span className="ref-none">未挂载</span>
                      )}
                    </td>
                    <td className="col-time muted small">{formatRelative(card.updatedAt)}</td>
                    <td className="col-op">
                      <button
                        type="button"
                        className="icon-btn tiny"
                        title="删除卡片"
                        onClick={(e) => {
                          e.stopPropagation()
                          void window.api.card.get(card.id).then((detail) =>
                            actions.openDialog({ kind: 'deleteCard', card: detail })
                          )
                        }}
                      >
                        <IconTrash size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="library-detail">
        {state.cardDetail ? (
          <CardDetail />
        ) : (
          <div className="detail-empty small-empty">
            <IconCard size={26} />
            <p>从左侧列表选一张卡片查看和编辑</p>
            <p className="muted">选中后可以翻转预览、改标签、查看它挂在哪些目录下</p>
          </div>
        )}
      </div>
    </section>
  )
}
