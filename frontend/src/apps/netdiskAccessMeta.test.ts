import test from 'node:test'
import assert from 'node:assert/strict'

import { getAlistManageUrl } from './netdiskAccessMeta'

test('getAlistManageUrl always targets local-only AList admin page', () => {
  assert.equal(getAlistManageUrl(), 'http://127.0.0.1:5244/@manage')
})
