<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'
import MarkerControl, { type Marker } from './MarkerControl.vue'

type TagName = 'embed' | 'object' | 'iframe'
type NavMode = 'remount' | 'fragment' | 'hash'

const objectUrl = ref('')
const page = ref(1)
const appliedPage = ref(1)
const tag = ref<TagName>('iframe')
const mode = ref<NavMode>('fragment')
const remountKey = ref(0)
const loadCount = ref(0)
const log = ref<string[]>([])
const marker = ref<Marker>({ text: 'sign here', page: 1, x: 20, y: 30, w: 30, h: 6 })
const host = useTemplateRef<HTMLElement>('host')

const say = (message: string) => {
  log.value = [`${log.value.length + 1}. ${message}`, ...log.value].slice(0, 15)
  document.title = `RESULT|| ${[...log.value].reverse().join(' || ')}`
}

const src = computed(() =>
  objectUrl.value ? `${objectUrl.value}#page=${appliedPage.value}` : '',
)

const frame = () => host.value?.querySelector('iframe') as HTMLIFrameElement | null

const onLoad = () => {
  loadCount.value += 1
  say(`load event #${loadCount.value}`)
}

const revoke = () => {
  if (objectUrl.value) {
    URL.revokeObjectURL(objectUrl.value)
    objectUrl.value = ''
  }
}

const onFileInput = (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0]

  if (!file) {
    return
  }

  revoke()
  page.value = 1
  appliedPage.value = 1
  loadCount.value = 0
  objectUrl.value = URL.createObjectURL(file)
  say(`loaded ${file.name}`)
}

const goToPage = async () => {
  const before = loadCount.value

  if (mode.value === 'fragment') {
    appliedPage.value = page.value
    say(`fragment -> page ${page.value}`)
  } else if (mode.value === 'remount') {
    appliedPage.value = page.value
    remountKey.value += 1
    say(`remount -> page ${page.value}`)
  } else {
    const target = frame()

    try {
      if (!target?.contentWindow) {
        throw new Error('no contentWindow')
      }

      target.contentWindow.location.hash = `#page=${page.value}`
      say(`hash -> page ${page.value} (no throw)`)
    } catch (error) {
      say(`hash THREW: ${String(error).slice(0, 90)}`)
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 1200))
  say(`after: loads ${before} -> ${loadCount.value}`)
}

onMounted(async () => {
  if (new URLSearchParams(location.search).get('auto') === '1') {
    const response = await fetch('/sample.pdf')
    objectUrl.value = URL.createObjectURL(await response.blob())
    say('auto-loaded sample.pdf')
  }

  await nextTick()
  const navigatorWithViewer = navigator as Navigator & { pdfViewerEnabled?: boolean }
  say(`pdfViewerEnabled=${navigatorWithViewer.pdfViewerEnabled}`)
})

onBeforeUnmount(revoke)
</script>

<template>
  <div class="lab">
    <section ref="host" class="pane viewer" data-testid="viewer">
      <div
        v-if="marker.text && src"
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
      <template v-if="src">
        <embed
          v-if="tag === 'embed'"
          :key="`embed-${remountKey}`"
          data-testid="pdf-tag"
          :src="src"
          type="application/pdf"
          @load="onLoad"
        />
        <object
          v-else-if="tag === 'object'"
          :key="`object-${remountKey}`"
          :data="src"
          data-testid="pdf-tag"
          type="application/pdf"
          @load="onLoad"
        >
          <p>object fallback content</p>
        </object>
        <iframe
          v-else
          :key="`iframe-${remountKey}`"
          data-testid="pdf-tag"
          :src="src"
          title="pdf"
          @load="onLoad"
        />
      </template>
      <p v-else data-testid="empty-state">Choose a PDF to display it here.</p>
    </section>

    <section class="pane">
      <div class="card" data-testid="about">
        <h2>native &lt;embed&gt;</h2>
        The browser's own PDF viewer, no library at all.
        <ul>
          <li>Whether a local file renders from a <code>blob:</code> URL</li>
          <li>Whether <code>#page=N</code> navigates &mdash; and whether it reloads</li>
          <li>What JS can reach inside the tag (nothing)</li>
          <li><code>&lt;embed&gt;</code> vs <code>&lt;object&gt;</code> vs <code>&lt;iframe&gt;</code></li>
          <li>Whether an overlay can be injected and anchored (it can't follow scroll)</li>
        </ul>
        <p class="weight">
          Page weight 29 KB gzip &mdash; <strong>no library at all</strong>; the 2.5 KB beyond
          the 26 KB shared Vue baseline is this page's own code.
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
        Tag
        <select v-model="tag" data-testid="tag-select">
          <option value="embed">embed</option>
          <option value="object">object</option>
          <option value="iframe">iframe</option>
        </select>
      </label>

      <label>
        Navigate by
        <select v-model="mode" data-testid="mode-select">
          <option value="fragment">fragment (mutate src)</option>
          <option value="hash">contentWindow.location.hash</option>
          <option value="remount">remount element</option>
        </select>
      </label>

      <MarkerControl
        v-model="marker"
        :max-page="10"
        page-note="no effect: the tag exposes no page or scroll position"
      />

      <label>
        Page
        <select v-model.number="page" data-testid="page-select" @change="goToPage">
          <option v-for="n in 10" :key="n" :value="n">{{ n }}</option>
        </select>
      </label>

      <p>loads: <strong data-testid="load-count">{{ loadCount }}</strong></p>

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


embed,
object,
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


ul {
  font-family: ui-monospace, monospace;
  font-size: 12px;
}
</style>
