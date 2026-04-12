import test from 'node:test'
import assert from 'node:assert/strict'
import { getMetadataBadge } from './localMusicMeta'

test('getMetadataBadge returns failure badge first', () => {
  const badge = getMetadataBadge({ warmupFailed: true, warmupFailureReason: '未找到匹配', metadataSource: 'netease-live' })
  assert.equal(badge?.label, '补全失败')
})

test('getMetadataBadge returns live enrichment badge', () => {
  const badge = getMetadataBadge({ warmupFailed: false, metadataSource: 'netease-live' })
  assert.equal(badge?.label, '云端补全')
})

test('getMetadataBadge returns null for embedded-only tracks', () => {
  const badge = getMetadataBadge({ warmupFailed: false, metadataSource: 'embedded' })
  assert.equal(badge, null)
})

test('getMetadataBadge hides cache enrichment badge', () => {
  const badge = getMetadataBadge({ warmupFailed: false, metadataSource: 'netease-cache' })
  assert.equal(badge, null)
})
