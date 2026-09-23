<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'
import { PDFDict, PDFDocument, PDFName, PDFString } from '@pdfme/pdf-lib'
import DependencyList, { type Dependency } from './DependencyList.vue'

type Guard = 'none' | 'sandbox' | 'strip'

type Script = { where: string; detail: string }

const SANDBOX_PRESETS = [
  { value: 'allow-same-origin', label: 'allow-same-origin (no scripts, no modals)' },
  { value: 'allow-same-origin allow-scripts', label: 'allow-same-origin allow-scripts (modals off)' },
  {
    value: 'allow-same-origin allow-scripts allow-modals',
    label: 'allow-same-origin allow-scripts allow-modals (control — should print again)',
  },
]

const guard = ref<Guard>('none')
const sandbox = ref(SANDBOX_PRESETS[1].value)
const blobUrl = ref('')
const fileName = ref('')
const scripts = ref<Script[]>([])
const servedScripts = ref<Script[] | null>(null)
const stripped = ref<string[]>([])
const beforePrintCount = ref(0)
const afterPrintCount = ref(0)
const parentPrintCalls = ref(0)
const framePrintCalls = ref(0)
const frameAccess = ref('')
const log = ref<string[]>([])
const frame = useTemplateRef<HTMLIFrameElement>('frame')

let original: Uint8Array | null = null
let nativePrint: typeof window.print | null = null

const note = (line: string) => {
  log.value = [...log.value, `${new Date().toISOString().slice(11, 23)}  ${line}`]
}

const iframeSrc = computed(() => blobUrl.value)

const sandboxAttr = computed(() => (guard.value === 'sandbox' ? sandbox.value : undefined))

const caught = computed(
  () => beforePrintCount.value > 0 || parentPrintCalls.value > 0 || framePrintCalls.value > 0,
)

const onBeforePrint = () => {
  beforePrintCount.value += 1
  note('parent beforeprint fired')
}

const onAfterPrint = () => {
  afterPrintCount.value += 1
  note('parent afterprint fired')
}

const scan = (doc: PDFDocument): Script[] => {
  const found: Script[] = []

  const describe = (value: unknown) => {
    const dict = value instanceof PDFDict ? value : undefined

    if (!dict) {
      return ''
    }

    const kind = dict.get(PDFName.of('S'))
    const js = dict.get(PDFName.of('JS'))
    const body = js instanceof PDFString ? js.asString() : String(js ?? '')

    return `${String(kind ?? '?')} ${body}`.trim()
  }

  const openAction = doc.catalog.get(PDFName.of('OpenAction'))

  if (openAction) {
    const resolved = doc.context.lookup(openAction)
    const detail = describe(resolved)

    if (detail.includes('JavaScript')) {
      found.push({ where: '/Root /OpenAction', detail })
    }
  }

  const names = doc.catalog.get(PDFName.of('Names'))
  const namesDict = doc.context.lookup(names)

  if (namesDict instanceof PDFDict && namesDict.get(PDFName.of('JavaScript'))) {
    found.push({ where: '/Root /Names /JavaScript', detail: 'document-level JavaScript name tree' })
  }

  doc.getPages().forEach((pdfPage, index) => {
    if (pdfPage.node.get(PDFName.of('AA'))) {
      found.push({ where: `page ${index + 1} /AA`, detail: 'additional-actions dictionary' })
    }
  })

  return found
}

const strip = async (bytes: Uint8Array) => {
  const doc = await PDFDocument.load(bytes)
  const removed: string[] = []

  if (doc.catalog.get(PDFName.of('OpenAction'))) {
    doc.catalog.delete(PDFName.of('OpenAction'))
    removed.push('/Root /OpenAction')
  }

  const names = doc.context.lookup(doc.catalog.get(PDFName.of('Names')))

  if (names instanceof PDFDict && names.get(PDFName.of('JavaScript'))) {
    names.delete(PDFName.of('JavaScript'))
    removed.push('/Root /Names /JavaScript')
  }

  doc.getPages().forEach((pdfPage, index) => {
    if (pdfPage.node.get(PDFName.of('AA'))) {
      pdfPage.node.delete(PDFName.of('AA'))
      removed.push(`page ${index + 1} /AA`)
    }
  })

  stripped.value = removed

  return doc.save()
}

const revoke = () => {
  if (blobUrl.value) {
    URL.revokeObjectURL(blobUrl.value)
    blobUrl.value = ''
  }
}

