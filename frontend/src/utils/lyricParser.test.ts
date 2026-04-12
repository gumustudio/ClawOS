import test from 'node:test'
import assert from 'node:assert/strict'
import { parseLrc } from './lyricParser'

test('parseLrc supports multiple timestamps in one line', () => {
  const parsed = parseLrc('[00:01.00][00:02.50]hello')
  assert.equal(parsed.length, 2)
  assert.equal(parsed[0].text, 'hello')
  assert.equal(parsed[0].time, 1)
  assert.equal(parsed[1].time, 2.5)
})

test('parseLrc supports timestamps without milliseconds', () => {
  const parsed = parseLrc('[00:12]world')
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].time, 12)
  assert.equal(parsed[0].text, 'world')
})

test('parseLrc ignores metadata lines without lyric text', () => {
  const parsed = parseLrc('[ar:someone]\n[00:01.00]line')
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].text, 'line')
})
