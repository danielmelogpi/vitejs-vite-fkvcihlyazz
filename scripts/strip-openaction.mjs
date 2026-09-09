import { readFileSync, writeFileSync } from 'node:fs'
import { PDFDocument, PDFName } from '@cantoo/pdf-lib'

const [input, output] = process.argv.slice(2)
const doc = await PDFDocument.load(readFileSync(input))

const before = doc.catalog.get(PDFName.of('OpenAction'))
console.log('OpenAction before:', before ? String(before) : 'none')

doc.catalog.delete(PDFName.of('OpenAction'))
doc.catalog.delete(PDFName.of('AA'))

const bytes = await doc.save()
writeFileSync(output, bytes)

const check = await PDFDocument.load(bytes)
console.log('OpenAction after :', check.catalog.get(PDFName.of('OpenAction')) ? 'STILL THERE' : 'removed')
console.log('pages:', check.getPageCount(), '| bytes:', bytes.byteLength)
console.log('this.print in output:', Buffer.from(bytes).includes(Buffer.from('this.print')))
