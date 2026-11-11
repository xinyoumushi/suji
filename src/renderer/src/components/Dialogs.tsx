import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useStore } from '../store'
import type { CardSummary, DeleteStrategy, HistoryEntry, SubtreeStats, Tag, TreeNode } from '../../../shared/types'
import { buildChildren, pathLabels } from '../lib/tree'
import { formatBytes, formatDateTime, formatRelative } from '../lib/format'
import { IconAlert, IconCheck, IconPlus, IconTrash, IconX } from './Icons'
import MicButton from './MicButton'
import { toPlain } from '../lib/rich'
import { diffText } from '../lib/diff'

function Modal({
  title,
  subtitle,
  children,
  footer,
  wide,
  onClose
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  footer?: React.ReactNode
  wide?: boolean
  onClose: () => void
}): JSX.Element {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className={wide ? 'modal wide' : 'modal'}>
        <header className="modal-head">
          <div>
            <h3>{title}</h3>
            {subtitle && <p className="muted small">{subtitle}</p>}
          </div>
          <button type="button" className="icon-btn tiny" onClick={onClose} title="关闭">
            <IconX size={15} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  )
}

export default function DialogHost(): JSX.Element | null {
  const { state, actions } = useStore()
  const dialog = state.dialog
  if (!dialog) return null

  const close = (): void => actions.closeDialog()

  if (dialog.kind === 'confirm') {
    return (
      <Modal
        title={dialog.title}
        onClose={close}
        footer={
          <>
            <button type="button" className="btn ghost" onClick={close}>
              取消
            </button>
            <button
              type="button"
              className={dialog.danger ? 'btn danger' : 'btn primary'}
              onClick={dialog.onConfirm}
            >
              {dialog.confirmText ?? '确定'}
            </button>
          </>
        }
      >
        <p className="dialog-text">{dialog.message}</p>
      </Modal>
    )
  }

  if (dialog.kind === 'deleteFolder') {
    return <DeleteFolderDialog node={dialog.node} onClose={close} />
  }

  if (dialog.kind === 'deleteRef') {
    const card = dialog.node
    return (
      <Modal
        title="把这张卡片从目录里移除？"
        subtitle="卡片本体不会丢失，只是不再挂在这个位置"
        onClose={close}
        footer={
          <>
            <button type="button" className="btn ghost" onClick={close}>
              取消
            </button>
            <button
              type="button"
              className="btn danger-ghost"
              onClick={async () => {
                if (!dialog.node.cardId) return
                try {
                  const detail = await window.api.card.get(dialog.node.cardId)
                  actions.openDialog({ kind: 'deleteCard', card: detail })
                } catch (error) {
                  actions.notify((error as Error).message, 'error')
                }
              }}
            >
              删除卡片本体…
            </button>
            <button type="button" className="btn primary" onClick={() => void actions.removeRef(dialog.node.id)}>
              仅移除这条引用
            </button>
          </>
        }
      >
        <div className="mini-card">
          <span className="mini-label">正面</span>
          <div className="mini-text">{toPlain(card.front ?? '')}</div>
          <span className="mini-label">背面</span>
          <div className="mini-text muted">{toPlain(card.back ?? '') || '（空）'}</div>
        </div>
        <p className="muted small">如果这张卡片还被挂在别的文件夹下，那些位置不受影响。</p>
      </Modal>
    )
  }

  if (dialog.kind === 'deleteCard') {
    const count = dialog.card.refs.length
    return (
      <Modal
        title="删除这张卡片？"
        subtitle={count > 0 ? `它当前被 ${count} 处引用` : '它当前没有挂载到目录'}
        onClose={close}
        footer={
          <>
            <button type="button" className="btn ghost" onClick={close}>
              取消
            </button>
            <button type="button" className="btn danger" onClick={() => void actions.removeCard(dialog.card.id)}>
              永久删除
            </button>
          </>
        }
      >
        <div className="mini-card">
          <div className="mini-text">{toPlain(dialog.card.front)}</div>
          <div className="mini-text muted">{toPlain(dialog.card.back) || '（空）'}</div>
        </div>
        <p className="dialog-text danger-text">
          删除后，目录里引用它的 {count} 处节点会同时消失，标签关联也会解除。此操作不可撤销。
        </p>
      </Modal>
    )
  }

  if (dialog.kind === 'deleteTag') {
    return (
      <Modal
        title={`删除标签「${dialog.tag.name}」？`}
        onClose={close}
        footer={
          <>
            <button type="button" className="btn ghost" onClick={close}>
              取消
            </button>
            <button type="button" className="btn danger" onClick={() => void actions.deleteTag(dialog.tag.id)}>
              删除标签
            </button>
          </>
        }
      >
        <p className="dialog-text">
          该标签关联了 {dialog.tag.count} 张卡片，删除后只解除关联，卡片本体和目录结构都不会受影响。
        </p>
      </Modal>
    )
  }

  if (dialog.kind === 'newFolder') {
    return <NewFolderDialog parentId={dialog.parentId} parentName={dialog.parentName} onClose={close} />
  }

  if (dialog.kind === 'newCard') {
    return <NewCardDialog parentId={dialog.parentId} onClose={close} />
  }

  if (dialog.kind === 'cardPicker') {
    return (
      <CardPickerDialog parentId={dialog.parentId} parentName={dialog.parentName} cardId={dialog.cardId} onClose={close} />
    )
  }

  if (dialog.kind === 'tagManager') {
    return <TagManagerDialog onClose={close} />
  }

  if (dialog.kind === 'history') {
    return (
      <HistoryDialog
        entityType={dialog.entityType}
        entityId={dialog.entityId}
        title={dialog.title}
        current={dialog.current}
        onRestore={dialog.onRestore}
        onClose={close}
      />
    )
  }

  return <AboutDialog onClose={close} />
}

