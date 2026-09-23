<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useTemplateRef } from 'vue'
import { PDFDocument } from '@pdfme/pdf-lib'
import DependencyList, { type Dependency } from './DependencyList.vue'
import OcrFieldList, { type OcrBox } from './OcrFieldList.vue'

type Strategy = 'xyz' | 'zoom-fitr' | 'view-fitr' | 'view-fith' | 'page'
type Origin = 'pdf' | 'adobe'

type PageSize = { width: number; height: number }

const STRATEGIES: Array<{ value: Strategy; label: string }> = [
  { value: 'xyz', label: 'zoom=scale,left,top — scroll to a point (spec + pdf.js)' },
  { value: 'zoom-fitr', label: 'zoom=FitR,l,b,r,t — frame a rect (pdf.js spelling)' },
  { value: 'view-fitr', label: 'view=FitR,l,b,r,t — frame a rect (Adobe/Chrome spelling)' },
  { value: 'view-fith', label: 'view=FitH,top — fit width, scroll to y (Adobe/Chrome)' },
  { value: 'page', label: 'page only — the baseline every viewer honours' },
]

const strategy = ref<Strategy>('xyz')
const origin = ref<Origin>('pdf')
const centred = ref(true)
const zoom = ref(150)
const page = ref(1)
const fileName = ref('')
const pageSizes = ref<PageSize[]>([])
const ocrBoxes = ref<OcrBox[]>([])
const focusedOcr = ref<number | null>(null)
const target = ref<OcrBox | null>(null)
const blobUrl = ref('')
const frame = useTemplateRef<HTMLIFrameElement>('frame')

const pageSize = computed<PageSize>(
  () => pageSizes.value[page.value - 1] ?? { width: 612, height: 792 },
)

const geometry = computed(() => {
  const box = target.value?.box

  if (!box) {
    return null
  }

  const { width: W, height: H } = pageSize.value

  const left = (box.x / 100) * W
  const right = ((box.x + box.w) / 100) * W

  // the vertices are top-left origin; PDF user space counts up from the bottom
  const topPdf = H - (box.y / 100) * H
  const bottomPdf = H - ((box.y + box.h) / 100) * H
  const topAdobe = (box.y / 100) * H
  const bottomAdobe = ((box.y + box.h) / 100) * H

  return {
    W,
    H,
    left,
    right,
    topPdf,
    bottomPdf,
    topAdobe,
    bottomAdobe,
    centerX: (left + right) / 2,
    centerYPdf: (topPdf + bottomPdf) / 2,
    centerYAdobe: (topAdobe + bottomAdobe) / 2,
  }
})

const round = (value: number) => Math.round(value * 100) / 100

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max))

const fragment = computed(() => {
  const g = geometry.value

  if (!g) {
    return `#page=${page.value}`
  }

  if (strategy.value === 'page') {
    return `#page=${page.value}`
  }

  if (strategy.value === 'xyz') {
    const scale = zoom.value / 100
    const el = frame.value
    const visibleW = (el?.clientWidth ?? 600) / scale
    const visibleH = (el?.clientHeight ?? 800) / scale

    const usingPdf = origin.value === 'pdf'
    const centerY = usingPdf ? g.centerYPdf : g.centerYAdobe

    const left = centred.value
      ? clamp(g.centerX - visibleW / 2, 0, g.W - visibleW)
      : g.left

    // in PDF space the anchor sits above the target; in Adobe space it sits above in the other sense
    const top = centred.value
      ? usingPdf
        ? clamp(centerY + visibleH / 2, visibleH, g.H)
        : clamp(centerY - visibleH / 2, 0, g.H)
      : usingPdf
        ? g.topPdf
        : g.topAdobe

    return `#page=${page.value}&zoom=${zoom.value},${Math.round(left)},${Math.round(top)}`
  }

  if (strategy.value === 'view-fith') {
    const top = origin.value === 'pdf' ? g.topPdf : g.topAdobe

    return `#page=${page.value}&view=FitH,${Math.round(top)}`
  }

  const rect =
    origin.value === 'pdf'
      ? [g.left, g.bottomPdf, g.right, g.topPdf]
      : [g.left, g.topAdobe, g.right, g.bottomAdobe]

  const key = strategy.value === 'view-fitr' ? 'view' : 'zoom'

  return `#page=${page.value}&${key}=FitR,${rect.map((n) => Math.round(n)).join(',')}`
})

const src = computed(() => (blobUrl.value ? `${blobUrl.value}${fragment.value}` : ''))

const revoke = () => {
  if (blobUrl.value) {
    URL.revokeObjectURL(blobUrl.value)
    blobUrl.value = ''
  }
}

const accept = async (bytes: ArrayBuffer, name: string) => {
  revoke()
  fileName.value = name

  const doc = await PDFDocument.load(bytes)
  pageSizes.value = doc.getPages().map((item) => item.getSize())

  page.value = 1
  target.value = null
  focusedOcr.value = null
  blobUrl.value = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
}

const onFileInput = async (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0]

  if (!file) {
    return
  }

  await accept(await file.arrayBuffer(), file.name)
}

const loadSample = async () => {
  const response = await fetch('/sample.pdf')
  await accept(await response.arrayBuffer(), 'sample.pdf')
}

