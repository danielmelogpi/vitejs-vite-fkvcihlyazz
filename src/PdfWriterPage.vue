<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import DependencyList, { type Dependency } from './DependencyList.vue'
import OcrFieldList, { type OcrBox } from './OcrFieldList.vue'
import { addBoxAnnotation } from './pdfAnnotations'

type Cantoo = typeof import('@cantoo/pdf-lib')

export type PdfWriter = {
  PDFDocument: Cantoo['PDFDocument']
  PDFString: Cantoo['PDFString']
  rgb: Cantoo['rgb']
  BlendMode: Cantoo['BlendMode']
}

type Mode = 'annotation' | 'content'

const props = defineProps<{
  lib: PdfWriter
  name: string
  weight: string
  capabilities: string[]
  deps: Dependency[]
  download: string
  added: string
}>()

const source = ref<Uint8Array | null>(null)
const viewerUrl = ref('')
const mode = ref<Mode>('annotation')
const pageCount = ref(0)
const pageSize = ref('')
const outputBytes = ref(0)
const annotsBack = ref(0)
const status = ref('')
const selectedPage = ref(1)
const focusedOcr = ref<number | null>(null)

const ocrBoxes = ref<OcrBox[]>([])

const viewerSrc = computed(() =>
  viewerUrl.value ? `${viewerUrl.value}#page=${selectedPage.value}` : '',
)

const revoke = () => {
  if (viewerUrl.value) {
    URL.revokeObjectURL(viewerUrl.value)
    viewerUrl.value = ''
  }
}

const bake = async () => {
  if (!source.value) {
    return
  }

  try {
    const { PDFDocument, PDFString, rgb, BlendMode } = props.lib

    const doc = await PDFDocument.load(source.value)
    pageCount.value = doc.getPageCount()

    const boxes = ocrBoxes.value.filter(
      (item) => item.label && item.page >= 1 && item.page <= doc.getPageCount(),
    )

    boxes.forEach(({ id, label, page: pageNumber, box }) => {
      const dimmed = focusedOcr.value !== null && focusedOcr.value !== id

      const page = doc.getPage(pageNumber - 1)
      const { width, height } = page.getSize()

      pageSize.value = `${Math.round(width)} × ${Math.round(height)} pt`

      const left = (box.x / 100) * width
      const right = ((box.x + box.w) / 100) * width
      const top = height - (box.y / 100) * height
      const bottom = height - ((box.y + box.h) / 100) * height

      const [r, g, b] = dimmed ? [0.23, 0.47, 0.86] : [1, 0, 0.55]

      if (mode.value === 'annotation') {
        addBoxAnnotation({ doc, page, box, label, color: [r, g, b], pdfString: PDFString })
        return
      }

      page.drawRectangle({
        x: left,
        y: bottom,
        width: right - left,
        height: top - bottom,
        borderColor: rgb(r, g, b),
        borderWidth: 1.5,
        color: rgb(r, g, b),
        opacity: 0.3,
        borderOpacity: 1,
        blendMode: BlendMode.Multiply,
      })
    })

    const output = await doc.save()

    const check = await PDFDocument.load(output)
    const inspected = boxes[0]?.page ?? 1
    const annots = check.getPage(inspected - 1).node.Annots()
    annotsBack.value = annots?.size?.() ?? 0

    revoke()
    outputBytes.value = output.byteLength
    viewerUrl.value = URL.createObjectURL(
      new Blob([output as unknown as BlobPart], { type: 'application/pdf' }),
    )
    status.value =
      `${props.name} · ${mode.value} · ${boxes.length} box(es) · ` +
      `${output.byteLength} bytes · ${annotsBack.value} annot(s) read back on page ${inspected}`
  } catch (error) {
    status.value = `failed: ${String(error).slice(0, 180)}`
  }
}

const onFileInput = async (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0]

  if (!file) {
    return
  }

  const buffer = await file.arrayBuffer()
  source.value = new Uint8Array(buffer)
  await bake()
}

watch([ocrBoxes, focusedOcr], () => void bake(), { deep: true })

onBeforeUnmount(revoke)

</script>

<template>
  <div class="lab">
    <section class="pane viewer" data-testid="viewer">
      <iframe
        v-if="viewerSrc"
        :key="viewerSrc"
        data-testid="pdf-tag"
        :src="viewerSrc"
        title="pdf"
      />
      <p v-else data-testid="empty-state">Choose a PDF to display it here.</p>
    </section>

    <section class="pane">
      <div class="card" data-testid="about">
        <h2>{{ name }} → native viewer</h2>
        How far this pdf-lib fork gets us against the vue-pdf-embed feature set.
        <ul>
          <li>Render the PDF: <strong>it can't</strong> — no rasteriser, so the browser draws it</li>
          <li>Custom annotations: yes, as real <code>/Annot</code> objects</li>
          <li>Or as drawn page content, which every viewer renders</li>
          <li>
            Transparency needs an explicit <code>/AP</code> — without one the viewer synthesises an
            opaque box and buries the text
          </li>
          <li>Document AI bounding boxes baked straight into the file</li>
          <li>Custom zoom: <strong>not possible</strong> — the viewer owns it</li>
          <li v-for="item in capabilities" :key="item">{{ item }}</li>
        </ul>
        <p class="weight" data-testid="weight">{{ weight }}</p>
      </div>

      <label>
        PDF
        <input
          accept="application/pdf"
          data-testid="file-input"
          type="file"
          @change="onFileInput"
        />
      </label>

      <label>
        Write as
        <select v-model="mode" data-testid="mode-select" @change="bake">
          <option value="annotation">annotation (/Annot Square)</option>
          <option value="content">drawn content (drawRectangle)</option>
        </select>
      </label>

      <label>
        Page <output data-testid="page-value">{{ selectedPage }}</output>
        <select v-model.number="selectedPage" data-testid="page-select">
          <option v-for="n in pageCount || 1" :key="n" :value="n">{{ n }}</option>
        </select>
        <span class="hint">reloads the viewer at that page — the fragment only works on load</span>
      </label>

      <OcrFieldList
        v-model="ocrBoxes"
        @jump="
          (field) => {
            focusedOcr = field.id
            selectedPage = field.page
          }
        " :max-page="pageCount" note="Each box is written into the file, so changing one re-bakes and reloads the viewer." />

      <p class="hint" data-testid="page-size">Page box: {{ pageSize || '—' }}</p>
      <p class="status" data-testid="status">{{ status || 'waiting for a file' }}</p>
      <p class="hint" data-testid="output-bytes">output: {{ outputBytes }} bytes</p>

      <DependencyList :added="added" :deps="deps" :download="download" />
    </section>
  </div>
</template>

<style>
body {
  margin: 0;
}
</style>

<style scoped>
.lab {
  display: grid;
  grid-template-columns: 1fr 1fr;
  height: 100vh;
}

.pane {
  min-width: 0;
  padding: 12px;
  overflow: auto;
}

.viewer {
  border-right: 1px solid #ccc;
}

iframe {
  width: 100%;
  height: 100%;
  border: 0;
}

label {
  display: block;
  margin-bottom: 8px;
}

.card {
  margin-bottom: 14px;
  padding: 10px 12px;
  border: 1px solid #ccc;
  border-radius: 6px;
  font-size: 13px;
}

.card h2 {
  margin: 0 0 6px;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.card ul {
  margin: 6px 0 0;
  padding-left: 18px;
}

.card .weight {
  color: #555;
}

.hint {
  font-size: 12px;
  color: #555;
}

.status {
  font-family: ui-monospace, monospace;
  font-size: 12px;
}
</style>
