import { useState } from 'react'
import { useStore } from '../store'
import type { ImportOptions, ImportPreview, ImportResult } from '../../../shared/types'
import { formatBytes, formatDateTime } from '../lib/format'
import { IconAlert, IconCheck, IconDownload, IconUpload } from './Icons'

export default function ImportExport(): JSX.Element {
  const { state, actions } = useStore()
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [options, setOptions] = useState<ImportOptions>({ mode: 'append', reuseExistingCards: true })
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [lastExport, setLastExport] = useState<string | null>(null)
  const isJson = !!preview && preview.fileName.toLowerCase().endsWith('.json')

  const run = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true)
    try {
      await fn()
    } catch (error) {
      actions.notify((error as Error).message || '操作失败', 'error')
    } finally {
      setBusy(false)
    }
  }

  const downloadTemplate = (): void =>
    void run(async () => {
      const res = await window.api.io.downloadTemplate()
      if (res) actions.notify(`模板已保存（${formatBytes(res.bytes)}）`, 'success')
    })

  const pickFile = (): void =>
    void run(async () => {
      setResult(null)
      const data = await window.api.io.pickImport()
      if (data) {
        setPreview(data)
        if (data.fileName.toLowerCase().endsWith('.json')) {
          setOptions({ mode: 'replace', reuseExistingCards: false })
        }
        actions.notify(
          data.canImport ? '文件检查通过，可以导入' : '文件里有错误，请按提示修正后重新导入',
          data.canImport ? 'success' : 'error'
        )
      }
    })

  const commit = (): void =>
    void run(async () => {
      if (!preview) return
      const data = await window.api.io.commitImport(preview.token, options)
      setResult(data)
      setPreview(null)
      await actions.refresh()
      actions.notify('导入完成', 'success')
    })

  const exportJson = (): void =>
    void run(async () => {
      const res = await window.api.io.exportJson()
      if (res) {
        setLastExport(res.path)
        actions.notify(`备份已导出（${formatBytes(res.bytes)}）`, 'success')
      }
    })

  const exportExcel = (): void =>
    void run(async () => {
      const res = await window.api.io.exportExcel()
      if (res) {
        setLastExport(res.path)
        actions.notify(`Excel 已导出（${formatBytes(res.bytes)}）`, 'success')
      }
    })

  return (
    <section className="io-view">
      <header className="io-head">
        <h2>导入导出</h2>
        <p className="muted">
          批量建档用 Excel 模板；长期备份用 JSON（无损，含目录层级、备注、标签与卡片引用关系）。
        </p>
      </header>

      <div className="io-grid">
        <article className="io-card">
          <div className="io-step">1</div>
          <h3>下载导入模板</h3>
          <p className="muted">
            模板里包含「说明 / 目录 / 卡片 / 标签」四张表，按示例填写即可。
            <br />
            同一张卡片想挂在多个位置时，让同一个卡片编号出现在多行路径里。
          </p>
          <button type="button" className="btn soft" disabled={busy} onClick={downloadTemplate}>
            <IconDownload size={15} /> 下载模板（.xlsx）
          </button>
          <ul className="io-tips">
            <li>路径用 / 分隔层级，上级文件夹会自动补建</li>
            <li>文件夹行可以单独填写备注</li>
            <li>行的先后顺序 = 同级显示顺序</li>
          </ul>
        </article>

        <article className="io-card">
          <div className="io-step">2</div>
          <h3>批量导入 / 还原备份</h3>
          <p className="muted">
            支持两种文件：用模板填写的 <b>.xlsx</b>（新建数据），以及本程序导出的 <b>.json</b> 备份（整体还原）。
          </p>
          <button type="button" className="btn primary" disabled={busy} onClick={pickFile}>
            <IconUpload size={15} /> 选择文件并检查
          </button>

          {preview && (
            <div className="import-preview">
              <div className="preview-file">{preview.fileName}</div>
              <div className="preview-stats">
                <span>
                  文件夹 <b>{preview.folders}</b>
                </span>
                <span>
                  卡片 <b>{preview.cards}</b>
                </span>
                <span>
                  引用 <b>{preview.refs}</b>
                </span>
                <span>
                  标签 <b>{preview.tags}</b>
                </span>
                {preview.autoFolders > 0 && (
                  <span className="muted">
                    （其中自动补建 {preview.autoFolders} 个上级文件夹）
                  </span>
                )}
              </div>

              {preview.issues.length > 0 && (
                <div className="issue-box">
                  <div className="issue-head">
                    {preview.errorCount > 0 ? <IconAlert size={14} /> : <IconCheck size={14} />}
                    检查结果：{preview.errorCount} 个错误 · {preview.warnCount} 个提示
                  </div>
                  <div className="issue-list">
                    {preview.issues.map((issue, index) => (
                      <div key={index} className={issue.level === 'error' ? 'issue error' : 'issue warn'}>
                        <span className="issue-where">
                          {issue.sheet}
                          {issue.row ? ` 第 ${issue.row} 行` : ''} · {issue.column}
                        </span>
                        <span>{issue.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {isJson ? (
                <div className="issue-box">
                  <div className="issue-head">
                    <IconAlert size={14} /> 这是 JSON 完整备份，导入后会整体还原（覆盖当前全部数据）
                  </div>
                  <div className="issue-list">
                    <div className="issue warn">
                      <span className="issue-where">说明</span>
                      <span>目录层级、文件夹备注、卡片内容、标签与多引用关系都会按备份原样恢复。导入前系统已自动生成数据库快照。</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="import-options">
                  <label className="opt-row">
                    <input
                      type="radio"
                      checked={options.mode === 'append'}
                      onChange={() => setOptions((o) => ({ ...o, mode: 'append' }))}
                    />
                    <span>
                      追加到现有数据<em className="muted">（推荐）</em>
                    </span>
                  </label>
                  <label className="opt-row">
                    <input
                      type="radio"
                      checked={options.mode === 'replace'}
                      onChange={() => setOptions((o) => ({ ...o, mode: 'replace' }))}
                    />
                    <span className="danger-text">
                      清空现有数据后导入<em className="muted">（会先自动备份）</em>
                    </span>
                  </label>
                  <label className="opt-row">
                    <input
                      type="checkbox"
                      checked={options.reuseExistingCards}
                      onChange={(e) => setOptions((o) => ({ ...o, reuseExistingCards: e.target.checked }))}
                    />
                    <span>
                      正面内容已存在的卡片直接复用<em className="muted">（避免重复建卡）</em>
                    </span>
                  </label>
                </div>
              )}

              <div className="preview-actions">
                <button type="button" className="btn ghost small" onClick={() => setPreview(null)} disabled={busy}>
                  取消
                </button>
                <button
                  type="button"
                  className="btn primary small"
                  disabled={!preview.canImport || busy}
                  onClick={commit}
                >
                  开始导入
                </button>
              </div>
            </div>
          )}

          {result && (
            <div className="import-result">
              <IconCheck size={15} />
              导入完成：新增文件夹 {result.folders} 个、卡片 {result.cards} 张、引用 {result.refs} 条、标签{' '}
              {result.tags} 个
              {result.reusedCards > 0 && `，复用已有卡片 ${result.reusedCards} 张`}
            </div>
          )}
        </article>

        <article className="io-card">
          <div className="io-step">3</div>
          <h3>导出备份</h3>
          <p className="muted">
            JSON 是完整备份，换电脑或重装后可以完整还原；Excel 更接近模板格式，方便人工查看和别人接续填写。
          </p>
          <div className="io-actions">
            <button type="button" className="btn soft" disabled={busy} onClick={exportJson}>
              <IconDownload size={15} /> 导出 JSON 备份
            </button>
            <button type="button" className="btn ghost" disabled={busy} onClick={exportExcel}>
              <IconDownload size={15} /> 导出 Excel
            </button>
          </div>
          <div className="io-meta">
            <div>
              上次导出：{formatDateTime(state.info?.lastExportAt ?? null)}
              {lastExport && <span className="muted">（本次：{lastExport}）</span>}
            </div>
            <div className="muted">
              数据文件：{state.info?.dbPath ?? '—'}
              <button type="button" className="link" onClick={() => void window.api.app.openDataDir()}>
                打开目录
              </button>
            </div>
          </div>
          <div className="io-backup">
            <button
              type="button"
              className="btn ghost small"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const path = await window.api.app.backup()
                  actions.notify(`已生成数据库快照：${path}`, 'success')
                })
              }
            >
              立即备份数据库快照
            </button>
            <span className="muted small">每次导入、批量删除前也会自动快照，最多保留 10 份</span>
          </div>
        </article>
      </div>
    </section>
  )
}
