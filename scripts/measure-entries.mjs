import { execSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const manifestPath = 'dist/.vite/manifest.json'

if (!existsSync(manifestPath)) {
  console.error('no manifest — run `npm run build` first')
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

const collect = (key, seen = new Set()) => {
  if (seen.has(key)) return seen
  seen.add(key)
  const chunk = manifest[key]
  if (!chunk) return seen
  for (const imported of chunk.imports ?? []) collect(imported, seen)
  return seen
}

const sizeOf = (file) => {
  const bytes = readFileSync(`dist/${file}`)
  return { raw: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length }
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`

const rows = []

for (const [key, chunk] of Object.entries(manifest)) {
  if (!chunk.isEntry) continue

  const files = new Set()
  for (const dep of collect(key)) {
    const entry = manifest[dep]
    if (!entry) continue
    files.add(entry.file)
    for (const css of entry.css ?? []) files.add(css)
  }

  let raw = 0
  let gzip = 0
  for (const file of files) {
    const size = sizeOf(file)
    raw += size.raw
    gzip += size.gzip
  }

  rows.push({ page: key.replace(/\.html$/, ''), files: files.size, raw, gzip })
}

rows.sort((a, b) => b.gzip - a.gzip)

console.log(
  `${'page'.padEnd(16)}${'files'.padStart(6)}${'raw'.padStart(13)}${'gzip'.padStart(12)}`,
)
for (const row of rows) {
  console.log(
    `${row.page.padEnd(16)}${String(row.files).padStart(6)}${kb(row.raw).padStart(13)}${kb(row.gzip).padStart(12)}`,
  )
}

execSync('true')
