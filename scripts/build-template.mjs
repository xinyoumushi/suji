import { build } from 'esbuild'
import path from 'node:path'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const bundlePath = path.join(root, '.tmp', 'io-bundle.mjs')
fs.mkdirSync(path.dirname(bundlePath), { recursive: true })

await build({
  entryPoints: [path.join(root, 'src/main/services/io.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  external: ['electron', 'exceljs'],
  outfile: bundlePath,
  logLevel: 'error'
})

const mod = await import(pathToFileURL(bundlePath).href)
const target = path.join(root, '导入模板.xlsx')
const bytes = await mod.writeTemplate(target)
console.log(`已生成 ${target}（${(bytes / 1024).toFixed(1)} KB）`)
