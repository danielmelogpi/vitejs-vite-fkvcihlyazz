<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import VuePdfEmbed from 'vue-pdf-embed'
import type { PDFDocumentProxy } from 'pdfjs-dist'

import 'vue-pdf-embed/dist/styles/annotationLayer.css'
import 'vue-pdf-embed/dist/styles/textLayer.css'

const EMBED_ID = 'pdf-embed'

type FoundAnnotation = {
  page: number
  id: string
  subtype: string
  label: string
}

const source = shallowRef<Uint8Array | null>(null)
const page = ref(1)
const annotationLayer = ref(true)
const annotations = ref<FoundAnnotation[]>([])


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

const onLoaded = async (doc: PDFDocumentProxy) => {
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
        image-resources-path="/annotation-icons/"
        text-layer
        :source="source"
        :annotationLayer
        @loaded="onLoaded"
      />
      <p v-else data-testid="empty-state">Choose a PDF to display it here.</p>
    </section>

    <section class="pane">
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

label {
  display: block;
  margin-bottom: 8px;
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
