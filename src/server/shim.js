/* 浏览器模式下的 window.api：把 preload 的 IPC 接口换成同源 HTTP 调用 */
;(function () {
  const jsonHeaders = { 'content-type': 'application/json' }

  async function rpc(domain, method, args) {
    const res = await fetch('/api', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ domain, method, args: args || [] })
    })
    const payload = await res.json()
    if (!payload.ok) throw new Error(payload.error || '操作失败')
    return payload.data
  }

  function download(url) {
    const a = document.createElement('a')
    a.href = url
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  function pickFile(accept) {
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = accept
      input.style.position = 'fixed'
      input.style.left = '-9999px'
      document.body.appendChild(input)
      let settled = false
      const finish = (file) => {
        if (settled) return
        settled = true
        input.remove()
        resolve(file || null)
      }
      input.addEventListener('change', () => finish(input.files && input.files[0]))
      input.addEventListener('cancel', () => finish(null))
      window.addEventListener('focus', () => setTimeout(() => finish(input.files && input.files[0]), 800), {
        once: true
      })
      input.click()
    })
  }

  window.api = {
    tree: {
      list: () => rpc('tree', 'list'),
      createFolder: (parentId, name) => rpc('tree', 'createFolder', [parentId, name]),
      createRefs: (parentId, cardIds) => rpc('tree', 'createRefs', [parentId, cardIds]),
      rename: (id, name) => rpc('tree', 'rename', [id, name]),
      setNote: (id, note) => rpc('tree', 'setNote', [id, note]),
      move: (nodeId, parentId, index) => rpc('tree', 'move', [nodeId, parentId, index]),
      removeRef: (id) => rpc('tree', 'removeRef', [id]),
      deleteFolder: (id, strategy) => rpc('tree', 'deleteFolder', [id, strategy]),
      stats: (id) => rpc('tree', 'stats', [id]),
      path: (id) => rpc('tree', 'path', [id]),
      history: (id) => rpc('tree', 'history', [id])
    },
    card: {
      list: (filter) => rpc('card', 'list', [filter || {}]),
      get: (id) => rpc('card', 'get', [id]),
      create: (input) => rpc('card', 'create', [input]),
      update: (id, input) => rpc('card', 'update', [id, input]),
      remove: (id) => rpc('card', 'remove', [id]),
      setTags: (cardId, tagIds) => rpc('card', 'setTags', [cardId, tagIds]),
      refs: (cardId) => rpc('card', 'refs', [cardId]),
      history: (id) => rpc('card', 'history', [id])
    },
    tag: {
      list: () => rpc('tag', 'list'),
      create: (name) => rpc('tag', 'create', [name]),
      rename: (id, name) => rpc('tag', 'rename', [id, name]),
      remove: (id) => rpc('tag', 'remove', [id])
    },
    search: {
      query: (keyword) => rpc('search', 'query', [keyword])
    },
    io: {
      downloadTemplate: async () => {
        download('/file/template')
        return { path: '浏览器下载', kind: 'excel', bytes: 0 }
      },
      pickImport: async () => {
        const file = await pickFile('.xlsx,.json')
        if (!file) return null
        const buffer = await file.arrayBuffer()
        const res = await fetch(`/import/upload?name=${encodeURIComponent(file.name)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/octet-stream' },
          body: buffer
        })
        const payload = await res.json()
        if (!payload.ok) throw new Error(payload.error || '解析文件失败')
        return payload.data
      },
      commitImport: (token, options) => rpc('io', 'commitImport', [token, options]),
      exportJson: async () => {
        download('/file/export-json')
        return { path: '浏览器下载', kind: 'json', bytes: 0 }
      },
      exportExcel: async () => {
        download('/file/export-excel')
        return { path: '浏览器下载', kind: 'excel', bytes: 0 }
      }
    },
    app: {
      info: () => rpc('app', 'info'),
      openDataDir: () => rpc('app', 'openDataDir'),
      backup: () => rpc('app', 'backup')
    }
  }
})()
