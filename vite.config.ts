import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const entry = (name: string) => resolve(__dirname, `${name}.html`)

export default defineConfig({
  plugins: [vue()],
  build: {
    manifest: true,
    rollupOptions: {
      input: {
        index: entry('index'),
        vuePdfEmbed: entry('vue-pdf-embed'),
        embedTag: entry('embed-tag'),
        pdfobject: entry('pdfobject'),
      },
    },
  },
})
