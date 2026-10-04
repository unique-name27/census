// Turns the one-file build (dist-single/index.html) into an artifact page body: the artifact host
// wraps pages in its own <!doctype html><head><body> skeleton, so we keep only the title, styles,
// the app root and the inline module script.
//   npm run build:artifact   ->   dist-artifact/census.html
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(root, 'dist-single', 'index.html')
const html = readFileSync(src, 'utf8')

const all = (re) => [...html.matchAll(re)].map((m) => m[0])
const title = html.match(/<title>[\s\S]*?<\/title>/)?.[0] ?? '<title>Census</title>'
const styles = all(/<style\b[^>]*>[\s\S]*?<\/style>/g)
const scripts = all(/<script\b[^>]*>[\s\S]*?<\/script>/g)
if (!scripts.length) {
  console.error('No inline script found; run `npm run build:single` first.')
  process.exit(1)
}

const page = [
  title,
  '<meta name="description" content="People analytics for recruiting, people stats, the org chart, HR ops, talent, compensation and AI in HR.">',
  ...styles,
  '<div id="root"></div>',
  ...scripts,
].join('\n')

const outDir = path.join(root, 'dist-artifact')
mkdirSync(outDir, { recursive: true })
const out = path.join(outDir, 'census.html')
writeFileSync(out, page)
const mb = (Buffer.byteLength(page) / 1024 / 1024).toFixed(2)
console.log(`Wrote ${path.relative(root, out)} (${mb} MB)`)
if (Buffer.byteLength(page) > 16 * 1024 * 1024) {
  console.error('Over the 16 MB artifact limit.')
  process.exit(1)
}
