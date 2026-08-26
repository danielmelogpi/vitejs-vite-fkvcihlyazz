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
  2: '<< /Type /Pages /Kids [4 0 R 6 0 R 8 0 R] /Count 3 >>',
  3: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',

  4: page(5, [10, 11]),
  5: content([
    text(20, H - 100, 'Annotated - Page 1 of 3'),
    text(12, H - 130, 'link annotations below'),
  ]),

  6: page(7, [12, 13]),
  7: content([
    text(20, H - 100, 'Annotated - Page 2 of 3'),
    text(12, H - 190, 'a sticky note and a highlight'),
  ]),

  8: page(9, [14]),
  9: content([
    text(20, H - 100, 'Annotated - Page 3 of 3'),
    text(12, H - 165, 'a form text field'),
  ]),

  10:
    '<< /Type /Annot /Subtype /Link /Rect [72 670 300 690] /Border [0 0 1] ' +
    '/A << /S /URI /URI (https://example.com/terms) >> >>',
  11:
    '<< /Type /Annot /Subtype /Link /Rect [72 640 300 660] /Border [0 0 1] ' +
    '/A << /S /GoTo /D [8 0 R /Fit] >> >>',

  12:
    '<< /Type /Annot /Subtype /Text /Rect [72 670 92 690] /Name /Comment /F 4 ' +
    '/T (Reviewer) /Contents (Please confirm the payoff amount.) >>',
  13:
    '<< /Type /Annot /Subtype /Highlight /Rect [72 590 300 612] ' +
    '/QuadPoints [72 612 300 612 72 590 300 590] /C [1 1 0] /F 4 ' +
    '/T (Reviewer) /Contents (Highlighted clause) >>',

  14:
    '<< /Type /Annot /Subtype /Widget /FT /Tx /T (fullName) /V (Jane Doe) ' +
    '/Rect [72 620 320 645] /F 4 /DA (/Helv 12 Tf 0 g) /P 8 0 R >>',
}

const ids = Object.keys(objects).map(Number).sort((a, b) => a - b)

let pdf = '%PDF-1.4\n'
const offsets = {}
ids.forEach((id) => {
  offsets[id] = pdf.length
  pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`
})

const xrefStart = pdf.length
pdf += `xref\n0 ${ids.length + 1}\n0000000000 65535 f \n`
ids.forEach((id) => {
  pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
})
pdf += `trailer\n<< /Size ${ids.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`

writeFileSync(process.argv[2], pdf, 'latin1')
console.log(`wrote ${process.argv[2]} (3 pages, 5 annotations)`)
