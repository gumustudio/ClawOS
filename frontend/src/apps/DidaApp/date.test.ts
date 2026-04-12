import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeDidaDateForJs, parseTaskDate, toDidaApiDate } from './date';

test('normalizeDidaDateForJs converts +0000 to +00:00', () => {
  const value = '2026-04-09T08:00:00.000+0000';
  assert.equal(normalizeDidaDateForJs(value), '2026-04-09T08:00:00.000+00:00');
});

test('parseTaskDate parses dida timezone format', () => {
  const value = '2026-04-09T08:00:00.000+0000';
  const date = parseTaskDate(value);
  assert.ok(date);
  assert.equal(Number.isNaN(date!.getTime()), false);
});

test('toDidaApiDate converts zulu to dida format', () => {
  const value = '2026-04-09T08:00:00.000Z';
  assert.equal(toDidaApiDate(value), '2026-04-09T08:00:00.000+0000');
});
