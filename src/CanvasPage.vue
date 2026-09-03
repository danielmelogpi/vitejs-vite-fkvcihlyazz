<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, useTemplateRef } from 'vue'
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'
import MarkerControl, { type Marker } from './MarkerControl.vue'
import DependencyList, { type Dependency } from './DependencyList.vue'

GlobalWorkerOptions.workerSrc = workerUrl

type PageSlot = { number: number; width: number; height: number; rendered: boolean }

const doc = shallowRef<PDFDocumentProxy | null>(null)
const pages = ref<PageSlot[]>([])
const zoom = ref(100)
const rendered = ref(0)
const status = ref('')
const marker = ref<Marker>({ text: 'sign here', page: 1, x: 20, y: 30, w: 30, h: 6 })
const viewer = useTemplateRef<HTMLElement>('viewer')

const baseWidth = ref(0)
const scale = computed(() => (baseWidth.value ? (baseWidth.value * zoom.value) / 100 : 0))

let observer: IntersectionObserver | null = null

const renderPage = async (slot: PageSlot) => {
  if (slot.rendered || !doc.value || !scale.value) {
    return
  }

  slot.rendered = true

  const pdfPage = await doc.value.getPage(slot.number)
  const unscaled = pdfPage.getViewport({ scale: 1 })
  const viewport = pdfPage.getViewport({ scale: scale.value / unscaled.width })
  const canvas = document.getElementById(`canvas-${slot.number}`) as HTMLCanvasElement | null

  if (!canvas) {
    slot.rendered = false
    return
  }

  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)

  await pdfPage.render({ canvas, viewport }).promise
  rendered.value += 1
  status.value = `${rendered.value} of ${pages.value.length} pages rasterised`
}

const observe = () => {
  observer?.disconnect()
  observer = new IntersectionObserver(
    (entries) => {
      entries
        .filter((entry) => entry.isIntersecting)
        .forEach((entry) => {
          const number = Number((entry.target as HTMLElement).dataset.page)
          const slot = pages.value.find((item) => item.number === number)

          if (slot) {
            void renderPage(slot)
          }
        })
    },
    { root: viewer.value, rootMargin: '200px' },
  )

  document
    .querySelectorAll<HTMLElement>('[data-page]')
    .forEach((element) => observer?.observe(element))
}

const load = async (bytes: Uint8Array) => {
  rendered.value = 0
  baseWidth.value = (viewer.value?.clientWidth ?? 700) - 24

  const loaded = await getDocument({ data: bytes }).promise
  doc.value = loaded

  const slots: PageSlot[] = []

  for (let number = 1; number <= loaded.numPages; number += 1) {
    const pdfPage = await loaded.getPage(number)
    const viewport = pdfPage.getViewport({ scale: 1 })
    const width = scale.value || baseWidth.value

    slots.push({
      number,
      width,
      height: (viewport.height / viewport.width) * width,
      rendered: false,
    })
  }

  pages.value = slots
  status.value = `${loaded.numPages} pages, none rasterised yet`
  await new Promise((resolve) => requestAnimationFrame(resolve))
  observe()
}

const onFileInput = async (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0]

  if (!file) {
    return
  }

  const buffer = await file.arrayBuffer()
  await load(new Uint8Array(buffer))
}

const onZoom = async () => {
  if (!doc.value) {
    return
  }

  rendered.value = 0
  pages.value = pages.value.map((slot) => ({
    ...slot,
    width: scale.value,
    height: (slot.height / slot.width) * scale.value,
    rendered: false,
  }))

  await new Promise((resolve) => requestAnimationFrame(resolve))
  observe()
}

const goToPage = () => {
  document
    .getElementById(`page-${marker.value.page}`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

onBeforeUnmount(() => observer?.disconnect())

const deps: Dependency[] = [
  {
    name: 'pdfjs-dist',
    version: '6.2.108',
    license: 'Apache-2.0',
    url: 'https://www.npmjs.com/package/pdfjs-dist',
    size: '+125 KB gzip in the page, 470 KB worker on demand',
    updated: '2026-08-29 (6.3.289; we pin 6.2.108)',
    note:
      'The only dependency. The modern build plus skipping the viewer module makes it six times lighter than the wrapper page; the worker is a separate file fetched when a document is first opened. No Safari polyfill needed because we never touch the text layer.',
  },
]
</script>

<template>
  <div class="lab">
    <section ref="viewer" class="pane viewer" data-testid="viewer">
      <div
        v-for="slot in pages"
        :id="`page-${slot.number}`"
        :key="slot.number"
        class="page"
        :data-page="slot.number"
        :data-testid="`page-${slot.number}`"
        :style="{ width: `${slot.width}px`, height: `${slot.height}px` }"
      >
        <canvas :id="`canvas-${slot.number}`" :data-testid="`canvas-${slot.number}`" />

        <div
          v-if="marker.text && slot.number === marker.page"
          class="marker"
          data-testid="marker"
          :style="{
            left: `${marker.x}%`,
            top: `${marker.y}%`,
            width: `${marker.w}%`,
            height: `${marker.h}%`,
          }"
        >
          {{ marker.text }}
        </div>
      </div>

      <p v-if="!pages.length" data-testid="empty-state">Choose a PDF to display it here.</p>
    </section>

    <section class="pane">
      <div class="card" data-testid="about">
        <h2>pure canvas</h2>
        pdf.js core straight onto our own canvases &mdash; no viewer wrapper at all.
        <ul>
          <li>Whether we can skip the wrapper and still render</li>
          <li>Lazy rendering: only pages you scroll to are rasterised</li>
          <li>Whether dropping the text layer avoids the Safari polyfill</li>
          <li>What the bundle looks like using the modern build</li>
        </ul>
        <p class="weight" data-testid="weight">
          Downloads <strong>155 KB over 6 requests</strong> (built app, compressed) &mdash; a
          sixth of the wrapper page. The 470 KB pdf.js worker is fetched separately, the first time
          a document is opened.
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
        Zoom <output data-testid="zoom-value">{{ zoom }}%</output>
        <input
          v-model.number="zoom"
          data-testid="zoom"
          max="300"
          min="50"
          step="10"
          type="range"
          @change="onZoom"
        />
      </label>

      <MarkerControl v-model="marker" :max-page="doc?.numPages ?? 1">
        <template #actions>
          <button data-testid="scroll-to-marker" type="button" @click="goToPage">
            Scroll to marker
          </button>
        </template>
      </MarkerControl>

      <p class="status" data-testid="status">{{ status || 'waiting for a file' }}</p>
      <p class="hint" data-testid="rendered-count">{{ rendered }}</p>
      <DependencyList added="+125 KB gzip" :deps="deps" download="155 KB over 6 requests" />
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
  background: #f4f4f4;
}

.page {
  position: relative;
  margin: 0 auto 12px;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
}

canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.marker {
  position: absolute;
  box-sizing: border-box;
  padding: 2px 6px;
  border: 1px solid rgba(0, 90, 200, 0.9);
  border-radius: 3px;
  background: rgba(0, 120, 255, 0.25);
  font-size: 12px;
  overflow: hidden;
  pointer-events: none;
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

.hint,
.status {
  font-size: 12px;
  color: #555;
}

.status {
  font-family: ui-monospace, monospace;
}
</style>