function DeleteFolderDialog({ node, onClose }: { node: TreeNode; onClose: () => void }): JSX.Element {
  const { actions } = useStore()
  const [stats, setStats] = useState<SubtreeStats | null>(null)
  const [strategy, setStrategy] = useState<DeleteStrategy>('detach')
  const [ack, setAck] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    window.api.tree
      .stats(node.id)
      .then(setStats)
      .catch(() => setStats({ folders: 1, refs: 0, cards: 0, cardsOutside: 0 }))
  }, [node.id])

  const subFolders = Math.max((stats?.folders ?? 1) - 1, 0)
  const refs = stats?.refs ?? 0
  const cards = stats?.cards ?? 0
  const outside = stats?.cardsOutside ?? 0
  const canConfirm = !!stats && !busy && (strategy !== 'cascade' || ack)

  const option = (
    key: DeleteStrategy,
    title: string,
    desc: string,
    consequence: string,
    danger = false,
    badge?: string
  ): JSX.Element => (
    <label className={strategy === key ? (danger ? 'strategy-card danger on' : 'strategy-card on') : danger ? 'strategy-card danger' : 'strategy-card'}>
      <input type="radio" checked={strategy === key} onChange={() => setStrategy(key)} />
      <span className="strategy-main">
        <span className="strategy-title">
          {title}
          {badge && <em className="strategy-badge">{badge}</em>}
        </span>
        <span className="strategy-desc">{desc}</span>
        <span className={danger ? 'strategy-result danger-text' : 'strategy-result'}>{consequence}</span>
      </span>
    </label>
  )

  return (
    <Modal
      title={`删除文件夹「${node.name ?? ''}」`}
      subtitle="请选择删除方式，三种方式的区别只在「结构」和「卡片本体」"
      wide
      onClose={onClose}
      footer={
        <>
          <span className="foot-hint">删除不可撤销，重要数据建议先「导出 JSON 备份」</span>
          <button type="button" className="btn ghost" onClick={onClose} autoFocus>
            取消
          </button>
          <button
            type="button"
            className={strategy === 'cascade' ? 'btn danger' : 'btn primary'}
            disabled={!canConfirm}
            onClick={() => {
              setBusy(true)
              void actions.deleteFolder(node.id, strategy)
            }}
          >
            {stats ? (strategy === 'cascade' ? `永久删除（${cards} 张卡片）` : '确认删除') : '统计中…'}
          </button>
        </>
      }
    >
      <div className="stat-strip">
        <span>
          子文件夹 <b>{subFolders}</b>
        </span>
        <span>
          卡片引用 <b>{refs}</b>
        </span>
        <span>
          涉及卡片 <b>{cards}</b>
        </span>
        <span className={outside > 0 ? 'warn-text' : ''}>
          其中 {outside} 张在别处仍有引用
        </span>
      </div>

      <div className="strategy-list">
        {option(
          'lift',
          '① 只删除这一层',
          `只删掉「${node.name ?? ''}」这个文件夹本身，里面的 ${subFolders} 个子文件夹和 ${refs} 条卡片引用整体上移到它的上一级，顺序保持不变。`,
          '适合「把中间层拉平」：结构和卡片全部保留，只是少一层。'
        )}
        {option(
          'detach',
          '② 删除目录结构，保留卡片',
          `删除它和它下面全部的文件夹、卡片引用节点。卡片本体保留，之后还能在卡片库里找到、重新挂载。`,
          cards > 0
            ? `删除后 ${refs} 条引用消失，${cards} 张卡片会变成「未挂载」，其中 ${cards - outside} 张将不再出现在目录里。`
            : '当前子树里没有卡片引用。',
          false,
          '推荐'
        )}
        {option(
          'cascade',
          '③ 连卡片一起删除',
          `在②的基础上，永久删除这个子树里出现的 ${cards} 张卡片本体，以及它们的标签关联。`,
          outside > 0
            ? `其中 ${outside} 张卡片在目录的其他位置也被引用，删除后那些位置会一起消失。`
            : '这些卡片只在当前子树里出现，删除后无法恢复。',
          true,
          '危险'
        )}
      </div>

      {strategy === 'cascade' && (
        <label className="ack-row">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          <span className="danger-text">
            我已知晓：将永久删除 {cards} 张卡片{outside > 0 ? `，并连带影响其他位置 ${outside} 张卡片的引用` : ''}，无法撤销
          </span>
        </label>
      )}
    </Modal>
  )
}

