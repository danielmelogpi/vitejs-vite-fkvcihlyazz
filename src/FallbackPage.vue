<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import VuePdfEmbed from 'vue-pdf-embed'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import DependencyList, { type Dependency } from './DependencyList.vue'
import OcrFieldList, { type OcrBox } from './OcrFieldList.vue'

import 'vue-pdf-embed/dist/styles/annotationLayer.css'
import 'vue-pdf-embed/dist/styles/textLayer.css'

const EMBED_ID = 'pdf-embed'
const RENDER_TIMEOUT = 8000

type Reason = 'rendering-failed' | 'loading-failed' | 'timeout' | 'pre-flight'

const asyncIterator = Object.getOwnPropertyDescriptor(
  ReadableStream.prototype,
  Symbol.asyncIterator,
)

const engineSupportsAsyncIteration = Boolean(asyncIterator)

const source = shallowRef<Uint8Array | null>(null)
const blobUrl = ref('')
const page = ref(1)
const numPages = ref(0)
const attempt = ref(0)
const fallback = ref<{ reason: Reason; detail: string; at: number } | null>(null)
const startedAt = ref(0)
const rendered = ref(false)
const simulateSafari = ref(true)
const preFlight = ref(false)
const log = ref<string[]>([])
const focusedOcr = ref<number | null>(null)
const ocrBoxes = ref<OcrBox[]>([])

let watchdog: ReturnType<typeof setTimeout> | undefined
let original: Uint8Array | null = null

const mode = computed(() => (fallback.value ? 'iframe' : 'pdfjs'))

const iframeSrc = computed(() => (blobUrl.value ? `${blobUrl.value}#page=${page.value}` : ''))

const ocrBoxesByPage = computed(() => {
  const byPage: Record<number, OcrBox[]> = {}

  ocrBoxes.value.forEach((item) => {
    byPage[item.page] = [...(byPage[item.page] ?? []), item]
  })

  return byPage
})

const note = (line: string) => {
  log.value = [...log.value, `${String(Date.now() - startedAt.value).padStart(5)}ms  ${line}`]
}

const supportsAsyncIteration = () =>
  typeof (ReadableStream.prototype as { [Symbol.asyncIterator]?: unknown })[
    Symbol.asyncIterator
  ] === 'function'

const setSimulation = (on: boolean) => {
  const proto = ReadableStream.prototype as { [Symbol.asyncIterator]?: unknown }

  if (on) {
    delete proto[Symbol.asyncIterator]
    return
  }

  if (asyncIterator) {
    Object.defineProperty(ReadableStream.prototype, Symbol.asyncIterator, asyncIterator)
  }
}

setSimulation(simulateSafari.value)

const clearWatchdog = () => {
  if (watchdog !== undefined) {
    clearTimeout(watchdog)
    watchdog = undefined
  }
}

const degrade = (reason: Reason, detail: string) => {
  if (fallback.value) {
    return
  }

  clearWatchdog()
  fallback.value = { reason, detail, at: Date.now() - startedAt.value }
  note(`↓ falling back to <iframe> — ${reason}`)
}

const render = () => {
  clearWatchdog()

  if (!original) {
    return
  }

  fallback.value = null
  rendered.value = false
  startedAt.value = Date.now()
  log.value = []
  attempt.value += 1

  // pdf.js detaches the buffer it is handed, so every attempt needs its own copy
  source.value = new Uint8Array(original)

  note(`ReadableStream async iteration: ${supportsAsyncIteration() ? 'yes' : 'NO'}`)

  if (preFlight.value && !supportsAsyncIteration()) {
    degrade('pre-flight', 'ReadableStream.prototype[Symbol.asyncIterator] is missing')
    return
  }

  note('mounting vue-pdf-embed')

  watchdog = setTimeout(() => {
    if (!rendered.value) {
      degrade('timeout', `nothing rendered within ${RENDER_TIMEOUT}ms`)
    }
  }, RENDER_TIMEOUT)
}

const revoke = () => {
  if (blobUrl.value) {
    URL.revokeObjectURL(blobUrl.value)
    blobUrl.value = ''
  }
}

const onFileInput = async (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0]

  if (!file) {
    return
  }

  const buffer = await file.arrayBuffer()

  revoke()
  blobUrl.value = URL.createObjectURL(new Blob([buffer], { type: 'application/pdf' }))
  original = new Uint8Array(buffer)
  page.value = 1
  numPages.value = 0
  render()
}

const onLoaded = (doc: PDFDocumentProxy) => {
  numPages.value = doc.numPages
  note(`loaded — ${doc.numPages} page(s) parsed`)
}

