<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { parseField, type ParsedField } from './ocrFields'

export type OcrBox = {
  id: number
  label: string
  page: number
  box: NonNullable<ParsedField['box']>
}

const boxes = defineModel<OcrBox[]>({ required: true })

const props = defineProps<{ maxPage?: number; note?: string }>()

const emit = defineEmits<{ jump: [OcrBox] }>()

type Entry = { id: number; raw: string; parsed: ParsedField }

let seq = 0

const newEntry = (): Entry => {
  seq += 1

  return { id: seq, raw: '', parsed: parseField('') }
}

const entries = ref<Entry[]>([newEntry()])
const preloaded = ref(0)

const publish = () => {
  boxes.value = entries.value
    .filter((entry) => entry.parsed.box && entry.parsed.page)
    .map((entry) => ({
      id: entry.id,
      label: entry.parsed.label,
      page: entry.parsed.page as number,
      box: entry.parsed.box as NonNullable<ParsedField['box']>,
    }))
}

const onInput = (entry: Entry) => {
  entry.parsed = parseField(entry.raw)
  publish()
}

const add = () => {
  entries.value.push(newEntry())
}

const remove = (id: number) => {
  entries.value = entries.value.filter((entry) => entry.id !== id)
  publish()
}

const records = (text: string): string[] => {
  try {
    const parsed: unknown = JSON.parse(text)

    if (Array.isArray(parsed)) {
      return parsed.map((item) => JSON.stringify(item))
    }
  } catch {
    // not a single JSON document, so treat it as JSON Lines below
  }

  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

onMounted(async () => {
  try {
    const response = await fetch('/page-refs.json')

    if (!response.ok) {
      return
    }

    const lines = records(await response.text())

    if (!lines.length) {
      return
    }

    seq = 0
    entries.value = lines.map((line) => {
      seq += 1

      return { id: seq, raw: line, parsed: parseField(line) }
    })

    preloaded.value = entries.value.length
    publish()
  } catch {
    // leave the single blank entry in place
  }
})

watch(() => props.maxPage, publish)
</script>

<template>
  <fieldset class="ocr">
    <legend>Document AI fields</legend>
    <p class="hint">
      Paste an entity, a <code>pageAnchor</code>, or just a <code>normalizedVertices</code> array.
      <code>page</code> is Document AI's 0-based index, so <code>"page": "12"</code> is page 13; an
      absent <code>page</code>, <code>x</code> or <code>y</code> means zero.
      <span v-if="note">{{ note }}</span>
    </p>

    <p v-if="preloaded" class="hint" data-testid="ocr-preloaded">
      Preloaded <strong>{{ preloaded }}</strong> record(s) from
      <code>public/page-refs.json</code> &mdash; edit, remove or add more below.
    </p>

    <div v-for="entry in entries" :key="entry.id" class="ocr-entry">
      <textarea
        v-model="entry.raw"
        :data-testid="`ocr-input-${entry.id}`"
        placeholder='"normalizedVertices": [{ "x": 0.19, "y": 0.58 }, ...]'
        rows="2"
        @change="onInput(entry)"
        @input="onInput(entry)"
      />

      <p class="ocr-status" :data-testid="`ocr-status-${entry.id}`">
        <span v-if="entry.parsed.error" class="bad">{{ entry.parsed.error }}</span>
        <template v-else-if="entry.parsed.box">
          <strong>{{ entry.parsed.label }}</strong> &middot; page {{ entry.parsed.page }} &middot;
          {{ entry.parsed.vertices }} vertices &middot;
          {{ entry.parsed.box.x.toFixed(1) }}%, {{ entry.parsed.box.y.toFixed(1) }}% &middot;
          {{ entry.parsed.box.w.toFixed(1) }}&times;{{ entry.parsed.box.h.toFixed(1) }}%
          <span v-if="maxPage && (entry.parsed.page ?? 0) > maxPage" class="bad">
            — beyond this document ({{ maxPage }} pages)
          </span>
        </template>
        <template v-else>waiting for JSON</template>
      </p>

      <button
        v-if="entry.parsed.box && entry.parsed.page"
        :data-testid="`ocr-jump-${entry.id}`"
        type="button"
        @click="
          emit('jump', {
            id: entry.id,
            label: entry.parsed.label,
            page: entry.parsed.page,
            box: entry.parsed.box,
          })
        "
      >
        Jump to it
      </button>

      <button :data-testid="`ocr-remove-${entry.id}`" type="button" @click="remove(entry.id)">
        Remove
      </button>
    </div>

    <button data-testid="ocr-add" type="button" @click="add">Add marker</button>
  </fieldset>
</template>

<style scoped>
.ocr {
  margin-bottom: 10px;
  padding: 6px 10px 10px;
  border: 1px solid #ccc;
  border-radius: 6px;
}

legend {
  padding: 0 4px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.hint {
  margin: 4px 0 8px;
  font-size: 12px;
  color: #555;
}

.ocr-entry {
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px dashed #ddd;
}

textarea {
  width: 100%;
  box-sizing: border-box;
  font-family: ui-monospace, monospace;
  font-size: 11px;
}

.ocr-status {
  margin: 4px 0;
  font-size: 12px;
}

.bad {
  color: #b00;
}
</style>
