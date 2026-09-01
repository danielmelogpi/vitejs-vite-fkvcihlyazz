import { writeFileSync } from 'node:fs'

const W = 612
const H = 792

const text = (size, y, value) => `BT /F1 ${size} Tf 72 ${y} Td (${value}) Tj ET`

const stream = [
  text(20, H - 100, 'Form fixture - fill the box below'),
  text(11, H - 130, 'the field is an AcroForm text widget named fullName'),
].join('\n')

const objects = {
  1:
    '<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [6 0 R] /NeedAppearances true ' +
    '/DA (/Helv 0 Tf 0 g) /DR << /Font << /Helv 3 0 R >> >> >> >>',
  2: '<< /Type /Pages /Kids [4 0 R] /Count 1 >>',
  3: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  4:
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] ` +
    '/Resources << /Font << /F1 3 0 R /Helv 3 0 R >> >> /Contents 5 0 R /Annots [6 0 R] >>',
  5: `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  6:
    '<< /Type /Annot /Subtype /Widget /FT /Tx /T (fullName) /V () /Rect [72 620 400 655] ' +
    '/F 4 /DA (/Helv 12 Tf 0 g) /P 4 0 R /MK << /BC [0 0 0] /BG [1 1 1] >> >>',
}

const ids = Object.keys(objects).map(Number).sort((a, b) => a - b)
const maxId = ids[ids.length - 1]
const size = maxId + 1

let pdf = '%PDF-1.4\n'
const offsets = {}
ids.forEach((id) => {
  offsets[id] = pdf.length
  pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`
})

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
console.log(`wrote ${process.argv[2]} (1 page, 1 AcroForm text field)`)
