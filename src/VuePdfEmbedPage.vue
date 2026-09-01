<script setup lang="ts">
import { ref, shallowRef, useTemplateRef } from 'vue'
import VuePdfEmbed from 'vue-pdf-embed'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import MarkerControl, { type Marker } from './MarkerControl.vue'

import 'vue-pdf-embed/dist/styles/annotationLayer.css'
import 'vue-pdf-embed/dist/styles/textLayer.css'

const EMBED_ID = 'pdf-embed'

type FoundAnnotation = {
  page: number
  id: string
  subtype: string
  label: string
}

const embed = useTemplateRef<{ download: (filename?: string) => Promise<void> }>('embed')
const source = shallowRef<Uint8Array | null>(null)
const page = ref(1)
const annotationLayer = ref(true)
const forms = ref(false)
const highlight = ref('')
const highlightBoxes = ref<Record<number, Array<{ x: number; y: number; w: number; h: number }>>>({})
const annotations = ref<FoundAnnotation[]>([])
const numPages = ref(0)
const marker = ref<Marker>({ text: 'sign here', page: 1, x: 20, y: 30, w: 30, h: 6 })


const onFileInput = async (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0]

  if (!file) {
    return
  }

  const buffer = await file.arrayBuffer()

  page.value = 1
  annotations.value = []
  source.value = new Uint8Array(buffer.slice(0))
}

const updateHighlights = () => {
  const term = highlight.value.trim().toLowerCase()
  const boxes: Record<number, Array<{ x: number; y: number; w: number; h: number }>> = {}

  if (term) {
    document.querySelectorAll<HTMLElement>('.vue-pdf-embed__page').forEach((pageEl) => {
      const pageNumber = Number(pageEl.id.replace(`${EMBED_ID}-`, ''))

      const pageRect = pageEl.getBoundingClientRect()

      boxes[pageNumber] = [
        ...pageEl.querySelectorAll<HTMLElement>('.textLayer span'),
      ]
        .filter((span) => (span.textContent ?? '').toLowerCase().includes(term))
        .map((span) => {
          const rect = span.getBoundingClientRect()

          return {
            x: rect.left - pageRect.left,
            y: rect.top - pageRect.top,
            w: rect.width,
            h: rect.height,
          }
        })
    })
  }

  highlightBoxes.value = boxes
}

const onRendered = () => {
  updateHighlights()
}

const onLoaded = async (doc: PDFDocumentProxy) => {
  numPages.value = doc.numPages

  if (marker.value.page > doc.numPages) {
    marker.value.page = 1
  }

  const found: FoundAnnotation[] = []

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const pdfPage = await doc.getPage(pageNumber)
    const items = await pdfPage.getAnnotations()

    items.forEach((item) => {
      found.push({
        page: pageNumber,
        id: item.id,
        subtype: item.subtype,
        label:
          item.contentsObj?.str ||
          item.titleObj?.str ||
          item.fieldName ||
          item.url ||
          item.subtype,
      })
    })
  }

  annotations.value = found
}

