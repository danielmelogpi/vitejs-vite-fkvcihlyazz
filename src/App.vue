<script setup lang="ts">
import { ref, shallowRef, useTemplateRef } from 'vue'
import VuePdfEmbed from 'vue-pdf-embed'

import 'vue-pdf-embed/dist/styles/annotationLayer.css'
import 'vue-pdf-embed/dist/styles/textLayer.css'

const EMBED_ID = 'pdf-embed'

const source = shallowRef<Uint8Array | null>(null)
const page = ref(1)
const annotationLayer = ref(true)


const onFileInput = async (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0]

  if (!file) {
    return
  }

  const buffer = await file.arrayBuffer()

  page.value = 1
  source.value = new Uint8Array(buffer.slice(0))
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
        text-layer
        :source="source"
        :annotationLayer
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
</style>