const probeFrame = () => {
  const el = frame.value

  if (!el) {
    frameAccess.value = 'no frame'
    return
  }

  try {
    const win = el.contentWindow

    if (!win) {
      frameAccess.value = 'contentWindow is null'
      note('reach-in: contentWindow is null')
      return
    }

    // reading any property of a cross-origin window throws — that is the whole question
    const href = win.location.href

    if (href === 'about:blank') {
      frameAccess.value = 'frame has not navigated yet (about:blank)'
      note('reach-in: still about:blank — nothing to read yet')
      return
    }

    const doc = el.contentDocument

    frameAccess.value = `reachable — ${href}, document ${doc ? 'readable' : 'null'}`
    note(`reach-in: frame is reachable (${href})`)

    win.addEventListener('beforeprint', () => {
      framePrintCalls.value += 1
      note('reach-in: intercepted a beforeprint event inside the frame')
    })
    
    win.addEventListener('afterprint', () => {
      framePrintCalls.value += 1
      note('reach-in: intercepted an afterprint event inside the frame')
    })

    win.print = () => {
      framePrintCalls.value += 1
      note('reach-in: intercepted a print() call inside the frame')
    }
    note('reach-in: patched the frame window.print')
  } catch (error) {
    frameAccess.value = `blocked — ${String(error).slice(0, 140)}`
    note(`reach-in: BLOCKED — ${String(error).slice(0, 140)}`)
  }
}

const show = async () => {
  if (!original) {
    return
  }

  revoke()
  scripts.value = []
  servedScripts.value = null
  stripped.value = []
  beforePrintCount.value = 0
  afterPrintCount.value = 0
  parentPrintCalls.value = 0
  framePrintCalls.value = 0
  frameAccess.value = ''
  log.value = []

  let bytes: Uint8Array = new Uint8Array(original)

  const doc = await PDFDocument.load(bytes)
  scripts.value = scan(doc)
  note(
    scripts.value.length
      ? `scan: ${scripts.value.length} script hook(s) — this document will try to run code`
      : 'scan: no script hooks in this document',
  )

  if (guard.value === 'strip') {
    bytes = await strip(bytes)
    note(`strip: removed ${stripped.value.length} entr(y|ies) — ${stripped.value.join(', ') || 'nothing'}`)
  }

  if (guard.value === 'sandbox') {
    note(`sandbox: frame gets sandbox="${sandbox.value}"`)
  }

  servedScripts.value = scan(await PDFDocument.load(bytes))
  note(`served bytes carry ${servedScripts.value.length} script hook(s)`)

  blobUrl.value = URL.createObjectURL(
    new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' }),
  )
  note('frame loading the document')
}

const onFileInput = async (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0]

  if (!file) {
    return
  }

  fileName.value = file.name
  original = new Uint8Array(await file.arrayBuffer())
  await show()
}

const loadFixture = async () => {
  const response = await fetch('/print-on-open.pdf')
  fileName.value = 'print-on-open.pdf'
  original = new Uint8Array(await response.arrayBuffer())
  await show()
}

onMounted(() => {
  nativePrint = window.print.bind(window)

  window.print = () => {
    parentPrintCalls.value += 1
    note('parent window.print() was called — and swallowed')
  }

  window.addEventListener('beforeprint', onBeforePrint)
  window.addEventListener('afterprint', onAfterPrint)
})

onBeforeUnmount(() => {
  if (nativePrint) {
    window.print = nativePrint
  }

  window.removeEventListener('beforeprint', onBeforePrint)
  window.removeEventListener('afterprint', onAfterPrint)
  revoke()
})

const deps: Dependency[] = [
  {
    name: '@pdfme/pdf-lib',
    version: '6.1.12',
    license: 'MIT',
    url: 'https://www.npmjs.com/package/@pdfme/pdf-lib',
    size: '~224 KB gzip',
    updated: '2026-07-23 — maintained in the pdfme monorepo',
    note: 'Used to read the catalog and delete the script hooks. The only guard here that actually works.',
  },
]
</script>

