import fs from 'node:fs'
import path from 'node:path'

/**
 * 启动日志：不依赖 electron 模块，保证在 app 还没就绪、甚至模块加载失败时
 * 也能留下记录。日志写在 %APPDATA%\速记\startup.log。
 */
const dir = path.join(process.env.APPDATA || process.cwd(), '速记')
const file = path.join(dir, 'startup.log')

export function logLine(message: string): void {
  try {
    fs.mkdirSync(dir, { recursive: true })
    fs.appendFileSync(file, `[${new Date().toISOString()}] ${message}\n`)
  } catch {
    /* 日志失败不影响主流程 */
  }
}

export const logFile = file

process.on('uncaughtException', (error) => {
  logLine(`未捕获异常：${error instanceof Error ? error.stack ?? error.message : String(error)}`)
})

process.on('unhandledRejection', (reason) => {
  logLine(`未处理的 Promise 拒绝：${reason instanceof Error ? reason.stack ?? reason.message : String(reason)}`)
})

logLine(
  `===== 进程启动 pid=${process.pid} electron=${process.versions.electron ?? '无'} node=${process.versions.node} runAsNode=${process.env.ELECTRON_RUN_AS_NODE ?? '未设置'} =====`
)
