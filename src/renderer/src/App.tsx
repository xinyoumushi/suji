import { AppProvider, useStore } from './store'
import TopBar from './components/TopBar'
import TreePanel from './components/TreePanel'
import CardLibrary from './components/CardLibrary'
import ImportExport from './components/ImportExport'
import StructureView from './components/StructureView'
import CardDetail from './components/CardDetail'
import FolderDetail from './components/FolderDetail'
import DialogHost from './components/Dialogs'
import ReciteOverlay from './components/ReciteOverlay'
import Toast, { GlobalKeys } from './components/Toast'
import { IconCard, IconFolder } from './components/Icons'

/** 未选中任何节点时的空白提示 */
function EmptyHint(): JSX.Element {
  return (
    <div className="empty-hint">
      <IconFolder size={22} />
      <p>从左侧选择一个文件夹或卡片</p>
    </div>
  )
}

function DetailPane(): JSX.Element {
  const { state } = useStore()
  if (state.cardDetail) return <CardDetail />
  const selected = state.nodes.find((n) => n.id === state.selectedNodeId)
  if (selected?.type === 'folder') return <FolderDetail />
  return <EmptyHint />
}

function StatusBar(): JSX.Element {
  const { state, actions } = useStore()
  const info = state.info
  return (
    <footer className="statusbar">
      <span className="status-item">
        <IconFolder size={12} /> {info?.nodeCount ?? 0} 个节点
      </span>
      <span className="status-item">
        <IconCard size={12} /> {info?.cardCount ?? 0} 张卡片
      </span>
      <span className="status-item">#{info?.tagCount ?? 0} 个标签</span>
      <span className="status-spacer" />
      <span className="status-muted">{state.recite ? '背诵中' : '数据已保存到本机'}</span>
      <button type="button" className="link tiny" onClick={() => actions.openDialog({ kind: 'tagManager' })}>
        管理标签
      </button>
      <button type="button" className="link tiny" onClick={() => void window.api.app.openDataDir()}>
        数据目录
      </button>
    </footer>
  )
}

function Shell(): JSX.Element {
  const { state } = useStore()
  return (
    <div className="app">
      <GlobalKeys />
      <TopBar />
      <div className="workspace">
        {state.view === 'tree' && <TreePanel />}
        <main className="main">
          {state.view === 'tree' && <DetailPane />}
          {state.view === 'structure' && <StructureView />}
          {state.view === 'library' && <CardLibrary />}
          {state.view === 'io' && <ImportExport />}
        </main>
      </div>
      <StatusBar />
      <DialogHost />
      <ReciteOverlay />
      <Toast />
    </div>
  )
}

export default function App(): JSX.Element {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  )
}
