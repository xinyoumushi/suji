import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import { buildChildren, countDescendants, pathLabels } from '../lib/tree'
import { formatDateTime } from '../lib/format'
import { toHtml, toPlain } from '../lib/rich'
import {
  IconCard,
  IconFolderOpen,
  IconPencil,
  IconPlus,
  IconSpark,
  IconTrash
} from './Icons'
import MicButton from './MicButton'
import RichEditor from './RichEditor'

export default function FolderDetail(): JSX.Element | null {
  const { state, actions } = useStore()
  const node = state.nodes.find((n) => n.id === state.selectedNodeId && n.type === 'folder')
  const [note, setNote] = useState(node?.note ?? '')
  const [savedNote, setSavedNote] = useState(node?.note ?? '')
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(node?.name ?? '')

  useEffect(() => {
    setNote(node?.note ?? '')
    setSavedNote(node?.note ?? '')
    setNameDraft(node?.name ?? '')
    setEditingName(false)
  }, [node?.id])

  const childrenMap = useMemo(() => buildChildren(state.nodes), [state.nodes])
  const noteDirty = toHtml(note) !== toHtml(savedNote)

  // 备注有未保存改动时，切走要确认
  useEffect(() => {
    actions.setDirty(noteDirty)
    return () => actions.setDirty(false)
  }, [noteDirty, actions])

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        if (noteDirty && node) {
          void actions.updateNote(node.id, note)
          setSavedNote(note)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [noteDirty, note, node, actions])

  if (!node) return null

  const kids = childrenMap.get(node.id) ?? []
  const descendants = countDescendants(state.nodes, node.id)
  const subtreeCardIds = new Set<string>()
  const collect = (parentId: string): void => {
    for (const child of childrenMap.get(parentId) ?? []) {
      if (child.type === 'card') {
        if (child.cardId) subtreeCardIds.add(child.cardId)
      } else {
        collect(child.id)
      }
    }
  }
  collect(node.id)

  const saveNote = (): void => {
    if (!noteDirty) return
    void actions.updateNote(node.id, note)
    setSavedNote(note)
  }

  const saveName = (): void => {
    const value = nameDraft.trim()
    setEditingName(false)
    if (!value || value === node.name) {
      setNameDraft(node.name ?? '')
      return
    }
    void actions.renameNode(node.id, value)
  }

  return (
    <div className="detail">
      <div className="detail-top">
        <div className="crumbs">{pathLabels(state.nodes, node.id).join(' / ') || '根目录'}</div>
        <div className="detail-actions">
          <button
            type="button"
            className="btn ghost small"
            onClick={() => actions.openDialog({ kind: 'cardPicker', parentId: node.id, parentName: node.name ?? '' })}
          >
            <IconCard size={14} /> 添加卡片引用
          </button>
          <button
            type="button"
            className="btn ghost small"
            onClick={() => actions.openDialog({ kind: 'newFolder', parentId: node.id, parentName: node.name ?? '' })}
          >
            <IconPlus size={14} /> 子文件夹
          </button>
          <button type="button" className="btn ghost small" onClick={() => actions.startRecite(node.id)}>
            <IconSpark size={14} /> 背诵
          </button>
          <button
            type="button"
            className="btn danger-ghost small"
            onClick={() => actions.openDialog({ kind: 'deleteFolder', node })}
          >
            <IconTrash size={14} /> 删除
          </button>
        </div>
      </div>

      <div className="folder-title">
        <span className="folder-badge">
          <IconFolderOpen size={20} />
        </span>
        {editingName ? (
          <input
            className="name-input"
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveName()
              if (e.key === 'Escape') {
                setEditingName(false)
                setNameDraft(node.name ?? '')
              }
            }}
          />
        ) : (
          <h1
            onDoubleClick={() => setEditingName(true)}
            title="双击重命名"
          >
            {node.name}
            <button type="button" className="inline-edit" onClick={() => setEditingName(true)} title="重命名">
              <IconPencil size={13} />
            </button>
          </h1>
        )}
      </div>

      <div className="meta-line">
        <span>子文件夹 {descendants.folders}</span>
        <span>卡片引用 {descendants.cards}</span>
        <span>去重卡片 {subtreeCardIds.size}</span>
      </div>

      <section className="panel">
        <header className="panel-head">
          <span>文件夹备注</span>
          <span className="meta-right">
            <span className="muted">会参与全局搜索</span>
            <button
              type="button"
              className="link tiny"
              title="查看并恢复备注的历史版本"
              onClick={() =>
                actions.openDialog({
                  kind: 'history',
                  entityType: 'folder',
                  entityId: node.id,
                  title: '备注历史版本',
                  current: { note },
                  onRestore: (entry) => setNote(entry.content)
                })
              }
            >
              历史
            </button>
            <MicButton value={note} onChange={setNote} />
          </span>
        </header>
        <RichEditor
          value={note}
          onChange={setNote}
          placeholder="记录章节说明、复习范围、易错点提示……"
          minHeight={108}
        />
        <div className="note-actions">
          <span className={noteDirty ? 'dirty-text' : 'muted'}>
            {noteDirty ? '有未保存的修改 · Ctrl+S 保存' : `已保存 · 最后修改 ${formatDateTime(node.updatedAt)}`}
          </span>
          <div className="note-actions-right">
            <button
              type="button"
              className="btn ghost small"
              disabled={!noteDirty}
              onClick={() => setNote(savedNote)}
            >
              撤销修改
            </button>
            <button type="button" className="btn primary small" disabled={!noteDirty} onClick={saveNote}>
              保存备注
            </button>
          </div>
        </div>
      </section>

      <section className="panel">
        <header className="panel-head">
          <span>下一级内容</span>
          <span className="muted">{kids.length} 项</span>
        </header>
        {kids.length === 0 ? (
          <div className="panel-empty">
            <p>这个文件夹还是空的。</p>
            <div className="empty-actions">
              <button
                type="button"
                className="btn soft small"
                onClick={() => actions.openDialog({ kind: 'cardPicker', parentId: node.id, parentName: node.name ?? '' })}
              >
                <IconCard size={14} /> 引用已有卡片
              </button>
              <button
                type="button"
                className="btn soft small"
                onClick={() => actions.openDialog({ kind: 'newFolder', parentId: node.id, parentName: node.name ?? '' })}
              >
                <IconPlus size={14} /> 新建子文件夹
              </button>
            </div>
          </div>
        ) : (
          <ul className="child-list">
            {kids.map((kid) => (
              <li key={kid.id}>
                <button type="button" className="child-row" onClick={() => actions.selectNode(kid.id)}>
                  <span className={kid.type === 'folder' ? 'row-icon folder' : 'row-icon card'}>
                    {kid.type === 'folder' ? <IconFolderOpen size={14} /> : <IconCard size={13} />}
                  </span>
                  <span className="child-title">
                    {kid.type === 'folder' ? kid.name : toPlain(kid.front ?? '').split('\n')[0] || '（空卡片）'}
                  </span>
                  <span className="child-kind">{kid.type === 'folder' ? '文件夹' : '卡片引用'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
