# vue-pdf-embed lab

Minimal POC for [`vue-pdf-embed`](https://github.com/hrynko/vue-pdf-embed) (v2.1.6).

Split pane: PDF on the left, controls on the right. Pick a PDF with the file input and the whole document
renders — one document at a time, picking another replaces it. The left pane scrolls freely; a static
`<select>` of pages 1–10 scrolls the viewer to the chosen page.

## Run

```bash
npm install
npx vite --port 5177 --strictPort
```

## Fixtures

`public/sample.pdf` (Document A, 8 pages), `public/sample-b.pdf` (Document B, 4 pages). Regenerate with:

```bash
node scripts/make-sample-pdf.mjs public/sample.pdf   "Document A" 8 a
node scripts/make-sample-pdf.mjs public/sample-b.pdf "Document B" 4 b
```

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
- **Not wired:** the select doesn't follow manual scrolling — scrolling to page 5 by hand leaves the
  select where it was. That would need an `IntersectionObserver` over the page containers.

Findings: `ai-planning/vue-pdf-embed/findings.md`.
UAT: `ai-planning/playwright-playground/vue-pdf-embed-lab`.
