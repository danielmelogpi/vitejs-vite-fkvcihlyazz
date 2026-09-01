<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'
import { PdfObject } from 'pdfobject-vue'
import PDFObject from 'pdfobject'
import MarkerControl, { type Marker } from './MarkerControl.vue'

const objectUrl = ref('')
const page = ref(1)
const embedCount = ref(0)
const log = ref<string[]>([])
const marker = ref<Marker>({ text: 'sign here', page: 1, x: 20, y: 30, w: 30, h: 6 })
const host = useTemplateRef<HTMLElement>('host')

const say = (message: string) => {
  log.value = [`${log.value.length + 1}. ${message}`, ...log.value].slice(0, 15)
  document.title = `RESULT|| ${[...log.value].reverse().join(' || ')}`
}

const options = computed(() => ({
  pdfOpenParams: { page: page.value },
  height: '100%',
}))

const revoke = () => {
  if (objectUrl.value) {
    URL.revokeObjectURL(objectUrl.value)
    objectUrl.value = ''
  }
}

const describeEmbed = async () => {
  await nextTick()
  const el = host.value?.querySelector('embed, iframe, object, a')
  say(
    `container child: <${el?.tagName.toLowerCase() ?? 'none'}> ` +
      `src=${(el?.getAttribute('src') ?? el?.getAttribute('href') ?? '').slice(-14)}`,
  )
}

const onFileInput = async (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0]

  if (!file) {
    return
  }

  revoke()
  page.value = 1
  objectUrl.value = URL.createObjectURL(file)
  say(`loaded ${file.name}`)
  await describeEmbed()
}

const onPage = async () => {
  say(`pdfOpenParams.page -> ${page.value}`)
  await describeEmbed()
}

onMounted(async () => {
  say(`PDFObject ${PDFObject.pdfobjectversion} supportsPDFs=${PDFObject.supportsPDFs}`)

  const observer = new MutationObserver(() => {
    embedCount.value += 1
  })

  if (host.value) {
    observer.observe(host.value, { childList: true, subtree: true })
  }

  onBeforeUnmount(() => observer.disconnect())

  if (new URLSearchParams(location.search).get('auto') === '1') {
    const response = await fetch('/sample.pdf')
    objectUrl.value = URL.createObjectURL(await response.blob())
    say('auto-loaded sample.pdf')
    await describeEmbed()
  }
})

onBeforeUnmount(revoke)
</script>

<template>
  <div class="lab">
    <section ref="host" class="pane viewer" data-testid="viewer">
      <div
        v-if="marker.text && objectUrl"
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
      <PdfObject v-if="objectUrl" :options="options" :url="objectUrl" />
      <p v-else data-testid="empty-state">Choose a PDF to display it here.</p>
    </section>

    <section class="pane">
      <div class="card" data-testid="about">
        <h2>pdfobject-vue</h2>
        The native tag plus PDFObject's feature detection.
        <ul>
          <li><code>supportsPDFs</code> detection and the download-link fallback</li>
          <li>Page selection through <code>pdfOpenParams</code></li>
          <li>Whether changing the page re-embeds (it does)</li>
        </ul>
        <p class="weight">
          Page weight 30 KB gzip &mdash; <strong>adds ~4 KB</strong> over the 26 KB shared Vue
          baseline (pdfobject itself is ~2.4 KB of that).
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

      <MarkerControl
        v-model="marker"
        :max-page="10"
        page-note="no effect: PDFObject renders the same opaque tag"
      />

      <label>
        Page
        <select v-model.number="page" data-testid="page-select" @change="onPage">
          <option v-for="n in 10" :key="n" :value="n">{{ n }}</option>
        </select>
      </label>

      <p>
        DOM mutations in the container:
        <strong data-testid="embed-count">{{ embedCount }}</strong>
      </p>

      <ul data-testid="log">
        <li v-for="entry in log" :key="entry">{{ entry }}</li>
      </ul>
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
  position: relative;
  border-right: 1px solid #ccc;
}

.marker {
  position: absolute;
  z-index: 5;
  box-sizing: border-box;
  padding: 2px 6px;
  border: 1px solid rgba(0, 90, 200, 0.9);
  border-radius: 3px;
  background: rgba(0, 120, 255, 0.25);
  font-size: 12px;
  overflow: hidden;
  pointer-events: none;
}


.viewer :deep(div) {
  height: 100%;
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


ul {
  font-family: ui-monospace, monospace;
  font-size: 12px;
}
</style>
