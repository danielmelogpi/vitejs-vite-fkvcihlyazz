# vue-pdf-embed lab

Minimal POC for [`vue-pdf-embed`](https://github.com/hrynko/vue-pdf-embed) (v2.1.6).

## Pages

`/` is a static index (no JS) linking to every experiment. Each experiment page opens with a card on the
right saying what it evaluates and what the page weighs.

| Route | What it evaluates | Page weight (gzip) |
| --- | --- | --- |
| `/vue-pdf-embed.html` | pdf.js via `vue-pdf-embed` (incl. form fill + save) | 821 KB |
| `/embed-tag.html` | native `<embed>` / `<object>` / `<iframe>` | 27 KB |
| `/pdfobject.html` | `pdfobject-vue` | 28 KB |

Measure them yourself with `npm run measure` (builds, then walks the Vite manifest summing each entry's
chunks and CSS). The pdf.js page is dominated by pdf.js; the two native pages are almost entirely the Vue
runtime.

## vue-pdf-embed page

Split pane: PDF on the left, controls on the right. Pick a PDF with the file input and the whole document
renders — one document at a time, picking another replaces it. The left pane scrolls freely; a static
`<select>` of pages 1–10 scrolls the viewer to the chosen page; and every annotation found in the document
is listed, with a click scrolling to that annotation.

## Run

```bash
npm install
npx vite --port 5177 --strictPort
```

## Fixtures

`public/sample.pdf` (Document A, 8 pages), `public/sample-b.pdf` (Document B, 4 pages), and
`public/sample-annotated.pdf` (3 pages, 5 annotations: two links, a sticky note, a highlight, a form
field). Regenerate with:

```bash
node scripts/make-sample-pdf.mjs public/sample.pdf   "Document A" 8 a
node scripts/make-sample-pdf.mjs public/sample-b.pdf "Document B" 4 b
node scripts/make-form-pdf.mjs public/sample-form.pdf
node scripts/make-annotated-pdf.mjs public/sample-annotated.pdf
```

## Native `<embed>` comparison

`/embed-tag.html` renders the same PDFs through the browser's built-in viewer (`<embed>` / `<object>` /
`<iframe>` switch) instead of pdf.js. Zero bundle cost, free toolbar and thumbnails, `#page=N` works — but
no JS API whatsoever: no page count, no annotations, no text. It also **cannot scroll to a page without
reloading** — mutating the fragment on a live element is a silent no-op, and the plugin's scroll container
is outside the DOM, so smooth scrolling is impossible. The "Navigate by" select in that page reproduces
all three routes. See findings §12.

## `pdfobject-vue` comparison

`/pdfobject.html` renders the same PDFs through [`pdfobject-vue`](https://www.npmjs.com/package/pdfobject-vue)
— the official Vue 3 wrapper around PDFObject. ~2.8 KB gzip, adds browser capability detection and a
download-link fallback on top of the native tag, but has the same ceiling (no JS API, page changes
re-embed). Note it re-embeds on *every* component update, not just when its props change. See findings §13.

## Safari

`main.ts` imports `@sec-ant/readable-stream/polyfill/asyncIterator` **before mounting**. Without it, Safari
renders nothing whenever the text layer is on: pdf.js's `getTextContent()` iterates a `ReadableStream` with
`for await`, and Safari has no `ReadableStream[Symbol.asyncIterator]` (desktop Safari gets it in 27; iOS is
unsupported through 26.5). This is the workaround pdf.js maintainers point consumers to —
[mozilla/pdf.js#20973](https://github.com/mozilla/pdf.js/issues/20973). Costs +402 B gzip.

Playwright cannot drive Safari, and its WebKit build *does* have the async iterator — so it does not catch
this. Verify in real Safari by hand, or with the CI-runnable stand-in in the playground
(`tests/browser-support.spec.ts` deletes the async iterator to reproduce the failure on any engine).

## How it works

- **Local file, no URL:** `await file.arrayBuffer()` → `new Uint8Array(buffer.slice(0))` assigned to the
  `source` prop. The `slice(0)` copy matters — pdf.js transfers the buffer to its worker and leaves the
  original detached. A `File`/`Blob` cannot be passed to `source` directly.
- **Reactive swap:** `source` is a `shallowRef`; assigning a new value reloads in place, no remount.
- **Page selection:** every page is rendered, and the select scrolls to one. The `id` prop makes each page
  container `#pdf-embed-<n>`, so the handler is `getElementById(...).scrollIntoView()`. The library has no
  navigation API of its own.
- **Why not the `page` prop?** `page` (`number | number[]`) is a render *filter*, not a jump — it renders
  only the given page(s), which rules out scrolling the document. It's cheaper for long files, and asking
  for a page the document doesn't have renders nothing at all (blank pane, no error). With the scroll
  approach, an out-of-range page is a harmless no-op instead.
- **Annotations:** on `loaded`, the pdf.js document is looped `1..numPages` calling `getAnnotations()`.
  Clicking an entry targets `[data-annotation-id="<id>"]` — pdf.js stamps that id on each rendered
  annotation — and falls back to the page container when the annotation layer is off or hasn't rendered
  yet (it renders after the canvases). Icons need `imageResourcesPath`; `public/annotation-icons/` holds
  the `annotation-*.svg` assets copied from `pdfjs-dist/web/images/`.
- **Not wired:** the select doesn't follow manual scrolling — scrolling to page 5 by hand leaves the
  select where it was. That would need an `IntersectionObserver` over the page containers.

Findings: `ai-planning/vue-pdf-embed/findings.md`.
UAT: `ai-planning/playwright-playground/vue-pdf-embed-lab`.
