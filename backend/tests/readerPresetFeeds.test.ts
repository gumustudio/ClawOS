import test from 'node:test';
import assert from 'node:assert/strict';

import { READER_PRESET_FEEDS } from '../src/services/reader/presets';

test('reader preset feeds include expanded Chinese sources by category', () => {
  const byId = new Map(READER_PRESET_FEEDS.map((feed) => [feed.id, feed]));

  assert.equal(READER_PRESET_FEEDS.length, 21);
  assert.equal(byId.get('preset-ftchinese')?.category, '财经');
  assert.equal(byId.get('preset-deepmind-blog')?.category, 'AI');
  assert.equal(byId.get('preset-marketwatch-topstories')?.category, '财经');
  assert.equal(byId.get('preset-nytimes-cn')?.category, '新闻');
  assert.equal(byId.get('preset-rfi-cn')?.category, '新闻');
  assert.equal(byId.get('preset-youxichaguan')?.category, '游戏');
  assert.equal(byId.get('preset-youxituoluo')?.category, '游戏');
});
