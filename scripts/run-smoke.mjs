import { build } from 'esbuild'
import path from 'node:path'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const bundlePath = path.join(root, '.tmp', 'smoke.cjs')
fs.mkdirSync(path.dirname(bundlePath), { recursive: true })

await build({
  entryPoints: [path.join(root, 'scripts/smoke.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  outfile: bundlePath,
  logLevel: 'error'
})

const result = spawnSync(process.execPath, [bundlePath], { stdio: 'inherit' })
process.exit(result.status ?? 1)
