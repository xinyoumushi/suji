import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import type {
  AppInfo,
  CardDetail,
  CardInput,
  DeleteStrategy,
  HistoryEntry,
  SearchHit,
  SearchResult,
  Tag,
  TreeNode
} from '../../shared/types'
import { ancestorsOf, collectCardNodes } from './lib/tree'

export type ViewKey = 'tree' | 'structure' | 'library' | 'io'
export type ToastKind = 'success' | 'error' | 'info'

export interface ToastState {
  id: number
  text: string
  kind: ToastKind
}

export interface ReciteState {
  queue: string[]
  index: number
  flipped: boolean
  title: string
}

export type DialogState =
  | { kind: 'confirm'; title: string; message: string; confirmText?: string; danger?: boolean; onConfirm: () => void }
  | { kind: 'deleteFolder'; node: TreeNode }
  | { kind: 'deleteRef'; node: TreeNode }
  | { kind: 'deleteCard'; card: CardDetail }
  | { kind: 'deleteTag'; tag: Tag }
  | { kind: 'cardPicker'; parentId: string | null; parentName: string; cardId?: string }
  | { kind: 'newFolder'; parentId: string | null; parentName: string }
  | { kind: 'newCard'; parentId: string | null }
  | { kind: 'tagManager' }
  | { kind: 'about' }
  | {
      kind: 'history'
      entityType: 'card' | 'folder'
      entityId: string
      title: string
      current: Partial<Record<'front' | 'back' | 'note', string>>
      onRestore: (entry: HistoryEntry) => void
    }

export interface SearchUiState {
  keyword: string
  result: SearchResult | null
  loading: boolean
  open: boolean
}

export interface AppState {
  ready: boolean
  nodes: TreeNode[]
  tags: Tag[]
  info: AppInfo | null
  expanded: Set<string>
  selectedNodeId: string | null
  selectedCardId: string | null
  cardDetail: CardDetail | null
  view: ViewKey
  search: SearchUiState
  dialog: DialogState | null
  toast: ToastState | null
  recite: ReciteState | null
  flashId: string | null
  renamingId: string | null
  dirty: boolean
}

const EXPAND_KEY = 'suji.expanded.v1'

