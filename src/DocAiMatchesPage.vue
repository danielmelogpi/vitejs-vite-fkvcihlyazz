<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { PDFDocument, PDFString } from '@pdfme/pdf-lib'
import DependencyList, { type Dependency } from './DependencyList.vue'
import { parseMatches, type Match } from './docaiMatches'
import { addBoxAnnotation, type Rgb } from './pdfAnnotations'
import type { PDFDocument as WriterDocument, PDFString as WriterString } from '@cantoo/pdf-lib'

const PLACED: Rgb = [1, 0, 0.55]

const jsonFile = ref<File | null>(null)
const pdfFile = ref<File | null>(null)
const pdfBytes = ref<Uint8Array | null>(null)
const matches = ref<Match[]>([])
const selected = ref<Set<string>>(new Set())
const pdfPageCount = ref(0)
const existingAnnots = ref(0)
const jsonPageCount = ref(0)
const error = ref('')
const status = ref('')
const viewerUrl = ref('')
const page = ref(1)

const hasBox = (match: Match) => match.placements.some((placement) => placement.box)

const inRange = (pageNumber: number) => pageNumber >= 1 && pageNumber <= pdfPageCount.value

const placeable = (match: Match) =>
  match.placements.some((placement) => placement.box && inRange(placement.page))

const counts = computed(() => ({
  total: matches.value.length,
  boxed: matches.value.filter(hasBox).length,
  unboxed: matches.value.filter((match) => !hasBox(match)).length,
  selected: matches.value.filter((match) => selected.value.has(match.key) && placeable(match))
    .length,
}))

const allSelected = computed(
  () =>
    matches.value.filter(placeable).length > 0 &&
    matches.value.filter(placeable).every((match) => selected.value.has(match.key)),
)

const viewerSrc = computed(() => (viewerUrl.value ? `${viewerUrl.value}#page=${page.value}` : ''))

const revoke = () => {
  if (viewerUrl.value) {
    URL.revokeObjectURL(viewerUrl.value)
    viewerUrl.value = ''
  }
}

const onJsonInput = (event: Event) => {
  jsonFile.value = (event.target as HTMLInputElement).files?.[0] ?? null
}

const onPdfInput = (event: Event) => {
  pdfFile.value = (event.target as HTMLInputElement).files?.[0] ?? null
}

const bake = async () => {
  if (!pdfBytes.value) {
    return
  }

  const doc = await PDFDocument.load(pdfBytes.value)
  let written = 0

  matches.value
    .filter((match) => selected.value.has(match.key))
    .forEach((match) => {
      match.placements.forEach((placement, index) => {
        if (!placement.box || !inRange(placement.page)) {
          return
        }

        // the two pdf-lib forks are structurally identical; the helper is typed against one of them
        addBoxAnnotation({
          doc: doc as unknown as WriterDocument,
          page: doc.getPage(placement.page - 1) as unknown as ReturnType<WriterDocument['getPage']>,
          box: placement.box,
          label: `${match.type}: ${match.text}`,
          color: PLACED,
          pdfString: PDFString as unknown as typeof WriterString,
          author: 'document-ai',
          name: `docai-${match.id || match.key}-${index}`,
        })
        written += 1
      })
    })

  const output = await doc.save()

  const check = await PDFDocument.load(output)
  const readBack = check
    .getPages()
    .reduce((sum, item) => sum + (item.node.Annots()?.size() ?? 0), 0)

  revoke()
  viewerUrl.value = URL.createObjectURL(
    new Blob([output as unknown as BlobPart], { type: 'application/pdf' }),
  )
  status.value = `wrote ${written} annotation(s) from ${counts.value.selected} selected match(es) · ${readBack} in the output, ${existingAnnots.value} of them already in the original · ${output.byteLength} bytes`
}

const process = async () => {
  error.value = ''
  status.value = ''

  if (!jsonFile.value || !pdfFile.value) {
    error.value = 'Choose both a JSON and a PDF first.'
    return
  }

  const parsed = parseMatches(await jsonFile.value.text())

  if (parsed.error) {
    error.value = parsed.error
    matches.value = []
    return
  }

  pdfBytes.value = new Uint8Array(await pdfFile.value.arrayBuffer())
  const original = await PDFDocument.load(pdfBytes.value)
  pdfPageCount.value = original.getPageCount()
  existingAnnots.value = original
    .getPages()
    .reduce((sum, item) => sum + (item.node.Annots()?.size() ?? 0), 0)
  jsonPageCount.value = parsed.pageCount

  if (parsed.pageCount && parsed.pageCount !== pdfPageCount.value) {
    error.value = `The JSON describes ${parsed.pageCount} page(s) but the PDF has ${pdfPageCount.value} — are these the same document?`
  }

  matches.value = parsed.matches
  selected.value = new Set(parsed.matches.filter(placeable).map((match) => match.key))
  page.value = 1
}

const toggle = (match: Match) => {
  const next = new Set(selected.value)

  if (next.has(match.key)) {
    next.delete(match.key)
  } else {
    next.add(match.key)
  }

  selected.value = next
}

const toggleAll = () => {
  selected.value = allSelected.value
    ? new Set()
    : new Set(matches.value.filter(placeable).map((match) => match.key))
}

const goTo = (match: Match) => {
  const target = match.placements.find((placement) => inRange(placement.page))

  if (target) {
    page.value = target.page
  }
}

watch(selected, () => void bake())

onBeforeUnmount(revoke)

