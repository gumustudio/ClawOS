import test from 'node:test'
import assert from 'node:assert/strict'

import { getNotePreview, htmlToMarkdown, markdownToHtml } from './noteMarkdown'

test('getNotePreview strips markdown syntax for sidebar copy', () => {
  assert.equal(getNotePreview('# 标题\n- 列表项目\n[链接](https://example.com)'), '标题 列表项目 链接')
})

test('markdownToHtml renders markdown headings', () => {
  assert.match(markdownToHtml('# 标题'), /<h1[^>]*>标题<\/h1>/)
})

test('htmlToMarkdown converts editor html back to markdown', () => {
  assert.equal(htmlToMarkdown('<h1>标题</h1><p>正文</p>').trim(), '# 标题\n\n正文')
})
