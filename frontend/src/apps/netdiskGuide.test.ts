import test from 'node:test'
import assert from 'node:assert/strict'

import { getNetdiskGuideData } from './netdiskGuide'

test('getNetdiskGuideData returns baidu-specific setup values', () => {
  const result = getNetdiskGuideData('baidu')

  assert.equal(result.title, '百度网盘')
  assert.equal(result.storageTypeLabel, '百度网盘')
  assert.equal(result.targetPath, '/baidu')
  assert.equal(result.officialSiteUrl, 'https://pan.baidu.com/')
  assert.equal(result.credentialLabel, 'refresh_token')
  assert.equal(result.credentialField, 'refreshToken')
  assert.ok(result.cookieGuide.recommended.length > 0)
})

test('getNetdiskGuideData returns quark-specific setup values', () => {
  const result = getNetdiskGuideData('quark')

  assert.equal(result.title, '夸克网盘')
  assert.equal(result.storageTypeLabel, '夸克网盘')
  assert.equal(result.targetPath, '/quark')
  assert.equal(result.officialSiteUrl, 'https://pan.quark.cn/')
  assert.equal(result.credentialLabel, 'cookie')
  assert.equal(result.credentialField, 'cookie')
  assert.ok(result.cookieGuide.manual.length > 0)
})