<template>
  <div class="lab">
    <section class="pane viewer" data-testid="viewer">
      <iframe
        v-if="iframeSrc"
        :key="`${iframeSrc}-${sandboxAttr ?? 'open'}`"
        ref="frame"
        data-testid="pdf-tag"
        @load="probeFrame"
        :sandbox="sandboxAttr"
        :src="iframeSrc"
        title="pdf"
      />
      <p v-else data-testid="empty-state">Load the probe document to start.</p>
    </section>

    <section class="pane">
      <div class="card" data-testid="about">
        <h2>Print-on-open guard</h2>
        Some documents carry <code>/OpenAction &rarr; /JavaScript (this.print())</code>. Firefox's viewer
        runs document JavaScript, so the print dialog opens by itself. This page tries every way of
        catching or blocking it from the embedding page.
        <ul>
          <li>
            <strong>Catch it</strong> — <code>beforeprint</code> and a patched <code>window.print</code>
            on the parent: <strong>never fires</strong>
          </li>
          <li>
            <strong>Reach into the frame</strong> — patch <code>contentWindow.print</code>:
            <strong>blocked</strong>, the viewer is a cross-origin document
          </li>
          <li>
            <strong>Block it</strong> — <code>sandbox</code> without <code>allow-modals</code>: only
            renders at all if <code>allow-scripts</code> is also set
          </li>
          <li>
            <strong>Remove it</strong> — delete the hooks from the bytes first:
            <strong>works</strong>, and it is the only one that does
          </li>
        </ul>
        <p class="weight" data-testid="weight">
          Chromium's viewer does not run this action, so the dialog itself only appears in Firefox.
          Everything else here is observable in any browser.
        </p>
      </div>

      <div class="card">
        <button data-testid="load-fixture" type="button" @click="loadFixture">
          Load print-on-open.pdf
        </button>
        <label>
          …or your own PDF
          <input
            accept="application/pdf"
            data-testid="file-input"
            type="file"
            @change="onFileInput"
          />
        </label>
        <p class="hint" data-testid="file-name">{{ fileName || 'nothing loaded' }}</p>
      </div>

      <label>
        Guard
        <select v-model="guard" data-testid="guard-select" @change="show">
          <option value="none">none — hand the bytes straight to the viewer</option>
          <option value="sandbox">sandbox the iframe</option>
          <option value="strip">strip the script hooks from the bytes</option>
        </select>
      </label>

      <label v-if="guard === 'sandbox'">
        sandbox tokens
        <select v-model="sandbox" data-testid="sandbox-select" @change="show">
          <option v-for="preset in SANDBOX_PRESETS" :key="preset.value" :value="preset.value">
            {{ preset.label }}
          </option>
        </select>
      </label>

      <div class="card">
        <h2>What the document carries</h2>
        <p v-if="!scripts.length" class="hint" data-testid="scan-result">
          {{ fileName ? 'no script hooks found' : 'load a document to scan it' }}
        </p>
        <ul v-else data-testid="scan-result">
          <li v-for="item in scripts" :key="item.where">
            <code>{{ item.where }}</code> — {{ item.detail }}
          </li>
        </ul>
        <p v-if="stripped.length" class="hint" data-testid="stripped">
          removed: {{ stripped.join(', ') }}
        </p>
        <p v-if="servedScripts" class="hint" data-testid="served-scripts">
          the frame is being handed {{ servedScripts.length }} script hook(s)
        </p>
      </div>

      <div class="card">
        <h2>What the parent can observe</h2>
        <dl class="obs">
          <dt>parent <code>beforeprint</code></dt>
          <dd data-testid="beforeprint-count">{{ beforePrintCount }}</dd>
          <dt>parent <code>afterprint</code></dt>
          <dd data-testid="afterprint-count">{{ afterPrintCount }}</dd>
          <dt>parent <code>print()</code> calls</dt>
          <dd data-testid="parent-print-calls">{{ parentPrintCalls }}</dd>
          <dt>frame <code>print()</code> calls</dt>
          <dd data-testid="frame-print-calls">{{ framePrintCalls }}</dd>
          <dt>frame reachable</dt>
          <dd data-testid="frame-access">{{ frameAccess || '—' }}</dd>
        </dl>
        <p :class="['verdict', caught ? 'is-caught' : 'is-blind']" data-testid="verdict">
          {{
            caught
              ? 'Something reached the parent — see the log.'
              : 'The parent saw nothing. A dialog raised inside the viewer does not cross the frame boundary.'
          }}
        </p>
      </div>

      <div class="card">
        <h2>What we established</h2>
        <ul>
          <li>
            Firefox renders the PDF in its own privileged document, so
            <code>contentWindow</code> throws
            <code>SecurityError: Permission denied … on cross-origin object</code>. There is no handle
            to patch, and no event crosses back. <strong>Interception is not possible.</strong>
          </li>
          <li>
            <code>sandbox="allow-same-origin"</code> alone leaves the viewer chrome up and the page
            <strong>blank</strong> — pdf.js never runs. Add <code>allow-scripts</code> and it renders
            again. So the sandbox cannot be tightened past the token the viewer itself needs.
          </li>
          <li>
            Whether <code>allow-scripts</code> without <code>allow-modals</code> still suppresses the
            dialog is <strong>unverified</strong> — the test runner suppresses printing, so this needs a
            human at a real Firefox. Try the three presets above and watch for the dialog.
          </li>
          <li>
            Stripping is verified end to end: the served bytes are re-parsed after the rewrite and carry
            <strong>zero</strong> hooks, and the document still renders.
          </li>
        </ul>
      </div>

      <pre v-if="log.length" class="log" data-testid="log">{{ log.join('\n') }}</pre>

      <DependencyList
        added="+227.4 KB gzip (@pdfme/pdf-lib, for the strip guard)"
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

.obs {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 2px 12px;
  margin: 6px 0;
  font-size: 12px;
}

.obs dt {
  color: #555;
}

.obs dd {
  margin: 0;
  font-family: ui-monospace, monospace;
}

.verdict {
  margin: 8px 0 0;
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.verdict.is-caught {
  border: 1px solid #2e7d32;
  background: #eaf5ea;
}

.verdict.is-blind {
  border: 1px solid #b8860b;
  background: #fff8dc;
}

.hint {
  font-size: 12px;
  color: #555;
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
