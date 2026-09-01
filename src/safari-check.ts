import '@sec-ant/readable-stream/polyfill/asyncIterator'

import { createApp, h, shallowRef } from 'vue'
import VuePdfEmbed from 'vue-pdf-embed'

const logEl = document.getElementById('log')!
const verdictEl = document.getElementById('verdict')!

const lines: string[] = []

const log = (message: string) => {
  lines.push(message)
  logEl.textContent += `${message}\n`
  document.title = `RESULT|| ${lines.join(' || ')}`
}

window.addEventListener('error', (event) => {
  log(`window.error: ${event.message} @ ${event.filename}:${event.lineno}`)
})

window.addEventListener('unhandledrejection', (event) => {
  log(`unhandledrejection: ${String(event.reason)}`)
})

log(`UA: ${navigator.userAgent}`)
log(
  `features: withResolvers=${typeof (Promise as unknown as Record<string, unknown>).withResolvers} ` +
    `abortAny=${typeof (AbortSignal as unknown as Record<string, unknown>).any} ` +
    `offscreen=${typeof OffscreenCanvas} ` +
    `imageDecoder=${typeof (globalThis as Record<string, unknown>).ImageDecoder}`,
)

const workerProbe = () => {
  try {
    const blob = new Blob(['self.postMessage("ok")'], { type: 'text/javascript' })
    const url = URL.createObjectURL(blob)
    const worker = new Worker(url, { type: 'module' })
    worker.onmessage = () => {
      log('blob module worker: OK')
      worker.terminate()
    }
    worker.onerror = (event) => {
      log(`blob module worker FAILED: ${(event as ErrorEvent).message || 'error event'}`)
    }
  } catch (error) {
    log(`blob module worker THREW: ${String(error)}`)
  }
}

workerProbe()

const params = new URLSearchParams(location.search)
const useTextLayer = params.get('textlayer') !== '0'
const usePolyfill = params.get('polyfill') === '1'

type AsyncIterableStream = {
  getReader: () => { read: () => Promise<unknown>; releaseLock: () => void }
}

const streamProto = ReadableStream.prototype as unknown as Record<symbol, unknown>

log(
  `ReadableStream asyncIterator native: ${typeof streamProto[Symbol.asyncIterator]}`,
)

if (usePolyfill && !streamProto[Symbol.asyncIterator]) {
  streamProto[Symbol.asyncIterator] = function (this: AsyncIterableStream) {
    const reader = this.getReader()
    return {
      next: () => reader.read(),
      return: (value: unknown) => {
        reader.releaseLock()
        return Promise.resolve({ done: true, value })
      },
      [Symbol.asyncIterator]() {
        return this
      },
    }
  }
  log('applied ReadableStream asyncIterator polyfill')
}

log(`config: textLayer=${useTextLayer} polyfill=${usePolyfill}`)

const source = shallowRef<Uint8Array | null>(null)

createApp({
  setup() {
    return () =>
      source.value
        ? h(VuePdfEmbed, {
            id: 'pdf-embed',
            source: source.value,
            annotationLayer: true,
            textLayer: useTextLayer,
            onLoaded: (doc: { numPages: number }) => {
              log(`loaded: ${doc.numPages} pages`)
            },
            onRendered: () => {
              const pages = document.querySelectorAll('.vue-pdf-embed__page').length
              const textDivs = document.querySelectorAll('.textLayer span').length
              log(`rendered: ${pages} pages, ${textDivs} text spans`)
              verdictEl.textContent = pages > 0 ? 'PDF RENDERED OK' : 'NO PAGES'
              verdictEl.className = pages > 0 ? 'good' : 'bad'
            },
            'onLoading-failed': (error: Error) => {
              log(`loading-failed: ${error.name}: ${error.message}`)
              verdictEl.textContent = 'LOADING FAILED'
              verdictEl.className = 'bad'
            },
            'onRendering-failed': (error: Error) => {
              log(
                `rendering-failed: ${error.name}: ${error.message} :: STACK ${String(
                  error.stack,
                ).replace(/\n/g, ' >> ').slice(0, 600)}`,
              )
              verdictEl.textContent = 'RENDERING FAILED'
              verdictEl.className = 'bad'
            },
          })
        : h('p', 'fetching sample…')
  },
}).mount('#viewer')

const start = async () => {
  try {
    const response = await fetch('/sample.pdf')
    const buffer = await response.arrayBuffer()
    log(`fetched sample.pdf: ${buffer.byteLength} bytes`)
    source.value = new Uint8Array(buffer.slice(0))
  } catch (error) {
    log(`fetch failed: ${String(error)}`)
    verdictEl.textContent = 'FETCH FAILED'
    verdictEl.className = 'bad'
  }
}

start()

setTimeout(() => {
  if (verdictEl.textContent === 'running…') {
    verdictEl.textContent = 'TIMED OUT — nothing rendered, no error fired'
    verdictEl.className = 'bad'
  }
}, 12000)
