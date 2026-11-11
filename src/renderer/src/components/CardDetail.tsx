import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import { pathLabels } from '../lib/tree'
import { formatDateTime } from '../lib/format'
import FlipCard from './FlipCard'
import MicButton from './MicButton'
import RichEditor from './RichEditor'
import { toHtml, toPlain } from '../lib/rich'
import {
  IconArrowRight,
  IconCard,
  IconCheck,
  IconPlus,
  IconSpark,
  IconTrash,
  IconX
} from './Icons'

export default function CardDetail(): JSX.Element | null {
  const { state, actions } = useStore()
  const card = state.cardDetail
  const [front, setFront] = useState(card?.front ?? '')
  const [back, setBack] = useState(card?.back ?? '')
  const [tagIds, setTagIds] = useState<string[]>(card?.tags.map((t) => t.id) ?? [])
  const [flipped, setFlipped] = useState(false)
  const [showTags, setShowTags] = useState(false)
  const [newTag, setNewTag] = useState('')

  useEffect(() => {
    setFront(card?.front ?? '')
    setBack(card?.back ?? '')
    setTagIds(card?.tags.map((t) => t.id) ?? [])
    setFlipped(false)
    setShowTags(false)
    setNewTag('')
  }, [card?.id])

  const dirty = useMemo(() => {
    if (!card) return false
    const originalTags = card.tags.map((t) => t.id).sort().join(',')
    const currentTags = [...tagIds].sort().join(',')
    return toHtml(front) !== toHtml(card.front) || toHtml(back) !== toHtml(card.back) || originalTags !== currentTags
  }, [card, front, back, tagIds])

  useEffect(() => {
    actions.setDirty(dirty)
  }, [dirty, actions])

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        if (card && dirty) void actions.saveCard(card.id, { front: toHtml(front), back: toHtml(back), tagIds })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [card, dirty, front, back, tagIds, actions])

  if (!card) return null

  const selectedNode = state.selectedNodeId ? state.nodes.find((n) => n.id === state.selectedNodeId) : null
  const currentRef = selectedNode && selectedNode.type === 'card' ? selectedNode : null

  const toggleTag = (id: string): void => {
    setTagIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]))
  }

  const createAndAddTag = async (): Promise<void> => {
    const name = newTag.trim()
    if (!name) return
    const tag = await actions.createTag(name)
    if (tag) {
      setTagIds((prev) => [...prev, tag.id])
      setNewTag('')
    }
  }

  return (
    <div className="detail card-detail">
      <div className="detail-top">
        <div className="crumbs">
          {currentRef ? pathLabels(state.nodes, currentRef.id).join(' / ') : '卡片库'}
        </div>
        <div className="detail-actions">
          {currentRef && (
            <button
              type="button"
              className="btn ghost small"
              onClick={() => actions.openDialog({ kind: 'deleteRef', node: currentRef })}
            >
              <IconX size={14} /> 从目录移除
            </button>
          )}
          <button
            type="button"
            className="btn ghost small"
            onClick={() => actions.openDialog({ kind: 'cardPicker', parentId: null, parentName: '', cardId: card.id })}
          >
            <IconPlus size={14} /> 挂载到文件夹
          </button>
          <button
            type="button"
            className="btn ghost small"
            onClick={() => actions.startRecite(currentRef?.parentId ?? null, currentRef?.id)}
          >
            <IconSpark size={14} /> 背诵
          </button>
          <button
            type="button"
            className="btn danger-ghost small"
            onClick={() => actions.openDialog({ kind: 'deleteCard', card })}
          >
            <IconTrash size={14} /> 删除卡片
          </button>
        </div>
      </div>

      <FlipCard front={front} back={back} flipped={flipped} onFlip={() => setFlipped((v) => !v)} />

      <div className="edit-grid">
        <div className="field">
          <label>
            正面（题干）<span className="muted">必填</span>
            <MicButton value={front} onChange={setFront} />
          </label>
          <RichEditor value={front} onChange={setFront} placeholder="例如：abandon" />
        </div>
        <div className="field">
          <label>
            背面（答案）<span className="muted">可留空，之后补充</span>
            <MicButton value={back} onChange={setBack} />
          </label>
          <RichEditor value={back} onChange={setBack} placeholder="例如：v. 放弃；抛弃" />
        </div>
      </div>

      <div className="field tag-field">
        <label>
          标签<span className="muted">与目录互相独立，可多选</span>
        </label>
        <div className="tag-row">
          {card.tags
            .filter((t) => tagIds.includes(t.id))
            .map((tag) => (
              <span key={tag.id} className="tag-chip">
                #{tag.name}
                <button type="button" onClick={() => toggleTag(tag.id)} title="移除标签">
                  <IconX size={11} />
                </button>
              </span>
            ))}
          <button type="button" className="tag-add" onClick={() => setShowTags((v) => !v)}>
            <IconPlus size={12} /> 选择标签
          </button>
        </div>
        {showTags && (
          <>
            <div className="pop-backdrop" onClick={() => setShowTags(false)} />
            <div className="tag-pop">
              <div className="tag-pop-head">
                <span>选择标签</span>
                <button
                  type="button"
                  className="link tiny"
                  onClick={() => {
                    setShowTags(false)
                    actions.openDialog({ kind: 'tagManager' })
                  }}
                >
                  管理 / 删除标签
                </button>
              </div>
              <div className="tag-pop-list">
                {state.tags.length === 0 && <div className="tag-pop-empty">还没有标签，先新建一个</div>}
                {state.tags.map((tag) => (
                  <button
                    type="button"
                    key={tag.id}
                    className={tagIds.includes(tag.id) ? 'tag-option on' : 'tag-option'}
                    onClick={() => toggleTag(tag.id)}
                  >
                    <span className="tag-option-check">{tagIds.includes(tag.id) && <IconCheck size={12} />}</span>
                    <span>#{tag.name}</span>
                    <span className="muted small">{tag.count}</span>
                  </button>
                ))}
              </div>
              <div className="tag-pop-foot">
                <input
                  value={newTag}
                  placeholder="新建标签后回车"
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void createAndAddTag()
                  }}
                />
                <button type="button" className="btn soft small" onClick={() => void createAndAddTag()}>
                  添加
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="field">
        <label>
          引用位置
          <span className="muted">
            {card.refs.length ? `被 ${card.refs.length} 处引用，修改后全部同步` : '还没有挂载到目录'}
          </span>
        </label>
        {card.refs.length === 0 ? (
          <div className="ref-empty">
            这张卡片目前是「未挂载」状态，只在卡片库里可见。
            <button
              type="button"
              className="link"
              onClick={() => actions.openDialog({ kind: 'cardPicker', parentId: null, parentName: '', cardId: card.id })}
            >
              挂载到文件夹
            </button>
          </div>
        ) : (
          <ul className="ref-list">
            {card.refs.map((ref) => (
              <li key={ref.nodeId}>
                <button
                  type="button"
                  className="ref-row"
                  onClick={() =>
                    actions.locate({
                      kind: 'card',
                      id: card.id,
                      nodeId: ref.nodeId,
                      title: toPlain(card.front),
                      field: 'front',
                      snippet: '',
                      paths: [ref],
                      refCount: card.refs.length
                    })
                  }
                >
                  <IconCard size={13} />
                  <span className="ref-path">{ref.folders.map((f) => f.name).join(' / ') || '根目录'}</span>
                  <IconArrowRight size={13} className="ref-go" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="savebar">
        <span className={dirty ? 'dirty-text' : 'muted'}>
          {dirty ? '有未保存的修改 · Ctrl+S 保存' : `最后修改 ${formatDateTime(card.updatedAt)}`}
        </span>
        <div className="savebar-actions">
          <button
            type="button"
            className="btn ghost small"
            onClick={() =>
              actions.openDialog({
                kind: 'history',
                entityType: 'card',
                entityId: card.id,
                title: '卡片历史版本',
                current: { front: toHtml(front), back: toHtml(back) },
                onRestore: (entry) => {
                  if (entry.field === 'front') setFront(entry.content)
                  else if (entry.field === 'back') setBack(entry.content)
                }
              })
            }
            title="查看并恢复保存前的版本"
          >
            历史版本
          </button>
          <button
            type="button"
            className="btn ghost small"
            onClick={() => {
              setFront(card.front)
              setBack(card.back)
              setTagIds(card.tags.map((t) => t.id))
            }}
            disabled={!dirty}
          >
            撤销修改
          </button>
          <button
            type="button"
            className="btn primary small"
            disabled={!dirty}
            onClick={() => void actions.saveCard(card.id, { front: toHtml(front), back: toHtml(back), tagIds })}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
