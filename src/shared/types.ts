/**
 * 主进程与渲染进程共用的类型定义。
 */

export type NodeType = 'folder' | 'card'

/** 目录树节点（文件夹 / 卡片引用，扁平返回，前端按 parentId 组装） */
export interface TreeNode {
  id: string
  parentId: string | null
  type: NodeType
  name: string | null
  note: string
  cardId: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
  /** 仅卡片节点：卡片正面 / 背面（用于树的标题与搜索） */
  front: string | null
  back: string | null
  childCount: number
}

export interface Tag {
  id: string
  name: string
  count: number
}

export interface CardSummary {
  id: string
  front: string
  back: string
  tags: Tag[]
  refCount: number
  createdAt: string
  updatedAt: string
}

/** 一条引用路径：目录链 + 对应的树节点 */
export interface NodePath {
  nodeId: string
  folders: { id: string; name: string }[]
}

export interface CardDetail extends CardSummary {
  refs: NodePath[]
}

/** 保存前的历史版本（用于误删回退） */
export interface HistoryEntry {
  id: string
  field: 'front' | 'back' | 'note'
  content: string
  createdAt: string
}

export interface CardInput {
  front: string
  back: string
  tagIds: string[]
}

export interface CardFilter {
  keyword?: string
  tagIds?: string[]
  tagMode?: 'and' | 'or'
  unmountedOnly?: boolean
}

export type DeleteStrategy = 'lift' | 'detach' | 'cascade'

export interface SubtreeStats {
  folders: number
  refs: number
  cards: number
  cardsOutside: number
}

export type SearchField = 'name' | 'note' | 'front' | 'back'

export interface SearchHit {
  kind: 'folder' | 'card'
  /** 文件夹命中为节点 id；卡片命中为卡片 id */
  id: string
  nodeId: string | null
  title: string
  field: SearchField
  snippet: string
  paths: NodePath[]
  refCount: number
}

export interface SearchResult {
  keyword: string
  terms: string[]
  folders: SearchHit[]
  cards: SearchHit[]
  total: number
}

export interface ImportIssue {
  sheet: string
  row: number
  column: string
  message: string
  level: 'error' | 'warn'
}

export interface ImportPreview {
  token: string
  fileName: string
  folders: number
  cards: number
  refs: number
  tags: number
  autoFolders: number
  issues: ImportIssue[]
  errorCount: number
  warnCount: number
  canImport: boolean
}

export interface ImportOptions {
  mode: 'append' | 'replace'
  reuseExistingCards: boolean
}

export interface ImportResult {
  folders: number
  cards: number
  refs: number
  tags: number
  reusedCards: number
}

export interface AppInfo {
  version: string
  dataDir: string
  dbPath: string
  nodeCount: number
  cardCount: number
  tagCount: number
  importCount: number
  lastExportAt: string | null
  lastImportAt: string | null
}

export interface ExportResult {
  path: string
  kind: 'json' | 'excel'
  bytes: number
}

/** preload 暴露给渲染进程的 API 形状 */
export interface Api {
  tree: {
    list(): Promise<TreeNode[]>
    createFolder(parentId: string | null, name: string): Promise<TreeNode>
    createRefs(parentId: string | null, cardIds: string[]): Promise<number>
    rename(id: string, name: string): Promise<void>
    setNote(id: string, note: string): Promise<void>
    move(nodeId: string, parentId: string | null, index: number): Promise<void>
    removeRef(id: string): Promise<void>
    deleteFolder(id: string, strategy: DeleteStrategy): Promise<SubtreeStats>
    stats(id: string): Promise<SubtreeStats>
    path(id: string): Promise<{ id: string; name: string }[]>
    history(id: string): Promise<HistoryEntry[]>
  }
  card: {
    list(filter: CardFilter): Promise<CardSummary[]>
    get(id: string): Promise<CardDetail>
    create(input: CardInput): Promise<CardDetail>
    update(id: string, input: CardInput): Promise<CardDetail>
    remove(id: string): Promise<void>
    setTags(cardId: string, tagIds: string[]): Promise<CardDetail>
    refs(cardId: string): Promise<NodePath[]>
    history(id: string): Promise<HistoryEntry[]>
  }
  tag: {
    list(): Promise<Tag[]>
    create(name: string): Promise<Tag>
    rename(id: string, name: string): Promise<Tag>
    remove(id: string): Promise<void>
  }
  search: {
    query(keyword: string): Promise<SearchResult>
  }
  io: {
    downloadTemplate(): Promise<ExportResult | null>
    pickImport(): Promise<ImportPreview | null>
    commitImport(token: string, options: ImportOptions): Promise<ImportResult>
    exportJson(): Promise<ExportResult | null>
    exportExcel(): Promise<ExportResult | null>
  }
  app: {
    info(): Promise<AppInfo>
    openDataDir(): Promise<void>
    backup(): Promise<string>
  }
}
