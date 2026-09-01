import { shallowRef, watch } from 'vue'
import { usePdfDocument } from 'vue-pdf-embed'

type AnnotationSummary = {
  page: number
  id: string
  subtype: string
  rect: number[]
  contents?: string
  title?: string
  url?: string
  fieldName?: string
  fieldValue?: string
  destination?: unknown
}

const source = shallowRef<Uint8Array | null>(null)
const { doc } = usePdfDocument({ source })

const out = document.getElementById('out')!
const input = document.getElementById('file') as HTMLInputElement

input.addEventListener('change', async () => {
  const file = input.files?.[0]

  if (!file) {
    return
  }

  const buffer = await file.arrayBuffer()
  source.value = new Uint8Array(buffer.slice(0))
})

watch(doc, async (loaded) => {
  if (!loaded) {
    return
  }

  const summaries: AnnotationSummary[] = []
  const raw: Array<Record<string, unknown>> = []

  for (let pageNumber = 1; pageNumber <= loaded.numPages; pageNumber += 1) {
    const pdfPage = await loaded.getPage(pageNumber)
    const annotations = await pdfPage.getAnnotations()

    annotations.forEach((annotation) => {
      raw.push({ __page: pageNumber, ...annotation })

      summaries.push({
        page: pageNumber,
        id: annotation.id,
        subtype: annotation.subtype,
        rect: annotation.rect,
        contents: annotation.contentsObj?.str ?? annotation.contents,
        title: annotation.titleObj?.str ?? annotation.title,
        url: annotation.url ?? annotation.unsafeUrl,
        fieldName: annotation.fieldName,
        fieldValue: annotation.fieldValue,
        destination: annotation.dest,
      })
    })
  }

  const result = { numPages: loaded.numPages, count: summaries.length, summaries }

  ;(window as unknown as { __annotations?: unknown }).__annotations = result
  ;(window as unknown as { __annotationsRaw?: unknown }).__annotationsRaw = raw
  out.textContent = JSON.stringify(result, null, 2)
})
