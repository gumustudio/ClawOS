import test from 'node:test'
import assert from 'node:assert/strict'

import { buildDidaInboxWidgetModel } from './didaWidgetMeta'
import type { Project, Task } from './DidaApp/types'

function createTask(overrides: Partial<Task> & Pick<Task, 'id' | 'title' | 'projectId'>): Task {
  const { id, title, projectId, ...rest } = overrides
  return {
    id,
    title,
    projectId,
    content: '',
    priority: 0,
    status: 0,
    isAllDay: true,
    tags: [],
    sortOrder: 0,
    ...rest,
  }
}

test('buildDidaInboxWidgetModel keeps only inbox tasks and sorts overdue first', () => {
  const now = new Date('2026-04-07T10:00:00+08:00')
  const projects: Project[] = [
    { id: 'inbox', name: '收集箱', color: '#3b82f6', isSystem: true },
    { id: 'work', name: '工作', color: '#ef4444' },
  ]

  const result = buildDidaInboxWidgetModel([
    createTask({ id: 'future', title: '未来任务', projectId: 'work', dueDate: '2026-04-09T08:00:00.000+0800' }),
    createTask({ id: 'today', title: '今天任务', projectId: 'inbox', dueDate: '2026-04-07T18:00:00.000+0800', priority: 3 }),
    createTask({ id: 'overdue', title: '逾期任务', projectId: 'inbox', dueDate: '2026-04-06T18:00:00.000+0800', priority: 5 }),
    createTask({ id: 'nodate', title: '无日期任务', projectId: 'inbox' }),
  ], projects, now, 4)

  assert.equal(result.inboxProjectId, 'inbox')
  assert.equal(result.pendingCount, 3)
  assert.deepEqual(result.tasks.map((task) => task.id), ['overdue', 'today', 'nodate'])
  assert.equal(result.tasks[0]?.dueLabel, '已逾期')
  assert.equal(result.tasks[1]?.dueLabel, '今天')
})

test('buildDidaInboxWidgetModel counts completed inbox tasks for today', () => {
  const now = new Date('2026-04-07T10:00:00+08:00')
  const result = buildDidaInboxWidgetModel([
    createTask({ id: 'done', title: '已完成', projectId: 'inbox', status: 2, dueDate: '2026-04-07T09:00:00.000+0800' }),
    createTask({ id: 'todo', title: '待办', projectId: 'inbox', dueDate: '2026-04-07T12:00:00.000+0800' }),
  ], [{ id: 'inbox', name: '收集箱', color: '#3b82f6', isSystem: true }], now, 5)

  assert.equal(result.pendingCount, 1)
  assert.equal(result.completedTodayCount, 1)
  assert.deepEqual(result.tasks.map((task) => task.id), ['todo'])
})
