import type { PDFDocument, PDFPage, PDFString } from '@cantoo/pdf-lib'
import type { Box } from './ocrFields'

export type Rgb = [number, number, number]

type BoxAnnotation = {
  doc: PDFDocument
  page: PDFPage
  box: Box
  label: string
  color: Rgb
  pdfString: typeof PDFString
  author?: string
  name?: string
}

export const addBoxAnnotation = ({
  doc,
  page,
  box,
  label,
  color,
  pdfString,
  author = 'closinglock-lab',
  name,
}: BoxAnnotation) => {
  const { width, height } = page.getSize()
  const [r, g, b] = color

  const left = (box.x / 100) * width
  const right = ((box.x + box.w) / 100) * width
  const top = height - (box.y / 100) * height
  const bottom = height - ((box.y + box.h) / 100) * height
  const boxWidth = right - left
  const boxHeight = top - bottom

  // without an /AP of our own the viewer synthesises an opaque one and buries the text
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

  const annot = doc.context.obj({
    Type: 'Annot',
    Subtype: 'Square',
    Rect: [left, bottom, right, top],
    C: color,
    IC: color,
    CA: 1,
    F: 4,
    T: pdfString.of(author),
    Contents: pdfString.of(label),
    ...(name ? { NM: pdfString.of(name) } : {}),
    Border: [0, 0, 0],
    AP: { N: doc.context.register(appearance) },
  })

  page.node.addAnnot(doc.context.register(annot))

  return { left, bottom, right, top, width, height }
}
