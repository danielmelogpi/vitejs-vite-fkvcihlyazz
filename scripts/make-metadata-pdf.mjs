import { writeFileSync } from 'node:fs'

const W = 612
const H = 792

const text = (size, y, value) => `BT /F1 ${size} Tf 72 ${y} Td (${value}) Tj ET`

const content = (lines) => {
  const stream = lines.join('\n')
  return `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
}

const page = (contents, annots) =>
  `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] ` +
  `/Resources << /Font << /F1 3 0 R /Helv 3 0 R >> >> /Contents ${contents} 0 R ` +
  `/Annots [${annots.map((n) => `${n} 0 R`).join(' ')}] >>`

const objects = {
  1:
    '<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [14 0 R] ' +
    '/DA (/Helv 0 Tf 0 g) /DR << /Font << /Helv 3 0 R >> >> >> >>',
  2: '<< /Type /Pages /Kids [4 0 R 6 0 R] /Count 2 >>',
  3: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',

  4: page(5, [10, 11, 12, 13]),
  5: content([
    text(20, H - 100, 'Metadata probe - Page 1 of 2'),
    text(11, H - 130, 'visible note at top-left; three more annotations are invisible'),
  ]),

  6: page(7, [14]),
  7: content([
    text(20, H - 100, 'Metadata probe - Page 2 of 2'),
    text(11, H - 130, 'a hidden form field lives on this page'),
  ]),

  10:
    '<< /Type /Annot /Subtype /Text /Rect [72 700 94 722] /Name /Comment /F 4 ' +
    '/NM (cl-anchor-001) /T (Backend) /Subj (payoff-line) ' +
    '/Contents (visible note) ' +
    '/CLID (payoff-123) /CLMeta << /kind (signature) /order 3 >> >>',

  11:
    '<< /Type /Annot /Subtype /Text /Rect [200 700 222 722] /Name /Comment /F 2 ' +
    '/NM (cl-hidden-002) /T (Backend) ' +
    '/Contents (hidden payload: order=7 kind=wire-instructions) >>',

  12:
    '<< /Type /Annot /Subtype /Text /Rect [300 700 322 722] /Name /Comment /F 32 ' +
    '/NM (cl-noview-003) /T (Backend) /Contents (noview payload) >>',

  13:
    '<< /Type /Annot /Subtype /Square /Rect [400 700 400 700] /F 4 ' +
    '/NM (cl-zero-004) /T (Backend) /Contents (zero-size rect payload) >>',

  14:
    '<< /Type /Annot /Subtype /Widget /FT /Tx /T (cl-field-005) ' +
    '/V (opaque-backend-id-42) /F 2 /Rect [72 600 320 625] ' +
    '/DA (/Helv 12 Tf 0 g) /P 6 0 R >>',
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
console.log(`wrote ${process.argv[2]} (2 pages, 5 annotations: custom keys, hidden, noview, zero-rect, hidden widget)`)
