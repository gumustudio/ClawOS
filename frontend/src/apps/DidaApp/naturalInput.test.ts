import assert from 'node:assert/strict';
import test from 'node:test';
import { getNaturalTimeFragments, parseNaturalTaskInput } from './naturalInput';

const fixedNow = new Date('2026-04-07T10:00:00+08:00');

test('parseNaturalTaskInput parses 后天上午8点并提取标题', () => {
  const parsed = parseNaturalTaskInput('后天上午8点去参加会议', fixedNow);
  assert.equal(parsed.title, '参加会议');
  assert.equal(parsed.isAllDay, false);
  assert.equal(parsed.reminder, '0');
  assert.ok(parsed.dueDate);

  const due = new Date(parsed.dueDate!);
  assert.equal(due.getHours(), 8);
});

test('parseNaturalTaskInput parses 明天18:30', () => {
  const parsed = parseNaturalTaskInput('明天18:30和团队吃饭', fixedNow);
  assert.equal(parsed.title, '和团队吃饭');
  assert.equal(parsed.isAllDay, false);
  assert.equal(parsed.reminder, '0');
  assert.ok(parsed.dueDate);
});

test('parseNaturalTaskInput handles date only', () => {
  const parsed = parseNaturalTaskInput('后天提交周报', fixedNow);
  assert.equal(parsed.title, '提交周报');
  assert.equal(parsed.isAllDay, true);
  assert.equal(parsed.reminder, undefined);
  assert.ok(parsed.dueDate);
});

test('parseNaturalTaskInput keeps original title when no natural time found', () => {
  const parsed = parseNaturalTaskInput('整理项目文档', fixedNow);
  assert.equal(parsed.title, '整理项目文档');
  assert.equal(parsed.dueDate, undefined);
});

test('getNaturalTimeFragments extracts date/time tokens', () => {
  const fragments = getNaturalTimeFragments('后天上午8点去参加会议');
  assert.deepEqual(fragments.sort(), ['8点', '上午', '后天'].sort());
});

test('parseNaturalTaskInput parses tonight shorthand for widget quick add', () => {
  const parsed = parseNaturalTaskInput('今晚8点提醒我缴费', fixedNow);
  assert.equal(parsed.title, '提醒我缴费');
  assert.equal(parsed.isAllDay, false);
  assert.equal(parsed.reminder, '0');
  assert.ok(parsed.dueDate);
  const due = new Date(parsed.dueDate!);
  assert.equal(due.getHours(), 20);
});