const deps: Dependency[] = [
  {
    name: '@pdfme/pdf-lib',
    version: '6.1.12',
    license: 'MIT',
    url: 'https://www.npmjs.com/package/@pdfme/pdf-lib',
    size: '~224 KB gzip',
    updated: '2026-07-23 — maintained in the pdfme monorepo',
    note: 'Writes each selected match into the PDF as a real /Annot with its own transparent appearance.',
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
      <p v-else data-testid="empty-state">Choose a Document AI JSON and its PDF, then process.</p>
    </section>

    <section class="pane">
      <div class="card" data-testid="about">
        <h2>Document AI matches → annotations</h2>
        Reads every entity in a Document AI response, lists what it found, and writes the selected ones
        into the PDF as annotations with <code>@pdfme/pdf-lib</code>. The browser's own viewer draws
        them.
        <ul>
          <li>Each entity can point at several pages, so every bounding box it carries is written</li>
          <li>Entities with no bounding box can't be placed — they are listed with a warning</li>
          <li>Unticking an item re-writes the file without it</li>
          <li>Each annotation gets <code>/NM docai-&lt;id&gt;</code>, so it can be found again by id</li>
        </ul>
      </div>

      <div class="card uploads">
        <label>
          Document AI JSON
          <input
            accept="application/json,.json"
            data-testid="json-input"
            type="file"
            @change="onJsonInput"
          />
        </label>
        <label>
          PDF
          <input accept="application/pdf" data-testid="pdf-input" type="file" @change="onPdfInput" />
        </label>
        <button
          data-testid="process"
          :disabled="!jsonFile || !pdfFile"
          type="button"
          @click="process"
        >
          Process
        </button>
      </div>

      <p v-if="error" class="error" data-testid="error">{{ error }}</p>

      <template v-if="matches.length">
        <p class="summary" data-testid="summary">
          {{ counts.total }} match(es) · {{ counts.boxed }} with a bounding box ·
          {{ counts.unboxed }} without · {{ counts.selected }} selected
        </p>

        <p class="status" data-testid="status">{{ status || 'writing…' }}</p>

        <label class="inline select-all">
          <input
            :checked="allSelected"
            data-testid="select-all"
            type="checkbox"
            @change="toggleAll"
          />
          select all that can be placed
        </label>

        <ul class="matches" data-testid="matches">
          <li
            v-for="match in matches"
            :key="match.key"
            :class="{ 'is-unboxed': !hasBox(match) }"
            :data-testid="`match-${match.key}`"
          >
            <label class="inline head">
              <input
                :checked="selected.has(match.key) && placeable(match)"
                :data-testid="`match-check-${match.key}`"
                :disabled="!placeable(match)"
                type="checkbox"
                @change="toggle(match)"
              />
              <code class="type">{{ match.type }}</code>
            </label>

            <dl class="data">
              <dt>text</dt>
              <dd :data-testid="`match-text-${match.key}`">{{ match.text || '—' }}</dd>
              <template v-if="match.normalized">
                <dt>normalised</dt>
                <dd>{{ match.normalized }}</dd>
              </template>
              <dt>confidence</dt>
              <dd>{{ match.confidence === null ? '—' : match.confidence.toFixed(2) }}</dd>
              <dt>page</dt>
              <dd>{{ match.placements.map((placement) => placement.page).join(', ') || '—' }}</dd>
              <template v-if="match.anchor">
                <dt>text anchor</dt>
                <dd>{{ match.anchor }}</dd>
              </template>
              <dt>id</dt>
              <dd>{{ match.id || '—' }}</dd>
            </dl>

            <p v-if="!hasBox(match)" class="warning" :data-testid="`match-warning-${match.key}`">
              ⚠ No bounding box in the response — this match can't be placed on the page.
            </p>
            <p
              v-else-if="!placeable(match)"
              class="warning"
              :data-testid="`match-warning-${match.key}`"
            >
              ⚠ Points at page {{ match.placements.map((placement) => placement.page).join(', ') }},
              but the PDF only has {{ pdfPageCount }}.
            </p>

            <button
              v-if="match.placements.some((placement) => inRange(placement.page))"
              :data-testid="`match-goto-${match.key}`"
              type="button"
              @click="goTo(match)"
            >
              Go to page
            </button>
          </li>
        </ul>
      </template>

      <DependencyList
        added="+~227 KB gzip (@pdfme/pdf-lib)"
        :deps="deps"
        download="see the dependency note"
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

.error {
  padding: 6px 8px;
  border: 1px solid #c62828;
  border-radius: 4px;
  background: #fdecea;
  font-size: 12px;
}

.summary,
.status {
  font-family: ui-monospace, monospace;
  font-size: 12px;
}

.matches {
  margin: 0 0 14px;
  padding: 0;
  list-style: none;
}

.matches li {
  margin-bottom: 8px;
  padding: 8px 10px;
  border: 1px solid #ddd;
  border-left: 4px solid rgb(255 0 140);
  border-radius: 4px;
}

.matches li.is-unboxed {
  border-left-color: #b8860b;
}

.head {
  margin-bottom: 4px;
}

.type {
  font-size: 12px;
}

.data {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 2px 12px;
  margin: 0 0 6px;
  font-size: 12px;
}

.data dt {
  color: #555;
}

.data dd {
  margin: 0;
  white-space: pre-wrap;
}

.warning {
  margin: 0 0 6px;
  color: #8a6100;
  font-size: 12px;
}
</style>