const goToAnnotation = (annotation: FoundAnnotation) => {
  page.value = annotation.page

  const marker = document.querySelector(`[data-annotation-id="${annotation.id}"]`)

  if (marker) {
    marker.scrollIntoView({ behavior: 'smooth', block: 'center' })
    return
  }

  document
    .getElementById(`${EMBED_ID}-${annotation.page}`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const scrollToMarker = () => {
  page.value = marker.value.page

  document
    .querySelector('[data-testid="marker"]')
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

const goToPage = () => {
  document
    .getElementById(`${EMBED_ID}-${page.value}`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <div class="lab">
    <section class="pane viewer" data-testid="viewer">
      <VuePdfEmbed
        v-if="source"
        :id="EMBED_ID"
        ref="embed"
        :forms="forms"
        image-resources-path="/annotation-icons/"
        text-layer
        :source="source"
        :annotationLayer
        @loaded="onLoaded"
        @rendered="onRendered"
      >
        <template #after-page="{ page: pageNumber }">
          <div
            v-if="marker.text && pageNumber === marker.page"
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
          <div
            v-for="(box, index) in highlightBoxes[pageNumber] ?? []"
            :key="index"
            class="hl"
            data-testid="highlight-box"
            :style="{
              left: `${box.x}px`,
              top: `${box.y}px`,
              width: `${box.w}px`,
              height: `${box.h}px`,
            }"
          />
        </template>
      </VuePdfEmbed>
      <p v-else data-testid="empty-state">Choose a PDF to display it here.</p>
    </section>

    <section class="pane">
      <div class="card" data-testid="about">
        <h2>vue-pdf-embed</h2>
        Renders with pdf.js, so the document is ours to drive from JS.
        <ul>
          <li>Local file with no URL: <code>File</code> &rarr; <code>Uint8Array</code></li>
          <li>Smooth scroll-to-page, no reload, all pages stay rendered</li>
          <li>Reading annotations and navigating to one</li>
          <li>Filling form fields and saving the edited bytes back</li>
          <li>Overlaying our own HTML on the page (try the highlight box)</li>
          <li>Safari support (needs a ReadableStream async-iterator polyfill)</li>
        </ul>
        <p class="weight" data-testid="weight">
          Downloads <strong>828 KB over 5 requests</strong> (built app, compressed).
          The library accounts for ~797 KB of it; the shared Vue baseline is ~26 KB.
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
        Page
        <select v-model.number="page" data-testid="page-select" @change="goToPage">
          <option v-for="n in 10" :key="n" :value="n">{{ n }}</option>
        </select>
      </label>
      <label>
        Enable annotation layer
        <input type="checkbox" value="true" v-model="annotationLayer" />
      </label>

      <label>
        Highlight text
        <input
          v-model="highlight"
          data-testid="highlight-input"
          placeholder="e.g. a-page-3"
          type="search"
          @input="updateHighlights"
        />
      </label>

      <MarkerControl v-model="marker" :max-page="numPages || 1">
        <template #actions>
          <button data-testid="scroll-to-marker" type="button" @click="scrollToMarker">
            Scroll to marker
          </button>
        </template>
      </MarkerControl>

      <label>
        Interactive form fields
        <input v-model="forms" data-testid="forms-toggle" type="checkbox" />
      </label>

      <button
        data-testid="save-copy"
        type="button"
        @click="embed?.download('annotated.pdf')"
      >
        Save a copy (bakes in form edits)
      </button>

      <nav data-testid="docs-links">
        <a href="https://www.npmjs.com/package/vue-pdf-embed#examples" rel="noopener" target="_blank">
          vue-pdf-embed examples
        </a>
        <a href="https://www.npmjs.com/package/pdfjs-dist" rel="noopener" target="_blank">
          pdfjs-dist
        </a>
      </nav>

      <section v-if="annotations.length" data-testid="annotation-list">
        <h2>Annotations ({{ annotations.length }})</h2>
        <ul>
          <li v-for="annotation in annotations" :key="annotation.id">
            <button
              :data-testid="`annotation-${annotation.id}`"
              type="button"
              @click="goToAnnotation(annotation)"
            >
              p{{ annotation.page }} · {{ annotation.subtype }} — {{ annotation.label }}
            </button>
          </li>
        </ul>
      </section>
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

.viewer :deep(.vue-pdf-embed__page) {
  margin-bottom: 12px;
}

.viewer :deep(.vue-pdf-embed > div) {
  position: relative;
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


.hl {
  position: absolute;
  background: rgba(255, 210, 0, 0.45);
  outline: 1px solid rgba(190, 140, 0, 0.8);
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


h2 {
  font-size: 1em;
}

li {
  margin-bottom: 4px;
}

nav {
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
  font-size: 0.85em;
}
</style>
