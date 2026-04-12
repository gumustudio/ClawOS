import test from 'node:test'
import assert from 'node:assert/strict'

import { getCleanupLabel, getTaskDisplayName, getTaskStatusLabel, getWidgetTaskSummary, getWidgetTasks, getWidgetTaskTone, matchesDownloadFilter } from './downloadTaskMeta'

test('matchesDownloadFilter keeps waiting separate from paused', () => {
  assert.equal(matchesDownloadFilter('waiting', 'waiting'), true)
  assert.equal(matchesDownloadFilter('waiting', 'paused'), false)
})

test('matchesDownloadFilter treats removed as failed history', () => {
  assert.equal(matchesDownloadFilter('removed', 'error'), true)
})

test('getCleanupLabel returns expected labels', () => {
  assert.equal(getCleanupLabel('completed'), '清理已完成')
  assert.equal(getCleanupLabel('failed'), '清理失败/已删除')
  assert.equal(getCleanupLabel('all-history'), '清空全部历史')
})

test('getTaskStatusLabel returns user-facing copy', () => {
  assert.equal(getTaskStatusLabel({ status: 'active' }), '下载中')
  assert.equal(getTaskStatusLabel({ status: 'waiting' }), '排队中')
  assert.equal(getTaskStatusLabel({ status: 'error' }), '下载失败')
})

test('getWidgetTasks prioritizes active queue states before history', () => {
  const tasks = getWidgetTasks([
    { gid: '1', status: 'complete', totalLength: '10', completedLength: '10', downloadSpeed: '0' },
    { gid: '2', status: 'waiting', totalLength: '10', completedLength: '0', downloadSpeed: '0' },
    { gid: '3', status: 'active', totalLength: '10', completedLength: '5', downloadSpeed: '1' },
    { gid: '4', status: 'error', totalLength: '10', completedLength: '1', downloadSpeed: '0' }
  ], 3)

  assert.deepEqual(tasks.map((task) => task.gid), ['3', '2', '4'])
})

test('getTaskDisplayName falls back to first file path name', () => {
  assert.equal(getTaskDisplayName({
    gid: '1',
    status: 'paused',
    totalLength: '0',
    completedLength: '0',
    downloadSpeed: '0',
    files: [{ path: '/downloads/demo.zip' }]
  }), 'demo.zip')
})

test('getWidgetTaskTone matches new status categories', () => {
  assert.equal(getWidgetTaskTone('waiting'), 'text-amber-600')
  assert.equal(getWidgetTaskTone('complete'), 'text-emerald-600')
})

test('getWidgetTaskSummary prefers backend error details for failed tasks', () => {
  assert.equal(getWidgetTaskSummary({
    gid: 'err-1',
    status: 'error',
    totalLength: '10',
    completedLength: '1',
    downloadSpeed: '0',
    errorMessage: '磁盘空间不足'
  }), '磁盘空间不足')
})
