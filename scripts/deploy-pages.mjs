// Publishes the one-file build to GitHub Pages (the gh-pages branch).
//   npm run deploy   ->   builds census.html, then pushes it as index.html to gh-pages
import { execSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: 'inherit' })
const out = (cmd, cwd = root) => execSync(cmd, { cwd }).toString().trim()

const remote = out('git remote get-url origin')
const sha = out('git rev-parse --short HEAD')
const dir = mkdtempSync(path.join(tmpdir(), 'census-pages-'))
try {
  copyFileSync(path.join(root, 'census.html'), path.join(dir, 'index.html'))
  copyFileSync(path.join(root, 'census.html'), path.join(dir, 'census.html'))
  writeFileSync(path.join(dir, '.nojekyll'), '')
  run('git init -q -b gh-pages', dir)
  run('git add -A', dir)
  run(`git commit -q -m "Publish Census (one-file build of main@${sha})"`, dir)
  run(`git push -q -f ${remote} gh-pages`, dir)
  console.log('Published. GitHub Pages updates in about a minute.')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
