import test from 'node:test'
import assert from 'node:assert/strict'

import { getNetdiskFileKind } from './netdiskFileType'

test('getNetdiskFileKind detects folders', () => {
  assert.equal(getNetdiskFileKind({ name: '音乐', is_dir: true }), 'folder')
})

test('getNetdiskFileKind detects images by extension', () => {
  assert.equal(getNetdiskFileKind({ name: 'cover.webp', is_dir: false }), 'image')
})

test('getNetdiskFileKind detects videos by extension', () => {
  assert.equal(getNetdiskFileKind({ name: 'movie.mkv', is_dir: false }), 'video')
})

test('getNetdiskFileKind detects audio by extension', () => {
  assert.equal(getNetdiskFileKind({ name: 'track.mp3', is_dir: false }), 'audio')
  assert.equal(getNetdiskFileKind({ name: 'lossless.flac', is_dir: false }), 'audio')
})

test('getNetdiskFileKind falls back to document for unknown files', () => {
  assert.equal(getNetdiskFileKind({ name: 'archive.zip', is_dir: false }), 'document')
})
