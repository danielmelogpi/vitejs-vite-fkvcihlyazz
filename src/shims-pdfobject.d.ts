declare module 'pdfobject-vue' {
  import type { DefineComponent } from 'vue'

  export const PdfObject: DefineComponent<{
    url: string
    options?: Record<string, unknown>
  }>

  const plugin: { install: (app: unknown) => void }
  export default plugin
}

declare module 'pdfobject' {
  const PDFObject: {
    embed: (
      url: string,
      target: unknown,
      options?: Record<string, unknown>,
    ) => HTMLElement | false
    supportsPDFs: boolean
    pdfobjectversion: string
  }

  export default PDFObject
}