function loadExpanded(): Set<string> {
  try {
    const raw = localStorage.getItem(EXPAND_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? new Set(parsed as string[]) : new Set()
  } catch {
    return new Set()
  }
}

const initialState: AppState = {
  ready: false,
  nodes: [],
  tags: [],
  info: null,
  expanded: new Set(),
  selectedNodeId: null,
  selectedCardId: null,
  cardDetail: null,
  view: 'tree',
  search: { keyword: '', result: null, loading: false, open: false },
  dialog: null,
  toast: null,
  recite: null,
  flashId: null,
  renamingId: null,
  dirty: false
}

interface Actions {
  refresh: () => Promise<void>
  selectNode: (id: string) => void
  selectCard: (id: string) => void
  clearSelection: () => void
  toggleFold: (id: string) => void
  expandAll: () => void
  collapseAll: () => void
  setView: (view: ViewKey) => void
  setRenaming: (id: string | null) => void
  setDirty: (dirty: boolean) => void
  notify: (text: string, kind?: ToastKind) => void
  guardDirty: (next: () => void) => void
  createFolder: (parentId: string | null, name: string) => Promise<TreeNode | null>
  addRefs: (parentId: string | null, cardIds: string[]) => Promise<void>
  moveNode: (nodeId: string, parentId: string | null, index: number) => Promise<void>
  renameNode: (id: string, name: string) => Promise<void>
  updateNote: (id: string, note: string) => Promise<void>
  deleteFolder: (id: string, strategy: DeleteStrategy) => Promise<void>
  removeRef: (id: string) => Promise<void>
  saveCard: (id: string, input: CardInput) => Promise<void>
  createCard: (input: CardInput, mountParentId: string | null) => Promise<void>
  removeCard: (id: string) => Promise<void>
  setCardTags: (cardId: string, tagIds: string[]) => Promise<void>
  createTag: (name: string) => Promise<Tag | null>
  renameTag: (id: string, name: string) => Promise<void>
  deleteTag: (id: string) => Promise<void>
  search: (keyword: string) => void
  closeSearch: () => void
  locate: (hit: SearchHit) => void
  openDialog: (dialog: DialogState) => void
  closeDialog: () => void
  startRecite: (folderId: string | null, startNodeId?: string) => void
  reciteNext: () => void
  recitePrev: () => void
  reciteFlip: () => void
  reciteExit: () => void
}

interface Store {
  state: AppState
  actions: Actions
}

const StoreContext = createContext<Store | null>(null)

export function useStore(): Store {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore 必须在 AppProvider 内使用')
  return ctx
}

export function AppProvider({ children }: { children: ReactNode }): JSX.Element {
  const [state, setState] = useState<AppState>(initialState)
  const stateRef = useRef(state)
  stateRef.current = state

  const patch = useCallback((partial: Partial<AppState>) => {
    setState((prev) => ({ ...prev, ...partial }))
  }, [])

  const notify = useCallback((text: string, kind: ToastKind = 'success') => {
    const id = Date.now() + Math.random()
    setState((prev) => ({ ...prev, toast: { id, text, kind } }))
    setTimeout(() => {
      setState((prev) => (prev.toast && prev.toast.id === id ? { ...prev, toast: null } : prev))
    }, kind === 'error' ? 4200 : 2400)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const [nodes, tags, info] = await Promise.all([window.api.tree.list(), window.api.tag.list(), window.api.app.info()])
      const current = stateRef.current
      const stillExists = current.selectedNodeId ? nodes.some((n) => n.id === current.selectedNodeId) : false
      setState((prev) => ({
        ...prev,
        nodes,
        tags,
        info,
        ready: true,
        selectedNodeId: stillExists ? prev.selectedNodeId : null
      }))
      if (current.selectedCardId) {
        try {
          const detail = await window.api.card.get(current.selectedCardId)
          setState((prev) => ({ ...prev, cardDetail: detail }))
        } catch {
          setState((prev) => ({ ...prev, cardDetail: null, selectedCardId: null }))
        }
      }
    } catch (error) {
      notify((error as Error).message, 'error')
    }
  }, [notify])

  useEffect(() => {
    patch({ expanded: loadExpanded() })
    void refresh()
  }, [patch, refresh])

  useEffect(() => {
    try {
      localStorage.setItem(EXPAND_KEY, JSON.stringify(Array.from(state.expanded)))
    } catch {
      /* ignore */
    }
  }, [state.expanded])

  const loadCard = useCallback(
    async (cardId: string) => {
      try {
        const detail = await window.api.card.get(cardId)
        setState((prev) => ({ ...prev, selectedCardId: cardId, cardDetail: detail, dirty: false }))
      } catch (error) {
        setState((prev) => ({ ...prev, selectedCardId: null, cardDetail: null }))
        notify((error as Error).message, 'error')
      }
    },
    [notify]
  )

  const guardDirty = useCallback(
    (next: () => void) => {
      if (!stateRef.current.dirty) {
        next()
        return
      }
      setState((prev) => ({
        ...prev,
        dialog: {
          kind: 'confirm',
          title: '有未保存的修改',
          message: '当前卡片的修改还没有保存，继续操作会丢失这些修改。',
          confirmText: '放弃修改并继续',
          danger: true,
          onConfirm: () => {
            setState((x) => ({ ...x, dirty: false, dialog: null }))
            next()
          }
        }
      }))
    },
    []
  )

  const selectNode = useCallback(
    (id: string) => {
      const node = stateRef.current.nodes.find((n) => n.id === id)
      if (!node) return
      guardDirty(() => {
        if (node.type === 'folder') {
          setState((prev) => ({
            ...prev,
            selectedNodeId: id,
            selectedCardId: null,
            cardDetail: null,
            view: 'tree',
            dirty: false
          }))
        } else if (node.cardId) {
          setState((prev) => ({ ...prev, selectedNodeId: id, view: 'tree' }))
          void loadCard(node.cardId)
        }
      })
    },
    [guardDirty, loadCard]
  )

  const selectCard = useCallback(
    (id: string) => {
      guardDirty(() => {
        setState((prev) => ({ ...prev, selectedNodeId: null }))
        void loadCard(id)
      })
    },
    [guardDirty, loadCard]
  )

  const clearSelection = useCallback(() => {
    patch({ selectedNodeId: null, selectedCardId: null, cardDetail: null, dirty: false })
  }, [patch])

  const toggleFold = useCallback((id: string) => {
    setState((prev) => {
      const next = new Set(prev.expanded)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { ...prev, expanded: next }
    })
  }, [])

  const expandAll = useCallback(() => {
    setState((prev) => ({
      ...prev,
      expanded: new Set(prev.nodes.filter((n) => n.type === 'folder').map((n) => n.id))
    }))
  }, [])

  const collapseAll = useCallback(() => {
    patch({ expanded: new Set() })
  }, [patch])

  const setView = useCallback(
    (view: ViewKey) => {
      guardDirty(() => patch({ view }))
    },
    [guardDirty, patch]
  )

  const wrap = useCallback(
    async (fn: () => Promise<void>, success?: string) => {
      try {
        await fn()
        if (success) notify(success, 'success')
      } catch (error) {
        notify((error as Error).message || '操作失败', 'error')
      }
    },
    [notify]
  )

  const createFolder = useCallback(
    async (parentId: string | null, name: string) => {
      try {
        const node = await window.api.tree.createFolder(parentId, name)
        await refresh()
        setState((prev) => ({
          ...prev,
          expanded: parentId ? new Set([...prev.expanded, parentId]) : prev.expanded,
          selectedNodeId: node.id,
          selectedCardId: null,
          cardDetail: null,
          dialog: null
        }))
        return node
      } catch (error) {
        notify((error as Error).message, 'error')
        return null
      }
    },
    [notify, refresh]
  )

  const addRefs = useCallback(
    async (parentId: string | null, cardIds: string[]) => {
      await wrap(async () => {
        const count = await window.api.tree.createRefs(parentId, cardIds)
        await refresh()
        setState((prev) => ({
          ...prev,
          expanded: parentId ? new Set([...prev.expanded, parentId]) : prev.expanded,
          dialog: null
        }))
        notify(`已挂载 ${count} 条卡片引用`, 'success')
      })
    },
    [notify, refresh, wrap]
  )

  const moveNode = useCallback(
    async (nodeId: string, parentId: string | null, index: number) => {
      await wrap(async () => {
        await window.api.tree.move(nodeId, parentId, index)
        await refresh()
      })
    },
    [refresh, wrap]
  )

  const renameNode = useCallback(
    async (id: string, name: string) => {
      await wrap(
        async () => {
          await window.api.tree.rename(id, name)
          await refresh()
          patch({ renamingId: null })
        },
        '已重命名'
      )
    },
    [patch, refresh, wrap]
  )

  const updateNote = useCallback(
    async (id: string, note: string) => {
      try {
        await window.api.tree.setNote(id, note)
        setState((prev) => ({ ...prev, nodes: prev.nodes.map((n) => (n.id === id ? { ...n, note } : n)) }))
      } catch (error) {
        notify((error as Error).message, 'error')
      }
    },
    [notify]
  )

  const deleteFolder = useCallback(
    async (id: string, strategy: DeleteStrategy) => {
      const node = stateRef.current.nodes.find((n) => n.id === id)
      await wrap(async () => {
        const stats = await window.api.tree.deleteFolder(id, strategy)
        await refresh()
        setState((prev) => ({
          ...prev,
          dialog: null,
          selectedNodeId: node?.parentId ?? null,
          selectedCardId: null,
          cardDetail: null
        }))
        const detail =
          strategy === 'cascade'
            ? `已删除 ${stats.folders} 个文件夹、${stats.cards} 张卡片的全部数据`
            : `已删除 ${stats.folders} 个文件夹、${stats.refs} 条引用，保留 ${stats.cards} 张卡片`
        notify(detail, 'success')
      })
    },
    [notify, refresh, wrap]
  )

  const removeRef = useCallback(
    async (id: string) => {
      const node = stateRef.current.nodes.find((n) => n.id === id)
      await wrap(async () => {
        await window.api.tree.removeRef(id)
        await refresh()
        setState((prev) => ({
          ...prev,
          dialog: null,
          selectedNodeId: node?.parentId ?? null,
          selectedCardId: null,
          cardDetail: null
        }))
        notify('已从目录中移除该引用，卡片本体保留', 'success')
      })
    },
    [notify, refresh, wrap]
  )

  const saveCard = useCallback(
    async (id: string, input: CardInput) => {
      await wrap(async () => {
        const detail = await window.api.card.update(id, input)
        await refresh()
        setState((prev) => ({ ...prev, cardDetail: detail, dirty: false }))
        notify('已保存，所有引用位置同步更新', 'success')
      })
    },
    [notify, refresh, wrap]
  )

  const createCard = useCallback(
    async (input: CardInput, mountParentId: string | null) => {
      await wrap(async () => {
        const detail = await window.api.card.create(input)
        if (mountParentId) await window.api.tree.createRefs(mountParentId, [detail.id])
        await refresh()
        setState((prev) => ({
          ...prev,
          cardDetail: detail,
          selectedCardId: detail.id,
          selectedNodeId: null,
          dialog: null
        }))
        notify(mountParentId ? '卡片已创建并挂载到当前文件夹' : '卡片已创建', 'success')
      })
    },
    [notify, refresh, wrap]
  )

  const removeCard = useCallback(
    async (id: string) => {
      await wrap(async () => {
        await window.api.card.remove(id)
        await refresh()
        patch({ dialog: null, cardDetail: null, selectedCardId: null, selectedNodeId: null })
        notify('卡片已删除，目录中的所有引用同时消失', 'success')
      })
    },
    [notify, patch, refresh, wrap]
  )

  const setCardTags = useCallback(
    async (cardId: string, tagIds: string[]) => {
      await wrap(async () => {
        const detail = await window.api.card.setTags(cardId, tagIds)
        await refresh()
        patch({ cardDetail: detail })
      })
    },
    [patch, refresh, wrap]
  )

  const createTag = useCallback(
    async (name: string) => {
      try {
        const tag = await window.api.tag.create(name)
        await refresh()
        return tag
      } catch (error) {
        notify((error as Error).message, 'error')
        return null
      }
    },
    [notify, refresh]
  )

  const renameTag = useCallback(
    async (id: string, name: string) => {
      await wrap(async () => {
        await window.api.tag.rename(id, name)
        await refresh()
      })
    },
    [refresh, wrap]
  )

  const deleteTag = useCallback(
    async (id: string) => {
      await wrap(async () => {
        await window.api.tag.remove(id)
        await refresh()
        patch({ dialog: null })
        notify('标签已删除，卡片本体不受影响', 'success')
      })
    },
    [notify, patch, refresh, wrap]
  )

  const searchTimer = useRef<number | null>(null)

  const search = useCallback((keyword: string) => {
    setState((prev) => ({ ...prev, search: { ...prev.search, keyword } }))
    if (searchTimer.current) window.clearTimeout(searchTimer.current)
    if (!keyword.trim()) {
      setState((prev) => ({ ...prev, search: { keyword, result: null, loading: false, open: false } }))
      return
    }
    setState((prev) => ({ ...prev, search: { ...prev.search, keyword, loading: true, open: true } }))
    searchTimer.current = window.setTimeout(async () => {
      try {
        const result = await window.api.search.query(keyword)
        setState((prev) =>
          prev.search.keyword === keyword ? { ...prev, search: { ...prev.search, result, loading: false } } : prev
        )
      } catch (error) {
        notify((error as Error).message, 'error')
        setState((prev) => ({ ...prev, search: { ...prev.search, loading: false } }))
      }
    }, 240)
  }, [notify])

  const closeSearch = useCallback(() => {
    setState((prev) => ({ ...prev, search: { keyword: '', result: null, loading: false, open: false } }))
  }, [])

  const flash = useCallback((id: string) => {
    setState((prev) => ({ ...prev, flashId: id }))
    window.setTimeout(() => {
      setState((prev) => (prev.flashId === id ? { ...prev, flashId: null } : prev))
    }, 1600)
  }, [])

  const locate = useCallback(
    (hit: SearchHit) => {
      const current = stateRef.current
      setState((prev) => ({ ...prev, search: { ...prev.search, open: false }, view: 'tree' }))
      if (hit.kind === 'folder' && hit.nodeId) {
        const chain = ancestorsOf(current.nodes, hit.nodeId)
        setState((prev) => ({ ...prev, expanded: new Set([...prev.expanded, ...chain]) }))
        setState((prev) => ({ ...prev, selectedNodeId: hit.nodeId, selectedCardId: null, cardDetail: null }))
        flash(hit.nodeId)
        return
      }
      const target = hit.paths[0]
      if (target) {
        const chain = ancestorsOf(current.nodes, target.nodeId)
        setState((prev) => ({ ...prev, expanded: new Set([...prev.expanded, ...chain]) }))
        setState((prev) => ({ ...prev, selectedNodeId: target.nodeId }))
        void loadCard(hit.id)
        flash(target.nodeId)
      } else {
        void loadCard(hit.id)
        notify('这张卡片还没有挂载到目录，可以在卡片详情里选择文件夹挂载', 'info')
      }
    },
    [flash, loadCard, notify]
  )

  const openDialog = useCallback((dialog: DialogState) => patch({ dialog }), [patch])
  const closeDialog = useCallback(() => patch({ dialog: null }), [patch])

  const startRecite = useCallback(
    (folderId: string | null, startNodeId?: string) => {
      const current = stateRef.current
      const queue = collectCardNodes(current.nodes, folderId)
      const target = startNodeId ?? current.selectedNodeId
      let startIndex = target ? queue.indexOf(target) : 0
      if (startIndex < 0) startIndex = 0
      if (!queue.length) {
        notify('这个位置还没有卡片可以背诵', 'info')
        return
      }
      const folder = folderId ? current.nodes.find((n) => n.id === folderId) : null
      setState((prev) => ({
        ...prev,
        search: { ...prev.search, open: false },
        recite: {
          queue,
          index: startIndex,
          flipped: false,
          title: folder ? `背诵 · ${folder.name ?? ''}` : '背诵 · 全部卡片'
        }
      }))
    },
    [notify]
  )

  const reciteNext = useCallback(() => {
    setState((prev) => {
      if (!prev.recite) return prev
      const index = Math.min(prev.recite.index + 1, prev.recite.queue.length - 1)
      return { ...prev, recite: { ...prev.recite, index, flipped: false } }
    })
  }, [])

  const recitePrev = useCallback(() => {
    setState((prev) => {
      if (!prev.recite) return prev
      const index = Math.max(prev.recite.index - 1, 0)
      return { ...prev, recite: { ...prev.recite, index, flipped: false } }
    })
  }, [])

  const reciteFlip = useCallback(() => {
    setState((prev) => (prev.recite ? { ...prev, recite: { ...prev.recite, flipped: !prev.recite.flipped } } : prev))
  }, [])

  const reciteExit = useCallback(() => patch({ recite: null }), [patch])

  const setRenaming = useCallback((id: string | null) => patch({ renamingId: id }), [patch])
  const setDirty = useCallback((dirty: boolean) => patch({ dirty }), [patch])

  const actions = useMemo<Actions>(
    () => ({
      refresh,
      selectNode,
      selectCard,
      clearSelection,
      toggleFold,
      expandAll,
      collapseAll,
      setView,
      setRenaming,
      setDirty,
      notify,
      guardDirty,
      createFolder,
      addRefs,
      moveNode,
      renameNode,
      updateNote,
      deleteFolder,
      removeRef,
      saveCard,
      createCard,
      removeCard,
      setCardTags,
      createTag,
      renameTag,
      deleteTag,
      search,
      closeSearch,
      locate,
      openDialog,
      closeDialog,
      startRecite,
      reciteNext,
      recitePrev,
      reciteFlip,
      reciteExit
    }),
    [
      refresh,
      selectNode,
      selectCard,
      clearSelection,
      toggleFold,
      expandAll,
      collapseAll,
      setView,
      setRenaming,
      setDirty,
      notify,
      guardDirty,
      createFolder,
      addRefs,
      moveNode,
      renameNode,
      updateNote,
      deleteFolder,
      removeRef,
      saveCard,
      createCard,
      removeCard,
      setCardTags,
      createTag,
      renameTag,
      deleteTag,
      search,
      closeSearch,
      locate,
      openDialog,
      closeDialog,
      startRecite,
      reciteNext,
      recitePrev,
      reciteFlip,
      reciteExit
    ]
  )

  const value = useMemo<Store>(() => ({ state, actions }), [state, actions])
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}