function NewFolderDialog({
  parentId,
  parentName,
  onClose
}: {
  parentId: string | null
  parentName: string
  onClose: () => void
}): JSX.Element {
  const { actions } = useStore()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (): Promise<void> => {
    if (!name.trim() || busy) return
    setBusy(true)
    await actions.createFolder(parentId, name)
  }

  return (
    <Modal
      title="新建文件夹"
      subtitle={`位置：${parentName || '根目录'}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn primary" disabled={!name.trim() || busy} onClick={() => void submit()}>
            创建
          </button>
        </>
      }
    >
      <input
        className="text-input"
        autoFocus
        placeholder="例如：英语 / 词汇 / 第四章 时态"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void submit()
        }}
      />
      <p className="muted small">创建后可以直接在右侧填写文件夹备注。</p>
    </Modal>
  )
}

function NewCardDialog({ parentId, onClose }: { parentId: string | null; onClose: () => void }): JSX.Element {
  const { state, actions } = useStore()
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [tagIds, setTagIds] = useState<string[]>([])
  const [mount, setMount] = useState(true)
  const [busy, setBusy] = useState(false)

  const folder = parentId ? state.nodes.find((n) => n.id === parentId) : null

  const submit = async (): Promise<void> => {
    if (!front.trim() || busy) return
    setBusy(true)
    await actions.createCard({ front, back, tagIds }, mount ? parentId : null)
  }

  return (
    <Modal
      title="新建卡片"
      subtitle={folder ? `保存后可自动挂到「${folder.name}」` : '卡片会先进入卡片库，之后再挂到目录'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn primary" disabled={!front.trim() || busy} onClick={() => void submit()}>
            保存卡片
          </button>
        </>
      }
    >
      <div className="field">
        <label>
          正面（题干）<span className="muted">必填</span>
          <MicButton value={front} onChange={setFront} />
        </label>
        <textarea className="edit-area" autoFocus value={front} onChange={(e) => setFront(e.target.value)} placeholder="例如：abandon" />
      </div>
      <div className="field">
        <label>
          背面（答案）
          <MicButton value={back} onChange={setBack} />
        </label>
        <textarea className="edit-area" value={back} onChange={(e) => setBack(e.target.value)} placeholder="例如：v. 放弃；抛弃" />
      </div>
      {state.tags.length > 0 && (
        <div className="field">
          <label>标签</label>
          <div className="tag-row">
            {state.tags.map((tag) => (
              <button
                type="button"
                key={tag.id}
                className={tagIds.includes(tag.id) ? 'tag-pill on' : 'tag-pill'}
                onClick={() =>
                  setTagIds((prev) => (prev.includes(tag.id) ? prev.filter((t) => t !== tag.id) : [...prev, tag.id]))
                }
              >
                #{tag.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {folder && (
        <label className="opt-row">
          <input type="checkbox" checked={mount} onChange={(e) => setMount(e.target.checked)} />
          <span>
            保存后挂到「{folder.name}」<em className="muted">（取消勾选则只进卡片库）</em>
          </span>
        </label>
      )}
    </Modal>
  )
}

function CardPickerDialog({
  parentId,
  parentName,
  cardId,
  onClose
}: {
  parentId: string | null
  parentName: string
  cardId?: string
  onClose: () => void
}): JSX.Element {
  const { state, actions } = useStore()
  const [keyword, setKeyword] = useState('')
  const [cards, setCards] = useState<CardSummary[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [folderId, setFolderId] = useState<string | null>(parentId)
  const [busy, setBusy] = useState(false)

  const folderMode = !!cardId

  useEffect(() => {
    if (folderMode) return
    let alive = true
    window.api.card
      .list({ keyword })
      .then((list) => {
        if (alive) setCards(list)
      })
      .catch(() => setCards([]))
    return () => {
      alive = false
    }
  }, [keyword, folderMode])

  const folderOptions = useMemo(() => {
    const children = buildChildren(state.nodes.filter((n) => n.type === 'folder'))
    const list: { id: string; label: string; depth: number }[] = []
    const walk = (parent: string | null, depth: number): void => {
      for (const node of children.get(parent) ?? []) {
        list.push({ id: node.id, label: node.name ?? '未命名', depth })
        walk(node.id, depth + 1)
      }
    }
    walk(null, 0)
    return list
  }, [state.nodes])

  const submit = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    if (folderMode) {
      if (folderId) await actions.addRefs(folderId, [cardId!])
      else {
        actions.notify('请选择要挂载的文件夹', 'error')
        setBusy(false)
      }
    } else {
      await actions.addRefs(parentId, selected)
    }
  }

  return (
    <Modal
      title={folderMode ? '把卡片挂载到文件夹' : `选择要引用的卡片`}
      subtitle={folderMode ? '同一张卡片可以挂到多个文件夹，互不影响' : `挂到：${parentName || '当前文件夹'}`}
      wide
      onClose={onClose}
      footer={
        <>
          <span className="foot-hint">
            {folderMode ? '' : `已选 ${selected.length} 张`}
          </span>
          <button type="button" className="btn ghost" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={busy || (folderMode ? !folderId : selected.length === 0)}
            onClick={() => void submit()}
          >
            {folderMode ? '挂载' : `添加 ${selected.length} 条引用`}
          </button>
        </>
      }
    >
      {folderMode ? (
        <div className="folder-select">
          {folderOptions.length === 0 && <p className="muted">还没有文件夹，请先新建一个文件夹。</p>}
          {folderOptions.map((option) => (
            <button
              type="button"
              key={option.id}
              className={folderId === option.id ? 'folder-option on' : 'folder-option'}
              style={{ paddingLeft: 12 + option.depth * 16 }}
              onClick={() => setFolderId(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : (
        <>
          <input
            className="text-input"
            autoFocus
            placeholder="搜索卡片正反面…"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <div className="pick-list">
            {cards.length === 0 && <div className="muted pad">没有可选的卡片，先去新建一张吧。</div>}
            {cards.map((card) => {
              const on = selected.includes(card.id)
              return (
                <button
                  type="button"
                  key={card.id}
                  className={on ? 'pick-row on' : 'pick-row'}
                  onClick={() =>
                    setSelected((prev) => (on ? prev.filter((id) => id !== card.id) : [...prev, card.id]))
                  }
                >
                  <span className="pick-check">{on && <IconCheck size={12} />}</span>
                  <span className="pick-body">
                    <span className="pick-front">{toPlain(card.front).split('\n')[0]}</span>
                    <span className="pick-back muted">{toPlain(card.back).split('\n')[0] || '（无背面）'}</span>
                  </span>
                  <span className="pick-meta muted small">
                    {card.refCount > 0 ? `已引用 ${card.refCount} 处` : '未挂载'}
                  </span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </Modal>
  )
}

function TagManagerDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const { state, actions } = useStore()
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [confirming, setConfirming] = useState<string | null>(null)

  const add = async (): Promise<void> => {
    if (!name.trim()) return
    const tag = await actions.createTag(name)
    if (tag) setName('')
  }

  return (
    <Modal
      title="标签管理"
      subtitle="标签和目录树互相独立，一张卡片可以有多个标签"
      onClose={onClose}
      footer={
        <>
          <span className="foot-hint">共 {state.tags.length} 个标签</span>
          <button type="button" className="btn primary" onClick={onClose}>
            完成
          </button>
        </>
      }
    >
      <div className="tag-input-row">
        <input
          className="text-input"
          placeholder="新标签名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add()
          }}
        />
        <button type="button" className="btn primary" onClick={() => void add()} disabled={!name.trim()}>
          <IconPlus size={14} /> 添加
        </button>
      </div>
      <div className="tag-manage-list">
        {state.tags.length === 0 && <p className="muted">还没有标签。</p>}
        {state.tags.map((tag) => (
          <div key={tag.id} className="tag-manage-row">
            {editing === tag.id ? (
              <input
                className="text-input small"
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => {
                  if (draft.trim() && draft !== tag.name) void actions.renameTag(tag.id, draft)
                  setEditing(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (draft.trim() && draft !== tag.name) void actions.renameTag(tag.id, draft)
                    setEditing(null)
                  }
                  if (e.key === 'Escape') setEditing(null)
                }}
              />
            ) : (
              <button
                type="button"
                className="tag-name-btn"
                onClick={() => {
                  setEditing(tag.id)
                  setDraft(tag.name)
                }}
              >
                #{tag.name}
              </button>
            )}
            <span className="muted small">{tag.count} 张卡片</span>
            {confirming === tag.id ? (
              <span className="confirm-inline">
                <button type="button" className="btn danger tiny" onClick={() => void actions.deleteTag(tag.id)}>
                  确认删除
                </button>
                <button type="button" className="btn ghost tiny" onClick={() => setConfirming(null)}>
                  取消
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="btn danger-ghost tiny"
                title={`删除标签「${tag.name}」，卡片不受影响`}
                onClick={() => setConfirming(tag.id)}
              >
                <IconTrash size={12} /> 删除
              </button>
            )}
          </div>
        ))}
      </div>
    </Modal>
  )
}

function HistoryDialog({
  entityType,
  entityId,
  title,
  current,
  onRestore,
  onClose
}: {
  entityType: 'card' | 'folder'
  entityId: string
  title: string
  current: Partial<Record<'front' | 'back' | 'note', string>>
  onRestore: (entry: HistoryEntry) => void
  onClose: () => void
}): JSX.Element {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)

  useEffect(() => {
    const load = entityType === 'card' ? window.api.card.history(entityId) : window.api.tree.history(entityId)
    load
      .then((list) => setEntries(list))
      .catch(() => setEntries([]))
  }, [entityType, entityId])

  const fieldLabel = (field: HistoryEntry['field']): string =>
    field === 'front' ? '正面' : field === 'back' ? '背面' : '备注'

  return (
    <Modal
      title={title}
      subtitle="下面的红字是这一版有、现在没有的内容；绿字是这一版没有、现在有的内容"
      wide
      onClose={onClose}
      footer={
        <>
          <span className="foot-hint">每处内容最多保留最近 20 版 · 时间显示为多久以前</span>
          <button type="button" className="btn primary" onClick={onClose}>
            关闭
          </button>
        </>
      }
    >
      {entries === null && <p className="muted">读取中…</p>}
      {entries && entries.length === 0 && (
        <p className="muted">还没有历史版本。以后每次保存卡片或备注时，系统都会先留一份旧内容。</p>
      )}
      {entries && entries.length > 0 && (
        <ul className="history-list">
          {entries.map((entry) => {
            const oldText = toPlain(entry.content)
            const newText = toPlain(current[entry.field] ?? '')
            const diff = diffText(oldText, newText)
            return (
              <li key={entry.id} className="history-row">
                <div className="history-main">
                  <span className="history-meta">
                    <b>{fieldLabel(entry.field)}</b>
                    <span className="muted"> · {formatRelative(entry.createdAt)} · {oldText.length} 字</span>
                    {diff.changed ? (
                      <span className="history-delta">
                        删 {diff.removed} · 增 {diff.added}
                      </span>
                    ) : (
                      <span className="history-same">与当前一致</span>
                    )}
                  </span>
                  <span className="history-diff">
                    {diff.parts.map((part, index) =>
                      part.type === 'same' ? (
                        <span key={index} className="dif-same">
                          {part.text}
                        </span>
                      ) : part.type === 'del' ? (
                        <span key={index} className="dif-del">
                          {part.text}
                        </span>
                      ) : (
                        <span key={index} className="dif-add">
                          {part.text}
                        </span>
                      )
                    )}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() => {
                    onRestore(entry)
                    onClose()
                  }}
                >
                  恢复这一版
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}

function AboutDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const { state, actions } = useStore()
  const info = state.info
  const [backupPath, setBackupPath] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <Modal
      title="设置与数据"
      subtitle="所有数据都保存在本机，不联网、不上传"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={() => actions.openDialog({ kind: 'tagManager' })}>
            管理标签
          </button>
          <button type="button" className="btn primary" onClick={onClose}>
            完成
          </button>
        </>
      }
    >
      <div className="info-grid">
        <div className="info-cell">
          <span className="muted">版本</span>
          <b>{info?.version ?? '—'}</b>
        </div>
        <div className="info-cell">
          <span className="muted">目录节点</span>
          <b>{info?.nodeCount ?? 0}</b>
        </div>
        <div className="info-cell">
          <span className="muted">卡片</span>
          <b>{info?.cardCount ?? 0}</b>
        </div>
        <div className="info-cell">
          <span className="muted">标签</span>
          <b>{info?.tagCount ?? 0}</b>
        </div>
      </div>

      <div className="field">
        <label>数据位置</label>
        <div className="path-row">
          <code>{info?.dbPath ?? '—'}</code>
          <button type="button" className="btn ghost tiny" onClick={() => void window.api.app.openDataDir()}>
            打开目录
          </button>
        </div>
      </div>

      <div className="field">
        <label>最近操作</label>
        <p className="muted small">
          上次导出：{formatDateTime(info?.lastExportAt ?? null)} · 上次导入：
          {formatDateTime(info?.lastImportAt ?? null)} · 导入产生的卡片 {info?.importCount ?? 0} 张
        </p>
      </div>

      <div className="field">
        <label>数据库快照</label>
        <div className="path-row">
          <button
            type="button"
            className="btn soft small"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              window.api.app
                .backup()
                .then((path) => {
                  setBackupPath(path)
                  actions.notify('快照已生成', 'success')
                })
                .catch((error: Error) => actions.notify(error.message, 'error'))
                .finally(() => setBusy(false))
            }}
          >
            立即备份
          </button>
          <span className="muted small">{backupPath ? `已生成：${backupPath}` : '每次导入、批量删除前会自动备份，最多保留 10 份'}</span>
        </div>
      </div>

      <div className="field">
        <label>快捷键</label>
        <ul className="shortcut-list">
          <li>
            <kbd>Ctrl</kbd> + <kbd>F</kbd> 全局搜索
          </li>
          <li>
            <kbd>Ctrl</kbd> + <kbd>S</kbd> 保存卡片修改
          </li>
          <li>
            <kbd>空格</kbd> 背诵时翻面
          </li>
          <li>
            <kbd>←</kbd> <kbd>→</kbd> 背诵时切换卡片
          </li>
          <li>
            <kbd>Esc</kbd> 关闭弹窗 / 退出背诵
          </li>
        </ul>
      </div>
    </Modal>
  )
}

export function useDialogStats(node: TreeNode): SubtreeStats | null {
  const [stats, setStats] = useState<SubtreeStats | null>(null)
  useEffect(() => {
    window.api.tree.stats(node.id).then(setStats).catch(() => setStats(null))
  }, [node.id])
  return stats
}

export { Modal }
