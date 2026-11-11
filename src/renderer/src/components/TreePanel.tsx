import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { buildChildren } from '../lib/tree'
import type { TreeNode } from '../../../shared/types'
import { toPlain } from '../lib/rich'
import {
  IconCard,
  IconChevron,
  IconExpand,
  IconFolder,
  IconFolderOpen,
  IconPencil,
  IconPlus,
  IconSpark,
  IconTrash
} from './Icons'

type Zone = 'before' | 'after' | 'inside'

interface DragState {
  id: string | null
  overId: string | null
  zone: Zone | null
}

interface MenuState {
  x: number
  y: number
  nodeId: string
}

export default function TreePanel(): JSX.Element {
  const { state, actions } = useStore()
  const [drag, setDrag] = useState<DragState>({ id: null, overId: null, zone: null })
  const [menu, setMenu] = useState<MenuState | null>(null)

  const childrenMap = useMemo(() => buildChildren(state.nodes), [state.nodes])
  const roots = childrenMap.get(null) ?? []
  const byId = useMemo(() => new Map(state.nodes.map((n) => [n.id, n])), [state.nodes])

  const dropAt = (target: TreeNode, zone: Zone): void => {
    if (!drag.id || drag.id === target.id) return
    const parentId = zone === 'inside' ? target.id : target.parentId
    const siblings = (childrenMap.get(parentId) ?? []).filter((n) => n.id !== drag.id)
    let index = siblings.length
    if (zone !== 'inside') {
      const at = siblings.findIndex((n) => n.id === target.id)
      index = at < 0 ? siblings.length : at + (zone === 'after' ? 1 : 0)
    }
    setDrag({ id: null, overId: null, zone: null })
    void actions.moveNode(drag.id, parentId, index)
  }

  const renderRow = (node: TreeNode, depth: number): JSX.Element => {
    const isFolder = node.type === 'folder'
    const open = state.expanded.has(node.id)
    const selected = state.selectedNodeId === node.id
    const kids = childrenMap.get(node.id) ?? []
    const renaming = state.renamingId === node.id
    const dragOver = drag.overId === node.id
    const dropping = dragOver && drag.id && drag.id !== node.id

    const classes = [
      'tree-row',
      selected ? 'selected' : '',
      state.flashId === node.id ? 'flash' : '',
      dropping ? `drop-${drag.zone}` : '',
      drag.id === node.id ? 'dragging' : ''
    ]
      .filter(Boolean)
      .join(' ')

    return (
      <div key={node.id} className="tree-item">
        <div
          id={`node-${node.id}`}
          className={classes}
          style={{ paddingLeft: 6 + depth * 14 }}
          draggable={!renaming}
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', node.id)
            e.dataTransfer.effectAllowed = 'move'
            setDrag({ id: node.id, overId: null, zone: null })
          }}
          onDragEnd={() => setDrag({ id: null, overId: null, zone: null })}
          onDragOver={(e) => {
            if (!drag.id || drag.id === node.id) return
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            const rect = e.currentTarget.getBoundingClientRect()
            const ratio = (e.clientY - rect.top) / Math.max(rect.height, 1)
            let zone: Zone
            if (isFolder && ratio > 0.28 && ratio < 0.72) zone = 'inside'
            else zone = ratio < 0.5 ? 'before' : 'after'
            if (drag.overId !== node.id || drag.zone !== zone) setDrag((prev) => ({ ...prev, overId: node.id, zone }))
          }}
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (dropping && drag.zone) dropAt(node, drag.zone)
          }}
          onClick={(e) => {
            e.stopPropagation()
            setMenu(null)
            actions.selectNode(node.id)
          }}
          onDoubleClick={(e) => {
            e.stopPropagation()
            if (isFolder) actions.toggleFold(node.id)
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            e.stopPropagation()
            actions.selectNode(node.id)
            setMenu({ x: e.clientX, y: e.clientY, nodeId: node.id })
          }}
          title={isFolder ? toPlain(node.note || '') || node.name || '' : toPlain(node.front ?? '')}
        >
          {isFolder ? (
            <button
              type="button"
              className={open ? 'chev open' : 'chev'}
              onClick={(e) => {
                e.stopPropagation()
                actions.toggleFold(node.id)
              }}
              tabIndex={-1}
            >
              <IconChevron size={12} />
            </button>
          ) : (
            <span className="chev placeholder" />
          )}

          <span className={isFolder ? 'row-icon folder' : 'row-icon card'}>
            {isFolder ? open ? <IconFolderOpen size={15} /> : <IconFolder size={15} /> : <IconCard size={14} />}
          </span>

          {renaming ? (
            <input
              className="rename-input"
              defaultValue={node.name ?? ''}
              autoFocus
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => {
                const value = e.currentTarget.value.trim()
                if (value && value !== node.name) void actions.renameNode(node.id, value)
                else actions.setRenaming(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const value = e.currentTarget.value.trim()
                  if (value && value !== node.name) void actions.renameNode(node.id, value)
                  else actions.setRenaming(null)
                }
                if (e.key === 'Escape') actions.setRenaming(null)
                e.stopPropagation()
              }}
            />
          ) : (
            <span className="row-label">
              {isFolder ? node.name || '未命名' : toPlain(node.front ?? '').split('\n')[0] || '（空卡片）'}
            </span>
          )}

          {isFolder && !!toPlain(node.note || '').trim() && <span className="note-mark" title={toPlain(node.note || '').slice(0, 160)} />}
          {isFolder && kids.length > 0 && <span className="row-count">{kids.length}</span>}
        </div>

        {isFolder && open && kids.length > 0 && (
          <div className="tree-children">{kids.map((child) => renderRow(child, depth + 1))}</div>
        )}
      </div>
    )
  }

  const menuNode = menu ? byId.get(menu.nodeId) : null

  return (
    <aside className="sidebar" onClick={() => setMenu(null)}>
      <div className="side-head">
        <span className="side-title">目录</span>
        <div className="side-tools">
          <button
            type="button"
            className="icon-btn tiny"
            title="新建根文件夹"
            onClick={() => actions.openDialog({ kind: 'newFolder', parentId: null, parentName: '根目录' })}
          >
            <IconPlus size={15} />
          </button>
          <button type="button" className="icon-btn tiny" title="全部展开" onClick={actions.expandAll}>
            <IconExpand size={14} />
          </button>
          <button
            type="button"
            className="icon-btn tiny"
            title="全部收起"
            onClick={actions.collapseAll}
          >
            <span className="collapse-glyph">▾</span>
          </button>
        </div>
      </div>

      <div
        className="tree-scroll"
        onDragOver={(e) => {
          if (drag.id) e.preventDefault()
        }}
        onDrop={(e) => {
          if (!drag.id) return
          e.preventDefault()
          const rootsWithout = (childrenMap.get(null) ?? []).filter((n) => n.id !== drag.id)
          void actions.moveNode(drag.id, null, rootsWithout.length)
          setDrag({ id: null, overId: null, zone: null })
        }}
      >
        {roots.length === 0 && (
          <div className="tree-empty">
            <p>目录还是空的。</p>
            <p className="muted">先建一个「英语」「政治」这样的顶层文件夹，再往里放卡片。</p>
            <button
              type="button"
              className="btn soft small"
              onClick={() => actions.openDialog({ kind: 'newFolder', parentId: null, parentName: '根目录' })}
            >
              <IconPlus size={14} /> 新建文件夹
            </button>
          </div>
        )}
        {roots.map((node) => renderRow(node, 0))}
      </div>

      <div className="side-foot">
        {drag.id ? <span className="drag-hint">拖到此处移到根目录</span> : <span className="muted">共 {state.nodes.length} 个节点</span>}
      </div>

      {menu && menuNode && (
        <>
          <div className="menu-backdrop" onClick={() => setMenu(null)} onContextMenu={(e) => e.preventDefault()} />
          <div className="ctx-menu" style={{ left: Math.min(menu.x, window.innerWidth - 200), top: menu.y }}>
            {menuNode.type === 'folder' ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setMenu(null)
                    actions.openDialog({ kind: 'newFolder', parentId: menuNode.id, parentName: menuNode.name ?? '' })
                  }}
                >
                  <IconPlus size={14} /> 新建子文件夹
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenu(null)
                    actions.openDialog({ kind: 'cardPicker', parentId: menuNode.id, parentName: menuNode.name ?? '' })
                  }}
                >
                  <IconCard size={14} /> 添加卡片引用
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenu(null)
                    actions.selectNode(menuNode.id)
                  }}
                >
                  <IconPencil size={14} /> 编辑备注
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenu(null)
                    actions.setRenaming(menuNode.id)
                  }}
                >
                  <IconPencil size={14} /> 重命名
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenu(null)
                    actions.startRecite(menuNode.id)
                  }}
                >
                  <IconSpark size={14} /> 从这里开始背诵
                </button>
                <div className="ctx-sep" />
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    setMenu(null)
                    actions.openDialog({ kind: 'deleteFolder', node: menuNode })
                  }}
                >
                  <IconTrash size={14} /> 删除文件夹…
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setMenu(null)
                    actions.selectNode(menuNode.id)
                  }}
                >
                  <IconCard size={14} /> 查看卡片
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenu(null)
                    actions.startRecite(menuNode.parentId, menuNode.id)
                  }}
                >
                  <IconSpark size={14} /> 从这里开始背诵
                </button>
                <div className="ctx-sep" />
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    setMenu(null)
                    actions.openDialog({ kind: 'deleteRef', node: menuNode })
                  }}
                >
                  <IconTrash size={14} /> 从目录中移除…
                </button>
              </>
            )}
          </div>
        </>
      )}
    </aside>
  )
}
