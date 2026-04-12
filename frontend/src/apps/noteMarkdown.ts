import { marked } from 'marked'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'

marked.setOptions({
  breaks: true,
  gfm: true
})

const turndownService = new TurndownService({
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  headingStyle: 'atx'
})

turndownService.use(gfm)

export function markdownToHtml(markdown: string) {
  return marked.parse(markdown || '') as string
}

export function htmlToMarkdown(html: string) {
  return turndownService.turndown(html || '')
}

export function getNotePreview(content: string) {
  return content
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~`>#-]/g, '')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function downloadMarkdownFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename
  link.click()

  URL.revokeObjectURL(url)
}
