import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import { IconCard, IconFolder, IconPlus, IconSearch, IconSettings, IconX } from './Icons'
import Highlight from './Highlight'

export default function TopBar(): JSX.Element {
  const { state, actions } = useStore()
  const inputRef = useRef<HTMLInputElement>(null)
  const { search } = state

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const results = search.result
  const hasResult = !!results && results.total > 0

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">速</span>
        <span className="brand-name">速记</span>
      </div>

      <nav className="tabs">
        <button
          type="button"
          className={state.view === 'tree' ? 'tab active' : 'tab'}
          onClick={() => actions.setView('tree')}
        >
          目录
        </button>
        <button
          type="button"
          className={state.view === 'structure' ? 'tab active' : 'tab'}
          onClick={() => actions.setView('structure')}
        >
          结构图
        </button>
        <button
          type="button"
          className={state.view === 'library' ? 'tab active' : 'tab'}
          onClick={() => actions.setView('library')}
        >
          卡片库
        </button>
        <button
          type="button"
          className={state.view === 'io' ? 'tab active' : 'tab'}
          onClick={() => actions.setView('io')}
        >
          导入导出
        </button>
      </nav>

      <div className="search-box">
        <IconSearch size={15} className="search-icon" />
        <input
          id="global-search"
          ref={inputRef}
          className="search-input"
          placeholder="搜索文件夹名称、备注、卡片正反面（空格分隔多个关键词）"
          value={search.keyword}
          onChange={(e) => actions.search(e.target.value)}
          onFocus={() => {
            if (search.keyword.trim()) actions.search(search.keyword)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              actions.closeSearch()
              inputRef.current?.blur()
            }
          }}
        />
        {search.loading && <span className="search-spinner" />}
        {!!search.keyword && (
          <button
            type="button"
            className="icon-btn tiny"
            title="清空搜索"
            onClick={() => {
              actions.closeSearch()
              inputRef.current?.focus()
            }}
          >
            <IconX size={14} />
          </button>
        )}

        {search.open && !!search.keyword.trim() && (
          <>
            <div className="search-backdrop" onClick={() => actions.closeSearch()} />
            <div className="search-panel">
              {search.loading && !hasResult && <div className="search-state">正在搜索…</div>}
              {!search.loading && !hasResult && <div className="search-state">没有找到匹配的内容</div>}
              {hasResult && (
                <div className="search-scroll">
                  {results!.folders.length > 0 && (
                    <div className="search-group">
                      <div className="search-group-title">
                        <IconFolder size={13} /> 文件夹 · {results!.folders.length}
                      </div>
                      {results!.folders.map((hit) => (
                        <button
                          type="button"
                          key={hit.id}
                          className="search-row"
                          onClick={() => actions.locate(hit)}
                        >
                          <span className="search-row-main">
                            <span className="search-row-title">
                              <Highlight text={hit.title} terms={results!.terms} />
                            </span>
                            {hit.snippet && (
                              <span className="search-row-sub">
                                <span className="field-tag">{hit.field === 'note' ? '备注' : '名称'}</span>
                                <Highlight text={hit.snippet} terms={results!.terms} />
                              </span>
                            )}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {results!.cards.length > 0 && (
                    <div className="search-group">
                      <div className="search-group-title">
                        <IconCard size={13} /> 卡片 · {results!.cards.length}
                      </div>
                      {results!.cards.map((hit) => (
                        <button
                          type="button"
                          key={hit.id}
                          className="search-row"
                          onClick={() => actions.locate(hit)}
                        >
                          <span className="search-row-main">
                            <span className="search-row-title">
                              <Highlight text={hit.title.split('\n')[0]} terms={results!.terms} />
                            </span>
                            <span className="search-row-sub">
                              <span className="field-tag">{hit.field === 'back' ? '背面' : '正面'}</span>
                              <Highlight text={hit.snippet} terms={results!.terms} />
                            </span>
                          </span>
                          <span className={hit.paths.length ? 'path-badge' : 'path-badge muted'}>
                            {hit.paths.length ? `${hit.paths.length} 处引用` : '未挂载'}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {hasResult && (
                <div className="search-foot">按 Esc 关闭 · 点击结果可直接定位到目录中的位置</div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="top-actions">
        <button
          type="button"
          className="btn ghost"
          onClick={() => actions.openDialog({ kind: 'newFolder', parentId: null, parentName: '根目录' })}
        >
          <IconPlus size={15} />
          新建文件夹
        </button>
        <button type="button" className="btn primary" onClick={() => actions.openDialog({ kind: 'newCard', parentId: currentFolderId(state) })}>
          <IconPlus size={15} />
          新建卡片
        </button>
        <button type="button" className="icon-btn" title="设置与备份" onClick={() => actions.openDialog({ kind: 'about' })}>
          <IconSettings size={17} />
        </button>
      </div>
    </header>
  )
}

function currentFolderId(state: { selectedNodeId: string | null; nodes: { id: string; type: string; parentId: string | null }[] }): string | null {
  if (!state.selectedNodeId) return null
  const node = state.nodes.find((n) => n.id === state.selectedNodeId)
  if (!node) return null
  return node.type === 'folder' ? node.id : node.parentId
}
