import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildSearchKeywords, cleanupTrackTitle, inferTitleArtistFromFilename } from '../src/utils/musicCache';
import { buildTrackSearchKeywords, scoreSearchMatch } from '../src/utils/musicMatching';

test('cleanupTrackTitle strips noisy suffixes', () => {
  assert.equal(cleanupTrackTitle('我到外地去看你（无损）'), '我到外地去看你');
  assert.equal(cleanupTrackTitle('再一次再见 (Live)'), '再一次再见');
});

test('inferTitleArtistFromFilename extracts title and artist', () => {
  assert.deepEqual(
    inferTitleArtistFromFilename('/music/我说今晚月光那么美,你说是的 - 好妹妹乐队.mp3'),
    { title: '我说今晚月光那么美,你说是的', artist: '好妹妹乐队' }
  );
});

test('buildSearchKeywords prioritizes cleaned title forms', () => {
  const keywords = buildSearchKeywords('我到外地去看你（无损）', '好妹妹乐队');
  assert.equal(keywords[0], '我到外地去看你 好妹妹乐队');
  assert.ok(keywords.includes('我到外地去看你（无损） 好妹妹乐队'));
});

test('buildTrackSearchKeywords falls back to filename artist', () => {
  const keywords = buildTrackSearchKeywords({
    path: '/music/送情郎 - 岳云鹏.flac',
    name: '送情郎 - 岳云鹏',
    artist: 'Unknown Artist'
  });
  assert.ok(keywords.includes('送情郎 岳云鹏'));
});

test('scoreSearchMatch prefers exact title and artist matches', () => {
  const exact = scoreSearchMatch(
    { path: '/music/送情郎 - 岳云鹏.flac', name: '送情郎 - 岳云鹏', artist: 'Unknown Artist' },
    { name: '送情郎', ar: [{ name: '岳云鹏' }] }
  );
  const partial = scoreSearchMatch(
    { path: '/music/送情郎 - 岳云鹏.flac', name: '送情郎 - 岳云鹏', artist: 'Unknown Artist' },
    { name: '送情', ar: [{ name: '未知' }] }
  );
  assert.ok(exact > partial);
});

test('upsertNeteaseTrackCache keeps all entries under concurrent writes', async () => {
  const originalHome = process.env.HOME;
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'clawos-cache-test-'));
  process.env.HOME = tempHome;

  try {
    const musicCacheModule = await import(`../src/utils/musicCache?ts=${Date.now()}`);

    await Promise.all(
      Array.from({ length: 25 }, (_, index) => musicCacheModule.upsertNeteaseTrackCache({
        neteaseId: String(1000 + index),
        title: `歌曲${index}`,
        artist: `歌手${index}`,
        album: `专辑${index}`,
        aliases: [`别名${index}`]
      }))
    );

    const entries = await musicCacheModule.loadNeteaseTrackCache();
    assert.equal(entries.length, 25);
    assert.equal(new Set(entries.map((entry: { neteaseId: string }) => entry.neteaseId)).size, 25);
  } finally {
    process.env.HOME = originalHome;
  }
});
