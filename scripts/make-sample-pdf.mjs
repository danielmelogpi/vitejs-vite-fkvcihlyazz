import { writeFileSync } from 'node:fs'

const PAGES = Number(process.argv[4] ?? 8)
const TITLE = process.argv[3] ?? 'Document A'
const SLUG = process.argv[5] ?? 'a'
const W = 612
const H = 792

const objects = []
const add = (body) => {
  objects.push(body)
  return objects.length
}

const kidIds = []
const contentIds = []
const pageIds = []

const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>')

for (let i = 1; i <= PAGES; i++) {
  const label = `${TITLE} - Page ${i} of ${PAGES}.`
  const stream = `BT /F1 26 Tf 72 ${H - 140} Td (${label}) Tj ET
BT /F1 18 Tf 72 ${H - 200} Td (vue-pdf-embed lab sample document) Tj ET
0.85 0.9 0.98 rg 72 ${H - 300} 300 60 re f
0 0 0 rg
BT /F1 24 Tf 90 ${H - 285} Td (${SLUG}-page-${i}) Tj ET`
  contentIds.push(add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`))
}

const pagesId = objects.length + PAGES + 1
for (let i = 0; i < PAGES; i++) {
  pageIds.push(
    add(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentIds[i]} 0 R >>`
    )
  )
  kidIds.push(pageIds[i])
}

const realPagesId = add(
  `<< /Type /Pages /Kids [${kidIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${PAGES} >>`
)
const catalogId = add(`<< /Type /Catalog /Pages ${realPagesId} 0 R >>`)

let pdf = '%PDF-1.4\n'
const offsets = []
objects.forEach((body, idx) => {
  offsets.push(pdf.length)
  pdf += `${idx + 1} 0 obj\n${body}\nendobj\n`
})

const xrefStart = pdf.length
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
offsets.forEach((offset) => {
  pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
})
pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`

writeFileSync(process.argv[2], pdf, 'latin1')
console.log(`wrote ${process.argv[2]} (${PAGES} pages)`)
