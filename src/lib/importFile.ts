export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h\d|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

async function docxToText(buf: ArrayBuffer): Promise<string> {
  const mammoth = (await import('mammoth')).default
  const r = await mammoth.convertToHtml(
    { arrayBuffer: buf },
    { convertImage: mammoth.images.imgElement(async () => ({ src: '' })) },
  )
  return htmlToText(r.value)
}

async function pdfToText(buf: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise
  const out: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    type Item = { str: string; transform: number[] }
    const items = content.items.filter((i) => 'str' in i) as unknown as Item[]
    let lastY: number | null = null
    let line = ''
    let lastGap = 0
    for (const it of items) {
      const y = it.transform[5]
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        const gap = Math.abs(lastY - y)
        out.push(line.trim())
        // A bigger vertical gap means a new paragraph
        if (lastGap && gap > lastGap * 1.6) out.push('')
        lastGap = gap
        line = ''
      }
      line += it.str
      lastY = y
    }
    out.push(line.trim(), '')
  }
  return out.join('\n')
}

export async function fileToText(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  const buf = await file.arrayBuffer()
  if (name.endsWith('.docx')) return docxToText(buf)
  if (name.endsWith('.pdf')) return pdfToText(buf)
  if (name.endsWith('.doc')) throw new Error('Oude .doc-bestanden worden niet ondersteund. Sla het op als .docx of PDF.')
  return new TextDecoder().decode(buf)
}
