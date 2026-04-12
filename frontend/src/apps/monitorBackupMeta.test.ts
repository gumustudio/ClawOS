import test from 'node:test'
import assert from 'node:assert/strict'

import { getBackupObservationClassName } from './monitorBackupMeta'

test('getBackupObservationClassName maps ok to success styling', () => {
  assert.equal(getBackupObservationClassName('ok'), 'border-emerald-200 bg-emerald-50 text-emerald-700')
})

test('getBackupObservationClassName maps warning to alert styling', () => {
  assert.equal(getBackupObservationClassName('warning'), 'border-amber-200 bg-amber-50 text-amber-700')
})

test('getBackupObservationClassName maps missing-config to neutral styling', () => {
  assert.equal(getBackupObservationClassName('missing-config'), 'border-slate-200 bg-slate-50 text-slate-600')
})

test('getBackupObservationClassName maps missing-index to neutral styling', () => {
  assert.equal(getBackupObservationClassName('missing-index'), 'border-slate-200 bg-slate-50 text-slate-600')
})
