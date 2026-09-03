<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { AnnotationFactory } from '@digital-blueprint/annotpdf'
import MarkerControl, { type Marker } from './MarkerControl.vue'
import OcrFieldList, { type OcrBox } from './OcrFieldList.vue'
import DependencyList, { type Dependency } from './DependencyList.vue'

const source = ref<Uint8Array | null>(null)
const viewerUrl = ref('')
const fileName = ref('')
const pageSize = ref({ width: 612, height: 792, detected: false })
const status = ref('')
const bakedBytes = ref(0)
const marker = ref<Marker>({ text: 'buyer name', page: 1, x: 20, y: 30, w: 30, h: 6 })
const selectedPage = ref(1)
const ocrBoxes = ref<OcrBox[]>([])
const pageCount = ref(0)

const viewerSrc = computed(() =>
  viewerUrl.value ? `${viewerUrl.value}#page=${selectedPage.value}` : '',
)

const revoke = () => {
  if (viewerUrl.value) {
    URL.revokeObjectURL(viewerUrl.value)
    viewerUrl.value = ''
  }
}

const countPages = (bytes: Uint8Array) => {
  const text = new TextDecoder('latin1').decode(bytes)
  const counts = [...text.matchAll(/\/Count\s+(\d+)/g)].map((match) => Number(match[1]))

  pageCount.value = counts.length ? Math.max(...counts) : 0
}

const detectPageSize = (bytes: Uint8Array) => {
  const head = new TextDecoder('latin1').decode(bytes.slice(0, 40000))
  const match = /\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(head)

  if (!match) {
    pageSize.value = { width: 612, height: 792, detected: false }
    return
  }

  pageSize.value = {
    width: Number(match[3]) - Number(match[1]),
    height: Number(match[4]) - Number(match[2]),
    detected: true,
  }
}

const bake = async () => {
  if (!source.value) {
    return
  }

  const { width, height } = pageSize.value

  const boxes = [
    { label: marker.value.text, page: marker.value.page, box: { ...marker.value } },
    ...ocrBoxes.value.map((item) => ({ label: item.label, page: item.page, box: item.box })),
  ].filter(
    (item) =>
      item.label && item.page >= 1 && (!pageCount.value || item.page <= pageCount.value),
  )

  try {
    const factory = new AnnotationFactory(source.value)

    const rects: string[] = []

    boxes.forEach(({ label, page, box }) => {
      const left = (box.x / 100) * width
      const right = ((box.x + box.w) / 100) * width
      const top = (1 - box.y / 100) * height
      const bottom = (1 - (box.y + box.h) / 100) * height

      rects.push(
        `[${left.toFixed(1)}, ${top.toFixed(1)}, ${right.toFixed(1)}, ${bottom.toFixed(1)}]`,
      )

      factory.createSquareAnnotation(
        page - 1,
        [left, top, right, bottom],
        label,
        'closinglock-lab',
        { r: 255, g: 0, b: 140 },
        { r: 255, g: 220, b: 240 },
      )
    })

    const output = factory.write()
    const readBack = (await new AnnotationFactory(output).getAnnotations()).flat().length

    revoke()
    bakedBytes.value = output.byteLength
    viewerUrl.value = URL.createObjectURL(
      new Blob([output as unknown as BlobPart], { type: 'application/pdf' }),
    )
    status.value =
      `baked ${boxes.length} box(es) on page(s) ${boxes.map((item) => item.page).join(', ')}` +
      ` — ${output.byteLength} bytes, ${readBack} annotation(s) in the output` +
      ` · first rect ${rects[0] ?? '—'}`
  } catch (error) {
    status.value = `failed: ${String(error).slice(0, 160)}`
  }
}

const onFileInput = async (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0]

  if (!file) {
    return
  }

  const buffer = await file.arrayBuffer()
  source.value = new Uint8Array(buffer)
  fileName.value = file.name
  detectPageSize(source.value)
  countPages(source.value)
  await bake()
}

watch(ocrBoxes, () => void bake(), { deep: true })

onBeforeUnmount(revoke)

const deps: Dependency[] = [
  {
    name: '@digital-blueprint/annotpdf',
    version: '1.0.13-a',
    license: 'MIT',
    url: 'https://www.npmjs.com/package/@digital-blueprint/annotpdf',
    size: 'part of a 55 KB gzip chunk',
    updated: '2022-04-05 — its only release; upstream last committed 2022-01-15',
    note:
      'Writes real PDF annotations in the browser. Ships its own TypeScript types. One published version, and neither it nor the project it forked from has been touched since 2022.',
  },
  {
    name: 'crypto-js',
    version: '4.2.0',
    license: 'MIT',
    url: 'https://www.npmjs.com/package/crypto-js',
    size: 'bundled into the same chunk',
    updated: '2026-08-05 (4.2.0)',
    note: 'Pulled in by annotpdf for encrypted documents. Not something we call directly.',
  },
  {
    name: 'pako',
    version: '1.0.11',
    license: 'MIT AND Zlib',
    url: 'https://www.npmjs.com/package/pako',
    size: '~14 KB gzip on its own',
    updated: 'we get 1.0.11 via annotpdf; 3.0.1 shipped 2026-07-06',
    note: 'Pulled in by annotpdf to inflate and deflate PDF streams.',
  },
]
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
        <h2>annotpdf → native viewer</h2>
        Write real PDF annotations in the browser, then let the browser's own viewer draw them.
        <ul>
          <li>Whether a highlight box can be baked into the bytes client-side</li>
          <li>Whether the native viewer then shows it (no pdf.js anywhere)</li>
          <li>What it costs, and what it can't do</li>
          <li>Document AI boxes baked in as real annotations</li>
          <li>
            Alternatives were researched separately &mdash; <code>@cantoo/pdf-lib</code> is the
            maintained option (findings §21)
          </li>
        </ul>
        <p class="weight" data-testid="weight">
          Downloads <strong>84 KB over 6 requests</strong> (built app, compressed) &mdash;
          annotpdf plus crypto-js and pako. No pdf.js at all.
        </p>
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
        Page <output data-testid="page-value">{{ selectedPage }}</output>
        <select v-model.number="selectedPage" data-testid="page-select">
          <option v-for="n in pageCount || 1" :key="n" :value="n">{{ n }}</option>
        </select>
        <span class="hint">reloads the viewer at that page — the fragment only works on load</span>
      </label>

      <OcrFieldList
        v-model="ocrBoxes"
        @jump="(field) => (selectedPage = field.page)"
        :max-page="pageCount"
        note="Each field is written into the file, so a change re-bakes and reloads the viewer."
      />

      <MarkerControl v-model="marker" :max-page="pageCount || 10">
        <template #actions>
          <button data-testid="bake" type="button" @click="bake">Bake annotation</button>
        </template>
      </MarkerControl>

      <p class="hint" data-testid="page-size">
        Page box: {{ pageSize.width }} &times; {{ pageSize.height }} pt
        <span v-if="!pageSize.detected">(assumed — no MediaBox found)</span>
      </p>

      <p class="status" data-testid="status">{{ status || 'waiting for a file' }}</p>
      <p class="hint" data-testid="baked-bytes">output: {{ bakedBytes }} bytes</p>
      <DependencyList added="+54 KB gzip" :deps="deps" download="84 KB over 6 requests" />
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
