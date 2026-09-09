<script setup lang="ts">
import { BlendMode, PDFDocument, PDFString, rgb } from '@cantoo/pdf-lib'
import PdfWriterPage, { type PdfWriter } from './PdfWriterPage.vue'
import { type Dependency } from './DependencyList.vue'

const lib: PdfWriter = { BlendMode, PDFDocument, PDFString, rgb }

const capabilities = [
  'Fork extras: encrypt (AES-256), convertToPDFA, saveIncremental, takeSnapshot, layers',
]

const deps: Dependency[] = [
  {
    name: '@cantoo/pdf-lib',
    version: '2.9.1',
    license: 'MIT',
    url: 'https://www.npmjs.com/package/@cantoo/pdf-lib',
    size: '~257 KB gzip (isolated build)',
    updated: '2026-08-18 — actively released',
    note:
      'Maintained fork of pdf-lib, which itself has been dormant since 2022. Adds encryption, PDF/A conversion, incremental save (keeps existing signatures valid) and optional content groups. Cannot render.',
  },
]
</script>

<template>
  <PdfWriterPage
    added="+~257 KB gzip"
    :capabilities="capabilities"
    :deps="deps"
    download="see the dependency note"
    :lib="lib"
    name="@cantoo/pdf-lib"
    weight="Measured in an isolated build: about 257 KB gzip of library — the heavier of the two, buying encryption, PDF/A and incremental save."
  />
</template>
