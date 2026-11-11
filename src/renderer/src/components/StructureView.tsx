import { useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { buildChildren } from '../lib/tree'
import { buildDiagram } from '../lib/hierarchy'
import { IconCard, IconDownload, IconFolder } from './Icons'

const FONT = '13px "PingFang SC", "Microsoft YaHei", system-ui, -apple-system, sans-serif'
const MAX_NODES = 1200

export default function StructureView(): JSX.Element {
  const { state, actions } = useStore()
  const [rootId, setRootId] = useState<string | null>(null)
  const [includeCards, setIncludeCards] = useState(true)
  const [zoom, setZoom] = useState(1)
  const [busy, setBusy] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)

  const folderOptions = useMemo(() => {
    const children = buildChildren(state.nodes.filter((n) => n.type === 'folder'))
    const list: { id: string; label: string; depth: number }[] = []
    const walk = (parentId: string | null, depth: number): void => {
      for (const node of children.get(parentId) ?? []) {
        list.push({ id: node.id, label: node.name ?? '未命名', depth })
        walk(node.id, depth + 1)
      }
    }
    walk(null, 0)
    return list
  }, [state.nodes])

  const ctx = useMemo(() => {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (context) context.font = FONT
    return context
  }, [])

  const diagram = useMemo(() => {
    if (!ctx) return null
    return buildDiagram(state.nodes, rootId, {
      includeCards,
      measure: (text) => ctx.measureText(text).width
    })
  }, [state.nodes, rootId, includeCards, ctx])

  const tooMany = (diagram?.nodes.length ?? 0) > MAX_NODES
  const rootName = rootId ? state.nodes.find((n) => n.id === rootId)?.name ?? '' : '全部目录'

  const locate = (id: string, kind: 'folder' | 'card'): void => {
    const node = state.nodes.find((n) => n.id === id)
    if (!node) return
    if (kind === 'folder') {
      actions.locate({
        kind: 'folder',
        id: node.id,
        nodeId: node.id,
        title: node.name ?? '',
        field: 'name',
        snippet: '',
        paths: [],
        refCount: 0
      })
    } else if (node.cardId) {
      actions.locate({
        kind: 'card',
        id: node.cardId,
        nodeId: node.id,
        title: node.front ?? '',
        field: 'front',
        snippet: '',
        paths: [{ nodeId: node.id, folders: [] }],
        refCount: 0
      })
    }
  }

  const renderPng = async (): Promise<Blob | null> => {
    const svg = svgRef.current
    if (!svg || !diagram) return null
    const clone = svg.cloneNode(true) as SVGSVGElement
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    clone.setAttribute('width', String(diagram.width))
    clone.setAttribute('height', String(diagram.height))
    const source = new XMLSerializer().serializeToString(clone)
    const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }))
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('图形渲染失败'))
        img.src = url
      })
      const scale = 2
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(diagram.width * scale)
      canvas.height = Math.ceil(diagram.height * scale)
      const context = canvas.getContext('2d')
      if (!context) return null
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.scale(scale, scale)
      context.drawImage(image, 0, 0)
      return await new Promise<Blob | null>((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'))
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  const download = async (): Promise<void> => {
    setBusy(true)
    try {
      const blob = await renderPng()
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `结构图_${rootName || '全部'}_${new Date().toISOString().slice(0, 10)}.png`
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 3000)
      actions.notify('结构图已导出 PNG', 'success')
    } catch (error) {
      actions.notify((error as Error).message || '导出失败', 'error')
    } finally {
      setBusy(false)
    }
  }

  const copy = async (): Promise<void> => {
    setBusy(true)
    try {
      const blob = await renderPng()
      if (!blob) return
      const item = new ClipboardItem({ 'image/png': blob })
      await navigator.clipboard.write([item])
      actions.notify('已复制到剪贴板，可直接粘贴到笔记里', 'success')
    } catch {
      actions.notify('当前环境不支持复制图片，请改用「导出 PNG」', 'error')
    } finally {
      setBusy(false)
    }
  }

  const empty = !diagram || diagram.nodes.length === 0

  return (
    <section className="structure">
      <header className="structure-head">
        <div className="structure-title">
          <h2>结构图</h2>
          <p className="muted">
            把目录树自动画成层级图：改目录结构，图跟着变。点任意节点可跳到目录里的位置。
          </p>
        </div>
        <div className="structure-actions">
          <label className="inline-field">
            <span>根节点</span>
            <select value={rootId ?? ''} onChange={(e) => setRootId(e.target.value || null)}>
              <option value="">全部（根目录）</option>
              {folderOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {'　'.repeat(option.depth)}
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="inline-check">
            <input type="checkbox" checked={includeCards} onChange={(e) => setIncludeCards(e.target.checked)} />
            显示卡片
          </label>
          <div className="zoom-group">
            <button type="button" className="btn ghost tiny" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))}>
              −
            </button>
            <button type="button" className="btn ghost tiny" onClick={() => setZoom(1)}>
              {Math.round(zoom * 100)}%
            </button>
            <button type="button" className="btn ghost tiny" onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))}>
              ＋
            </button>
          </div>
          <button type="button" className="btn ghost small" disabled={busy || empty} onClick={() => void copy()}>
            <IconCard size={14} /> 复制图片
          </button>
          <button type="button" className="btn primary small" disabled={busy || empty} onClick={() => void download()}>
            <IconDownload size={14} /> 导出 PNG
          </button>
        </div>
      </header>

      <div className="structure-meta">
        <span>{rootName}</span>
        {diagram && (
          <>
            <span className="dot-sep">·</span>
            <span>{diagram.nodes.filter((n) => n.kind === 'folder').length} 个文件夹</span>
            <span className="dot-sep">·</span>
            <span>{diagram.nodes.filter((n) => n.kind === 'card').length} 张卡片</span>
            <span className="dot-sep">·</span>
            <span>{diagram.maxDepth + 1} 层</span>
          </>
        )}
        {tooMany && <span className="warn-text">（节点较多，建议选一个更小的根节点）</span>}
      </div>

      <div className="structure-canvas">
        {empty && (
          <div className="structure-empty">
            <IconFolder size={26} />
            <p>这里还没有可以画的内容。</p>
            <p className="muted">先在「目录」里建几个文件夹，或在这个视图里换一个根节点。</p>
          </div>
        )}
        {diagram && !empty && (
          <svg
            ref={svgRef}
            className="structure-svg"
            width={Math.round(diagram.width * zoom)}
            height={Math.round(diagram.height * zoom)}
            viewBox={`0 0 ${diagram.width} ${diagram.height}`}
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect x="0" y="0" width={diagram.width} height={diagram.height} fill="#ffffff" />
            <g stroke="#c3c8d8" strokeWidth="1.2" fill="none" strokeLinecap="square">
              {diagram.lines.map((line, index) => (
                <line key={index} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
              ))}
            </g>
            <g fontFamily={'"PingFang SC", "Microsoft YaHei", system-ui, -apple-system, sans-serif'} fontSize="13">
              {diagram.nodes.map((node) => (
                <g
                  key={node.id}
                  className="diagram-node"
                  style={{ cursor: 'pointer' }}
                  onClick={() => locate(node.id, node.kind)}
                >
                  <title>{node.full}</title>
                  <rect
                    x={node.x - 4}
                    y={node.y - 12}
                    width={node.textW + 8}
                    height={24}
                    fill="transparent"
                    className="diagram-hit"
                  />
                  <text
                    x={node.x}
                    y={node.y}
                    dominantBaseline="middle"
                    fill={node.kind === 'folder' ? '#1b1f2e' : '#7a8199'}
                    fontWeight={node.kind === 'folder' ? 600 : 400}
                  >
                    {node.label}
                  </text>
                </g>
              ))}
            </g>
          </svg>
        )}
      </div>
    </section>
  )
}