const onRendered = () => {
  rendered.value = true
  clearWatchdog()
  note('rendered — pdf.js path holds')
}

const onRenderingFailed = (error: unknown) => {
  note(`rendering-failed: ${String(error).slice(0, 120)}`)
  degrade('rendering-failed', String(error).slice(0, 200))
}

const onLoadingFailed = (error: unknown) => {
  note(`loading-failed: ${String(error).slice(0, 120)}`)
  degrade('loading-failed', String(error).slice(0, 200))
}

const goToPage = () => {
  if (mode.value === 'iframe') {
    return
  }

  document
    .getElementById(`${EMBED_ID}-${page.value}`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const jumpToOcrBox = (field: OcrBox) => {
  focusedOcr.value = field.id
  page.value = field.page

  if (mode.value === 'iframe') {
    return
  }

  const target =
    document.querySelector(`[data-testid="ocr-box-${field.id}"]`) ??
    document.getElementById(`${EMBED_ID}-${field.page}`)

  target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

watch(simulateSafari, (on) => {
  setSimulation(on)
  render()
})

watch(preFlight, () => {
  render()
})

onBeforeUnmount(() => {
  clearWatchdog()
  setSimulation(false)
  revoke()
})

const deps: Dependency[] = [
  {
    name: 'vue-pdf-embed',
    version: '2.1.6',
    license: 'MIT',
    url: 'https://www.npmjs.com/package/vue-pdf-embed',
    size: '6 KB gzip on its own',
    updated: '2026-08-25 (2.1.6)',
    note: 'Same wrapper as the main experiment. It emits the failure this page listens for.',
  },
  {
    name: 'pdfjs-dist',
    version: '6.2.108',
    license: 'Apache-2.0',
    url: 'https://www.npmjs.com/package/pdfjs-dist',
    size: '~797 KB gzip of the page',
    updated: '2026-08-29 (6.3.289; we pin 6.2.108)',
    note: 'Pulled in by the wrapper. All 804 KB still downloads even when the fallback is what gets used.',
  },
  {
    name: '@sec-ant/readable-stream',
    version: '—',
    license: 'MIT',
    url: 'https://www.npmjs.com/package/@sec-ant/readable-stream',
    size: 'not installed here (−402 B gzip)',
    updated: 'deliberately absent',
    note: 'The polyfill the main experiment imports. This entry point omits it on purpose — that omission is the experiment.',
  },
]
</script>

<template>
  <div class="lab">
    <section class="pane viewer" data-testid="viewer">
      <div v-if="fallback" class="degraded" data-testid="fallback-banner">
        pdf.js failed ({{ fallback.reason }}) after {{ fallback.at }}ms — showing the browser's own
        viewer instead. Overlays and scroll-to-page are gone; page jumps reload the frame.
      </div>

      <VuePdfEmbed
        v-if="source && mode === 'pdfjs'"
        :id="EMBED_ID"
        :key="attempt"
        annotation-layer
        :source="source"
        text-layer
        @loaded="onLoaded"
        @loading-failed="onLoadingFailed"
        @rendered="onRendered"
        @rendering-failed="onRenderingFailed"
      >
        <template #after-page="{ page: pageNumber }">
          <div
            v-for="field in ocrBoxesByPage[pageNumber] ?? []"
            :key="field.id"
            :class="['ocr-box', { 'is-dimmed': focusedOcr !== null && focusedOcr !== field.id }]"
            :data-testid="`ocr-box-${field.id}`"
            :style="{
              left: `${field.box.x}%`,
              top: `${field.box.y}%`,
              width: `${field.box.w}%`,
              height: `${field.box.h}%`,
            }"
          >
            <span class="ocr-label">{{ field.label }}</span>
          </div>
        </template>
      </VuePdfEmbed>

      <iframe
        v-else-if="source && mode === 'iframe'"
        :key="iframeSrc"
        data-testid="pdf-tag"
        :src="iframeSrc"
        title="pdf"
      />

      <p v-else data-testid="empty-state">Choose a PDF to display it here.</p>
    </section>

    <section class="pane">
      <div class="card" data-testid="about">
        <h2>vue-pdf-embed, unpolyfilled → iframe fallback</h2>
        The same renderer as the main experiment, with the Safari polyfill left out, so it breaks where
        Safari breaks. The page watches for that and degrades to the browser's own viewer.
        <ul>
          <li>
            No <code>@sec-ant/readable-stream</code> import — in Safari the text layer throws and the
            whole page render is aborted
          </li>
          <li>
            Detected three ways: the <code>rendering-failed</code> event, a
            {{ RENDER_TIMEOUT }}ms watchdog for a silent failure, and an optional pre-flight probe
          </li>
          <li>
            The Safari simulation is <strong>on by default</strong> — load a PDF and it fails, is caught
            and degrades straight away
          </li>
          <li>Falls back to a plain <code>&lt;iframe&gt;</code> on a blob URL</li>
          <li><strong>What we lose:</strong> overlays, smooth scroll, zoom, annotation reading</li>
          <li><strong>What we keep:</strong> the document is readable, and <code>#page=N</code> still works</li>
        </ul>
        <p class="weight" data-testid="weight">
          <strong>830.0 KB</strong> gzip against vue-pdf-embed's 830.3 KB — dropping the polyfill saves
          <strong>0.3 KB</strong>. The catch: a browser that ends up in the fallback has still
          downloaded all <strong>804 KB</strong> of pdf.js to find that out.
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

      <div class="card">
        <label class="inline">
          <input
            v-model="simulateSafari"
            data-testid="simulate-safari"
            :disabled="!engineSupportsAsyncIteration"
            type="checkbox"
          />
          Simulate Safari — delete <code>ReadableStream.prototype[Symbol.asyncIterator]</code>
          <span class="hint">on by default, so the page opens in the state it exists to show; uncheck to
            restore the API and watch the pdf.js path come back</span>
        </label>
        <p v-if="!engineSupportsAsyncIteration" class="hint" data-testid="engine-note">
          This engine already lacks the API, so the failure is real here, not simulated.
        </p>

        <label class="inline">
          <input v-model="preFlight" data-testid="pre-flight" type="checkbox" />
          Pre-flight probe — check the capability before mounting, instead of letting it fail
        </label>
      </div>

      <label>
        Page
        <input
          v-model.number="page"
          data-testid="page-input"
          :max="numPages || undefined"
          min="1"
          type="number"
          @change="goToPage"
        />
        <span class="hint">
          {{
            mode === 'iframe'
              ? 'fallback: the fragment reloads the frame at that page'
              : 'pdf.js: smooth scroll, nothing reloads'
          }}
        </span>
      </label>

      <p class="status" data-testid="status">
        {{
          !source
            ? 'waiting for a file'
            : `${mode} · ${numPages || '?'} page(s)${fallback ? ` · ${fallback.reason}` : ''}`
        }}
      </p>

      <p v-if="fallback" class="hint" data-testid="fallback-detail">{{ fallback.detail }}</p>

      <pre v-if="log.length" class="log" data-testid="log">{{ log.join('\n') }}</pre>

      <OcrFieldList
        v-model="ocrBoxes"
        :max-page="numPages"
        note="Overlays only exist on the pdf.js path. In the fallback a jump can only change the page."
        @jump="jumpToOcrBox"
      />

      <DependencyList
        added="+804.0 KB gzip (0.3 KB less than the polyfilled entry)"
        :deps="deps"
        download="830.0 KB gzip"
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
  background: gray;
}

.viewer :deep(.vue-pdf-embed__page) {
  margin-bottom: 12px;
}

.viewer :deep(.vue-pdf-embed > div) {
  position: relative;
  width: max-content;
  margin: 0 auto;
}

iframe {
  width: 100%;
  height: 100%;
  border: 0;
}

.degraded {
  margin-bottom: 10px;
  padding: 8px 10px;
  border: 1px solid #b8860b;
  border-radius: 4px;
  background: #fff8dc;
  font-size: 12px;
}

.ocr-box {
  position: absolute;
  transition: border-color 150ms, background 150ms;
  z-index: 6;
  box-sizing: border-box;
  border: 2px solid rgba(200, 0, 120, 0.9);
  background: rgba(255, 0, 140, 0.18);
  pointer-events: none;
}

.ocr-box.is-dimmed {
  border-color: rgba(60, 120, 220, 0.75);
  background: rgba(60, 120, 220, 0.12);
}

.ocr-box.is-dimmed .ocr-label {
  background: rgba(60, 120, 220, 0.8);
}

.ocr-label {
  position: absolute;
  top: -14px;
  left: 0;
  background: rgba(200, 0, 120, 0.9);
  color: #fff;
  font-size: 10px;
  line-height: 14px;
  padding: 0 4px;
  white-space: nowrap;
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

.hint {
  font-size: 12px;
  color: #555;
}

.status {
  font-family: ui-monospace, monospace;
  font-size: 12px;
}

.log {
  margin: 0 0 14px;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: #fafafa;
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
}
</style>
