# vue-pdf-embed lab

Minimal POC for [`vue-pdf-embed`](https://github.com/hrynko/vue-pdf-embed) (v2.1.6).

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
node scripts/make-annotated-pdf.mjs public/sample-annotated.pdf
```

## Annotation probe

`/annotations.html` (dev server) is a separate scratch page — pick a PDF and it dumps every annotation in
the document as JSON. It uses the `usePdfDocument` composable plus pdf.js `getAnnotations()` per page, and
is deliberately kept out of `App.vue` so the POC stays minimal.

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
