import { readFileSync, writeFileSync } from 'node:fs'
import { createCanvas } from '@napi-rs/canvas'
import * as cantoo from '@cantoo/pdf-lib'
import * as pdfme from '@pdfme/pdf-lib'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'

const src = readFileSync('public/sample.pdf')
const RECT = { xPct: 5, yPct: 5, wPct: 90, hPct: 30 }
const FONTS = new URL('../node_modules/pdfjs-dist/standard_fonts/', import.meta.url).href

const geom = (page) => {
  const { width, height } = page.getSize()
  return {
    left: (RECT.xPct / 100) * width,
    right: ((RECT.xPct + RECT.wPct) / 100) * width,
    top: height - (RECT.yPct / 100) * height,
    bottom: height - ((RECT.yPct + RECT.hPct) / 100) * height,
  }
}

const bakeLegacySquare = async (lib) => {
  const doc = await lib.PDFDocument.load(src)
  const page = doc.getPage(0)
  const { left, right, top, bottom } = geom(page)
  page.node.addAnnot(
    doc.context.register(
      doc.context.obj({
        Type: 'Annot', Subtype: 'Square', Rect: [left, bottom, right, top],
        C: [1, 0, 0.55], IC: [1, 0.86, 0.94], CA: 0.6, F: 4,
        T: lib.PDFString.of('closinglock-lab'), Contents: lib.PDFString.of('legacy'),
        Border: [0, 0, 2],
      }),
    ),
  )
  return doc.save()
}

// mirrors the annotation branch of src/PdfWriterPage.vue
const bakeAnnotation = async (lib) => {
  const doc = await lib.PDFDocument.load(src)
  const page = doc.getPage(0)
  const { left, right, top, bottom } = geom(page)
  const boxWidth = right - left
  const boxHeight = top - bottom
  const [r, g, b] = [1, 0, 0.55]

  const appearance = doc.context.stream(
    [
      '/GS gs',
      `${r} ${g} ${b} rg`,
      `${r} ${g} ${b} RG`,
      '1.5 w',
      `0.75 0.75 ${(boxWidth - 1.5).toFixed(2)} ${(boxHeight - 1.5).toFixed(2)} re`,
      'B',
    ].join('\n'),
    {
      Type: 'XObject',
      Subtype: 'Form',
      FormType: 1,
      BBox: [0, 0, boxWidth, boxHeight],
      Resources: {
        ExtGState: { GS: { Type: 'ExtGState', ca: 0.3, CA: 1, BM: 'Multiply' } },
      },
    },
  )

  page.node.addAnnot(
    doc.context.register(
      doc.context.obj({
        Type: 'Annot', Subtype: 'Square', Rect: [left, bottom, right, top],
        C: [r, g, b], IC: [r, g, b], CA: 1, F: 4,
        T: lib.PDFString.of('closinglock-lab'), Contents: lib.PDFString.of('field'),
        Border: [0, 0, 0],
        AP: { N: doc.context.register(appearance) },
      }),
    ),
  )
  return doc.save()
}

// mirrors the drawn-content branch of src/PdfWriterPage.vue
const bakeContent = async (lib) => {
  const doc = await lib.PDFDocument.load(src)
  const page = doc.getPage(0)
  const { left, right, top, bottom } = geom(page)
  const [r, g, b] = [1, 0, 0.55]
  page.drawRectangle({
    x: left, y: bottom, width: right - left, height: top - bottom,
    borderColor: lib.rgb(r, g, b), borderWidth: 1.5,
    color: lib.rgb(r, g, b), opacity: 0.3, borderOpacity: 1,
    blendMode: lib.BlendMode.Multiply,
  })
  return doc.save()
}

const measure = async (bytes, label) => {
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes), isEvalSupported: false, standardFontDataUrl: FONTS,
  }).promise
  const page = await doc.getPage(1)
  const viewport = page.getViewport({ scale: 2 })
  const canvas = createCanvas(viewport.width, viewport.height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, viewport.width, viewport.height)
  await page.render({ canvasContext: ctx, viewport, canvas }).promise

  const inset = 8
  const x0 = Math.round((RECT.xPct / 100) * viewport.width) + inset
  const y0 = Math.round((RECT.yPct / 100) * viewport.height) + inset
  const w = Math.round((RECT.wPct / 100) * viewport.width) - inset * 2
  const h = Math.round((RECT.hPct / 100) * viewport.height) - inset * 2

  const { data } = ctx.getImageData(x0, y0, w, h)
  let dark = 0
  for (let i = 0; i < data.length; i += 4) {
    if (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] < 110) dark += 1
  }
  writeFileSync(`${process.env.CLAUDE_JOB_DIR}/tmp/alpha-${label}.png`, canvas.toBuffer('image/png'))
  return dark
}

const base = await measure(src, 'baseline')
console.log(`baseline text pixels under the box: ${base}\n`)

for (const [name, lib] of [['@pdfme/pdf-lib', pdfme], ['@cantoo/pdf-lib', cantoo]]) {
  const rows = [
    ['legacy /Square (no /AP)', await bakeLegacySquare(lib)],
    ['annotation (/AP + Multiply)', await bakeAnnotation(lib)],
    ['drawn content (Multiply)', await bakeContent(lib)],
  ]
  console.log(name)
  for (const [label, bytes] of rows) {
    const dark = await measure(bytes, `${name.split('/')[0].slice(1)}-${label.split(' ')[0]}`)
    const pct = ((dark / base) * 100).toFixed(1)
    console.log(`  ${label.padEnd(30)} ${String(dark).padStart(6)}  ${pct.padStart(6)}% of text survives`)
  }
  console.log()
}
