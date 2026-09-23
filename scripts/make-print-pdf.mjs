import { writeFileSync } from 'node:fs'

const W = 612
const H = 792

const text = (size, y, value) => `BT /F1 ${size} Tf 72 ${y} Td (${value}) Tj ET`

const content = (lines) => {
  const stream = lines.join('\n')
  return `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
}

const page = (contents) =>
  `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] ` +
  `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contents} 0 R >>`

// the same shape AL2.pdf carries: a catalog-level JavaScript action that runs on open
const objects = {
  1: '<< /Type /Catalog /Pages 2 0 R /OpenAction 8 0 R >>',
  2: '<< /Type /Pages /Kids [4 0 R 6 0 R] /Count 2 >>',
  3: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',

  4: page(5),
  5: content([
    text(20, H - 100, 'Print-on-open probe - Page 1 of 2'),
    text(11, H - 130, 'The catalog carries /OpenAction -> /JavaScript (this.print(true);)'),
    text(11, H - 150, 'A viewer that honours document JavaScript opens the print dialog here.'),
  ]),

  6: page(7),
  7: content([
    text(20, H - 100, 'Print-on-open probe - Page 2 of 2'),
    text(11, H - 130, 'Nothing on this page triggers anything.'),
  ]),

  8: '<< /Type /Action /S /JavaScript /JS (this.print\\(true\\);) >>',
}

const ids = Object.keys(objects).map(Number).sort((a, b) => a - b)

let pdf = '%PDF-1.4\n'
const offsets = {}
ids.forEach((id) => {
  offsets[id] = pdf.length
  pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`
})

const maxId = ids[ids.length - 1]
const size = maxId + 1

const xrefStart = pdf.length
pdf += `xref\n0 ${size}\n0000000000 65535 f \n`
for (let id = 1; id <= maxId; id += 1) {
  pdf +=
    offsets[id] === undefined
      ? '0000000000 65535 f \n'
      : `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
}
pdf += `trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`

writeFileSync(process.argv[2], pdf, 'latin1')
console.log(`wrote ${process.argv[2]} (2 pages, /OpenAction -> this.print(true))`)
