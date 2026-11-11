import { build } from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const outDir = path.join(root, 'out', 'server')
fs.mkdirSync(outDir, { recursive: true })

await build({
  entryPoints: [path.join(root, 'src/server/index.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  outfile: path.join(outDir, 'index.cjs'),
  logLevel: 'error'
})

fs.copyFileSync(path.join(root, 'src/server/shim.js'), path.join(outDir, 'shim.js'))
console.log('浏览器模式服务端已构建到 out/server')
