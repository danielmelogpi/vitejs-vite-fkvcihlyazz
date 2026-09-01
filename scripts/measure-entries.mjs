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

const entries = Object.entries(manifest).filter(([, chunk]) => chunk.isEntry)

const filesFor = (key) => {
  const files = new Set()
  for (const dep of collect(key)) {
    const entry = manifest[dep]
    if (!entry) continue
    files.add(entry.file)
    for (const css of entry.css ?? []) files.add(css)
  }
  return files
}

const perEntry = entries.map(([key]) => ({ key, files: filesFor(key) }))

// files every entry loads = the shared baseline (Vue runtime etc.)
const shared = new Set(
  [...(perEntry[0]?.files ?? [])].filter((file) =>
    perEntry.every(({ files }) => files.has(file)),
  ),
)

const sum = (files) => {
  let raw = 0
  let gzip = 0
  for (const file of files) {
    const size = sizeOf(file)
    raw += size.raw
    gzip += size.gzip
  }
  return { raw, gzip }
}

const baseline = sum(shared)

const rows = perEntry.map(({ key, files }) => {
  const total = sum(files)
  const exclusive = sum([...files].filter((file) => !shared.has(file)))
  return { page: key.replace(/\.html$/, ''), total, exclusive }
})

rows.sort((a, b) => b.exclusive.gzip - a.exclusive.gzip)

console.log(
  `shared baseline (loaded by every page): ${kb(baseline.raw)} raw / ${kb(baseline.gzip)} gzip\n`,
)
console.log(
  `${'page'.padEnd(16)}${'total raw'.padStart(13)}${'total gzip'.padStart(12)}${'adds gzip'.padStart(12)}`,
)
for (const row of rows) {
  console.log(
    `${row.page.padEnd(16)}${kb(row.total.raw).padStart(13)}${kb(row.total.gzip).padStart(12)}${kb(row.exclusive.gzip).padStart(12)}`,
  )
}

execSync('true')
