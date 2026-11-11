import { contextBridge, ipcRenderer } from 'electron'
import type { Api } from '../shared/types'

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const response = (await ipcRenderer.invoke(channel, ...args)) as { ok: boolean; data?: T; error?: string }
  if (!response || typeof response !== 'object') throw new Error('主进程没有响应')
  if (!response.ok) throw new Error(response.error || '操作失败')
  return response.data as T
}

const api: Api = {
  tree: {
    list: () => call('tree:list'),
    createFolder: (parentId, name) => call('tree:createFolder', parentId, name),
    createRefs: (parentId, cardIds) => call('tree:createRefs', parentId, cardIds),
    rename: (id, name) => call('tree:rename', id, name),
    setNote: (id, note) => call('tree:note', id, note),
    move: (nodeId, parentId, index) => call('tree:move', nodeId, parentId, index),
    removeRef: (id) => call('tree:removeRef', id),
    deleteFolder: (id, strategy) => call('tree:deleteFolder', id, strategy),
    stats: (id) => call('tree:stats', id),
    path: (id) => call('tree:path', id),
    history: (id) => call('tree:history', id)
  },
  card: {
    list: (filter) => call('card:list', filter),
    get: (id) => call('card:get', id),
    create: (input) => call('card:create', input),
    update: (id, input) => call('card:update', id, input),
    remove: (id) => call('card:remove', id),
    setTags: (cardId, tagIds) => call('card:setTags', cardId, tagIds),
    refs: (cardId) => call('card:refs', cardId),
    history: (id) => call('card:history', id)
  },
  tag: {
    list: () => call('tag:list'),
    create: (name) => call('tag:create', name),
    rename: (id, name) => call('tag:rename', id, name),
    remove: (id) => call('tag:remove', id)
  },
  search: {
    query: (keyword) => call('search:query', keyword)
  },
  io: {
    downloadTemplate: () => call('io:template'),
    pickImport: () => call('io:pickImport'),
    commitImport: (token, options) => call('io:commitImport', token, options),
    exportJson: () => call('io:exportJson'),
    exportExcel: () => call('io:exportExcel')
  },
  app: {
    info: () => call('app:info'),
    openDataDir: () => call('app:openDataDir'),
    backup: () => call('app:backup')
  }
}

contextBridge.exposeInMainWorld('api', api)
