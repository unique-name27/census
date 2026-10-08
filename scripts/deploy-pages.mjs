// Publishes the one-file build to GitHub Pages (the gh-pages branch).
//   npm run deploy   ->   builds census.html, then pushes it as index.html to gh-pages
// When public/access-policy.json exists (the Security center's published policy), it goes beside
// index.html as access-policy.json, and census.html must carry it (the one-file build embeds it).
// The file list is in scripts/pagesFiles.mjs.
import { execSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { POLICY_SOURCE, pagesFiles, policyProblem } from './pagesFiles.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: 'inherit' })
const out = (cmd, cwd = root) => execSync(cmd, { cwd }).toString().trim()

const files = pagesFiles((p) => existsSync(path.join(root, p)))
if (files.some((f) => f.from === POLICY_SOURCE)) {
  const problem = policyProblem(
    readFileSync(path.join(root, POLICY_SOURCE), 'utf8'),
    readFileSync(path.join(root, 'census.html'), 'utf8'),
  )
  if (problem) {
    console.error(`Not published. ${problem}`)
    process.exit(1)
  }
}

const remote = out('git remote get-url origin')
const sha = out('git rev-parse --short HEAD')
const dir = mkdtempSync(path.join(tmpdir(), 'census-pages-'))
try {
  for (const f of files)
    if (f.from) copyFileSync(path.join(root, f.from), path.join(dir, f.to))
    else writeFileSync(path.join(dir, f.to), '')
  run('git init -q -b gh-pages', dir)
  run('git add -A', dir)
  run(`git commit -q -m "Publish Census (one-file build of main@${sha})"`, dir)
  run(`git push -q -f ${remote} gh-pages`, dir)
  console.log(`Published ${files.map((f) => f.to).join(', ')}. GitHub Pages updates in about a minute.`)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
