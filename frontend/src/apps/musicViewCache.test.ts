import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getCachedSongsForView,
  hasCachedMusicContent,
  makePlaylistViewKey,
  makeSearchViewKey,
  pickPlaylistToRefresh,
  readMusicViewCache,
  setCachedSongsForView,
  writeMusicViewCache,
  type MusicViewCacheSnapshot,
} from './musicViewCache'

class MemoryStorage {
  private values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

function createSnapshot(): Omit<MusicViewCacheSnapshot, 'updatedAt'> {
  return {
    keyword: '周杰伦',
    activeTab: 'playlist-1',
    activeViewKey: makePlaylistViewKey('playlist-1'),
    songsByView: {
      [makePlaylistViewKey('playlist-1')]: [{ id: '1', title: '稻香', artist: '周杰伦', album: '魔杰座', duration: '03:43' }],
      [makeSearchViewKey('周杰伦')]: [{ id: '2', title: '晴天', artist: '周杰伦', album: '叶惠美', duration: '04:29' }],
      [makeSearchViewKey('林俊杰')]: [{ id: '3', title: '曹操', artist: '林俊杰', album: '曹操', duration: '04:12' }],
    },
    playlists: [{ id: 'playlist-1', name: '我喜欢的音乐', creator: { userId: 1 } }],
    userInfo: { userId: 1, nickname: 'Chris', avatarUrl: 'avatar.png' },
  }
}

test('readMusicViewCache restores per-tab snapshot', () => {
  const storage = new MemoryStorage()
  writeMusicViewCache(createSnapshot(), storage)

  const result = readMusicViewCache(storage)

  assert.ok(result)
  assert.equal(result?.keyword, '周杰伦')
  assert.equal(result?.activeTab, 'playlist-1')
  assert.equal(result?.activeViewKey, makePlaylistViewKey('playlist-1'))
  assert.equal(result?.songsByView[makePlaylistViewKey('playlist-1')]?.length, 1)
  assert.equal(result?.songsByView[makeSearchViewKey('周杰伦')]?.length, 1)
  assert.equal(result?.playlists.length, 1)
  assert.equal(result?.userInfo?.nickname, 'Chris')
  assert.ok((result?.updatedAt ?? 0) > 0)
})

test('getCachedSongsForView returns isolated content per page', () => {
  const snapshot: MusicViewCacheSnapshot = {
    ...createSnapshot(),
    updatedAt: 1,
  }

  assert.equal(getCachedSongsForView(snapshot, makePlaylistViewKey('playlist-1'))[0]?.title, '稻香')
  assert.equal(getCachedSongsForView(snapshot, makeSearchViewKey('周杰伦'))[0]?.title, '晴天')
  assert.equal(getCachedSongsForView(snapshot, makeSearchViewKey('林俊杰'))[0]?.title, '曹操')
  assert.deepEqual(getCachedSongsForView(snapshot, makePlaylistViewKey('playlist-404')), [])
})

test('setCachedSongsForView updates only target page cache', () => {
  const result = setCachedSongsForView({ [makeSearchViewKey('A')]: [{ id: '1', title: 'A', artist: 'B', album: 'C', duration: '01:00' }] }, makePlaylistViewKey('playlist-2'), [{ id: '2', title: 'D', artist: 'E', album: 'F', duration: '02:00' }])

  assert.equal(result[makeSearchViewKey('A')]?.length, 1)
  assert.equal(result[makePlaylistViewKey('playlist-2')]?.[0]?.title, 'D')
})

test('makeSearchViewKey isolates different keywords', () => {
  assert.notEqual(makeSearchViewKey('周杰伦'), makeSearchViewKey('林俊杰'))
  assert.equal(makeSearchViewKey(' 周杰伦 '), makeSearchViewKey('周杰伦'))
})

test('pickPlaylistToRefresh prefers active playlist when available', () => {
  assert.equal(pickPlaylistToRefresh('playlist-2', [{ id: 'playlist-1' }, { id: 'playlist-2' }]), 'playlist-2')
  assert.equal(pickPlaylistToRefresh('missing', [{ id: 'playlist-1' }]), 'playlist-1')
  assert.equal(pickPlaylistToRefresh('search', [{ id: 'playlist-1' }]), null)
})

test('hasCachedMusicContent detects visible cache payload', () => {
  assert.equal(hasCachedMusicContent(null), false)
  assert.equal(hasCachedMusicContent({ ...createSnapshot(), songsByView: {}, playlists: [], userInfo: null, updatedAt: 0 }), false)
  assert.equal(hasCachedMusicContent({ ...createSnapshot(), updatedAt: 1 }), true)
})
