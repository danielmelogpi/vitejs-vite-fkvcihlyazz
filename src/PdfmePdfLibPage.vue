<script setup lang="ts">
import { PDFDocument, PDFString, rgb } from '@pdfme/pdf-lib'
import PdfWriterPage, { type PdfWriter } from './PdfWriterPage.vue'
import { type Dependency } from './DependencyList.vue'

// the forks are structurally identical pdf-lib builds; one cast keeps the shared page monomorphic
const lib = { PDFDocument, PDFString, rgb } as unknown as PdfWriter

const capabilities = [
  'No fork extras — plain pdf-lib core, which is why it is the lighter of the two',
]

const deps: Dependency[] = [
  {
    name: '@pdfme/pdf-lib',
    version: '6.1.12',
    license: 'MIT',
    url: 'https://www.npmjs.com/package/@pdfme/pdf-lib',
    size: '~224 KB gzip (isolated build)',
    updated: '2026-07-23 — maintained in the pdfme monorepo',
    note:
      'Maintained fork of pdf-lib with the same drawing and document API, minus cantoo’s encryption and PDF/A extras. Cannot render.',
  },
]
</script>

<template>
  <PdfWriterPage
    added="+~224 KB gzip"
    :capabilities="capabilities"
    :deps="deps"
    download="see the dependency note"
    :lib="lib"
    name="@pdfme/pdf-lib"
    weight="Measured in an isolated build: about 224 KB gzip of library — the lighter of the two maintained options, and still four times annotpdf."
  />
</template>
