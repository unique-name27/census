// Copies the one-file build to the project root as census.html (next to "Launch Census.bat").
import { copyFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(root, 'dist-single', 'index.html')
if (!existsSync(src)) {
  console.error('dist-single/index.html not found')
  process.exit(1)
}
copyFileSync(src, path.join(root, 'census.html'))
console.log('Wrote census.html')