const jump = (field: OcrBox) => {
  focusedOcr.value = field.id
  page.value = field.page
  target.value = field
}

onBeforeUnmount(revoke)

const deps: Dependency[] = [
  {
    name: '@pdfme/pdf-lib',
    version: '6.1.12',
    license: 'MIT',
    url: 'https://www.npmjs.com/package/@pdfme/pdf-lib',
    size: '~224 KB gzip',
    updated: '2026-07-23 — maintained in the pdfme monorepo',
    note:
      'Only used to read each page box. A backend that already stores page dimensions removes this dependency entirely.',
  },
]
</script>

<template>
  <div class="lab">
    <section class="pane viewer" data-testid="viewer">
      <iframe
        v-if="src"
        :key="src"
        ref="frame"
        data-testid="pdf-tag"
        :src="src"
        title="pdf"
      />
      <p v-else data-testid="empty-state">Load a PDF to start.</p>
    </section>

    <section class="pane">
      <div class="card" data-testid="about">
        <h2>Native viewer, coordinates from the fragment</h2>
        No pdf.js. The browser's own viewer gets the document, and the only lever is the URL fragment.
        Document AI boxes are converted to PDF points and pushed through it.
        <ul>
          <li>Nothing is drawn — the viewer only <strong>scrolls</strong>, there is no highlight</li>
          <li>The fragment is read on load, so each jump reloads the frame</li>
          <li>
            <strong>Firefox</strong> honours <code>page</code>, <code>zoom</code>,
            <code>nameddest</code>, <code>pagemode</code>, <code>search</code> — and ignores
            <code>view=</code> entirely
          </li>
          <li>
            <strong>Chrome</strong> honours <code>page</code>, <code>zoom</code>, <code>view</code>
            (incl. <code>FitR</code>), <code>nameddest</code>, <code>toolbar</code>,
            <code>navpanes</code> — and ignores <code>search</code>
          </li>
          <li><strong>Safari</strong> is undocumented — that is what this page is for</li>
        </ul>
        <p class="weight" data-testid="weight">
          The origin toggle is the real question: Firefox measured <em>bottom-left</em> (PDF user
          space), while Adobe's spec says <em>top-left</em>. Flip it and see which way each browser
          jumps.
        </p>
      </div>

      <div class="card">
        <button data-testid="load-sample" type="button" @click="loadSample">Load sample.pdf</button>
        <label>
          …or your own PDF
          <input accept="application/pdf" data-testid="file-input" type="file" @change="onFileInput" />
        </label>
        <p class="hint" data-testid="file-name">{{ fileName || 'nothing loaded' }}</p>
      </div>

      <label>
        Strategy
        <select v-model="strategy" data-testid="strategy-select">
          <option v-for="item in STRATEGIES" :key="item.value" :value="item.value">
            {{ item.label }}
          </option>
        </select>
      </label>

      <label>
        Coordinate origin
        <select v-model="origin" data-testid="origin-select">
          <option value="pdf">bottom-left — PDF user space (what Firefox measured)</option>
          <option value="adobe">top-left — as Adobe's spec words it</option>
        </select>
      </label>

      <label v-if="strategy === 'xyz'">
        Zoom {{ zoom }}%
        <input v-model.number="zoom" data-testid="zoom-input" max="400" min="25" step="25" type="range" />
      </label>

      <label v-if="strategy === 'xyz'" class="inline">
        <input v-model="centred" data-testid="centred-toggle" type="checkbox" />
        centre the target instead of putting it at the top-left corner
      </label>

      <div class="card">
        <h2>Generated fragment</h2>
        <code class="fragment" data-testid="fragment">{{ fragment }}</code>
        <dl v-if="geometry" class="obs">
          <dt>page box</dt>
          <dd data-testid="page-box">{{ round(geometry.W) }} × {{ round(geometry.H) }} pt</dd>
          <dt>target, PDF space</dt>
          <dd data-testid="target-pdf">
            l {{ round(geometry.left) }} · b {{ round(geometry.bottomPdf) }} · r
            {{ round(geometry.right) }} · t {{ round(geometry.topPdf) }}
          </dd>
          <dt>target, top-left</dt>
          <dd data-testid="target-adobe">
            l {{ round(geometry.left) }} · t {{ round(geometry.topAdobe) }} · r
            {{ round(geometry.right) }} · b {{ round(geometry.bottomAdobe) }}
          </dd>
        </dl>
        <p v-else class="hint">pick a field below to build a fragment</p>
      </div>

      <OcrFieldList
        v-model="ocrBoxes"
        :max-page="pageSizes.length"
        note="Jumping rebuilds the fragment and reloads the frame — the only navigation a native viewer offers."
        @jump="jump"
      />

      <DependencyList
        added="+227.4 KB gzip (@pdfme/pdf-lib, only to read the page box)"
        :deps="deps"
        download="253.5 KB gzip"
      />
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

label.inline {
  font-size: 13px;
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

.fragment {
  display: block;
  padding: 6px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: #fafafa;
  font-size: 12px;
  word-break: break-all;
}

.obs {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 2px 12px;
  margin: 8px 0 0;
  font-size: 12px;
}

.obs dt {
  color: #555;
}

.obs dd {
  margin: 0;
  font-family: ui-monospace, monospace;
}

.hint {
  font-size: 12px;
  color: #555;
}
</style>
