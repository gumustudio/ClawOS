export interface CachedSongItem {
  id: string
  title: string
  artist: string
  album: string
  duration: string
  cover?: string
}

export interface CachedPlaylistItem {
  id: string
  name: string
  creator: {
    userId: number
  }
}

export interface CachedUserProfile {
  userId: number
  nickname: string
  avatarUrl: string
}

export interface MusicViewCacheSnapshot {
  keyword: string
  activeTab: string
  activeViewKey: string
  songsByView: Record<string, CachedSongItem[]>
  viewUpdatedAt: Record<string, number>
  recentSearches: string[]
  recentViewKeys: string[]
  playlists: CachedPlaylistItem[]
  userInfo: CachedUserProfile | null
  updatedAt: number
}

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export const MUSIC_VIEW_CACHE_KEY = 'clawos.music.view-cache.v3'
export const MUSIC_VIEW_STALE_MS = 3 * 60 * 1000

function getDefaultStorage(): StorageLike | null {
  if (typeof window === 'undefined') {
    return null
  }
  return window.localStorage
}

function isSongArray(value: unknown): value is CachedSongItem[] {
  return Array.isArray(value)
}

function normalizeSongsByView(value: unknown): Record<string, CachedSongItem[]> {
  if (!value || typeof value !== 'object') {
    return {}
  }

  const entries = Object.entries(value as Record<string, unknown>)
  return Object.fromEntries(entries.filter(([, songs]) => isSongArray(songs))) as Record<string, CachedSongItem[]>
}

function normalizeNumberMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(([, timestamp]) => typeof timestamp === 'number'),
  ) as Record<string, number>
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((item): item is string => typeof item === 'string')
}

export function readMusicViewCache(storage: StorageLike | null = getDefaultStorage()): MusicViewCacheSnapshot | null {
  if (!storage) {
    return null
  }

  try {
    const raw = storage.getItem(MUSIC_VIEW_CACHE_KEY)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as Partial<MusicViewCacheSnapshot>
    if (!parsed || typeof parsed !== 'object') {
      return null
    }

    return {
      keyword: typeof parsed.keyword === 'string' ? parsed.keyword : '',
      activeTab: typeof parsed.activeTab === 'string' ? parsed.activeTab : 'search',
      activeViewKey: typeof parsed.activeViewKey === 'string' ? parsed.activeViewKey : 'search:',
      songsByView: normalizeSongsByView(parsed.songsByView),
      viewUpdatedAt: normalizeNumberMap(parsed.viewUpdatedAt),
      recentSearches: normalizeStringArray(parsed.recentSearches),
      recentViewKeys: normalizeStringArray(parsed.recentViewKeys),
      playlists: Array.isArray(parsed.playlists) ? parsed.playlists as CachedPlaylistItem[] : [],
      userInfo: parsed.userInfo && typeof parsed.userInfo === 'object' ? parsed.userInfo as CachedUserProfile : null,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
    }
  } catch {
    return null
  }
}

export function writeMusicViewCache(snapshot: Omit<MusicViewCacheSnapshot, 'updatedAt'>, storage: StorageLike | null = getDefaultStorage()): void {
  if (!storage) {
    return
  }

  const payload: MusicViewCacheSnapshot = {
    ...snapshot,
    updatedAt: Date.now(),
  }

  storage.setItem(MUSIC_VIEW_CACHE_KEY, JSON.stringify(payload))
}

export function makePlaylistViewKey(playlistId: string): string {
  return `playlist:${playlistId}`
}

export function makeSearchViewKey(keyword: string): string {
  return `search:${keyword.trim().toLowerCase()}`
}

export function getCachedSongsForView(snapshot: MusicViewCacheSnapshot | null, viewKey: string): CachedSongItem[] {
  if (!snapshot) {
    return []
  }

  return snapshot.songsByView[viewKey] ?? []
}

export function setCachedSongsForView(songsByView: Record<string, CachedSongItem[]>, viewKey: string, songs: CachedSongItem[]): Record<string, CachedSongItem[]> {
  return {
    ...songsByView,
    [viewKey]: songs,
  }
}

export function setViewUpdatedAt(viewUpdatedAt: Record<string, number>, viewKey: string, timestamp = Date.now()): Record<string, number> {
  return {
    ...viewUpdatedAt,
    [viewKey]: timestamp,
  }
}

export function touchRecentValues(values: string[], nextValue: string, limit = 8): string[] {
  if (!nextValue.trim()) {
    return values
  }

  return [nextValue, ...values.filter((value) => value !== nextValue)].slice(0, limit)
}

export function isMusicViewStale(snapshot: MusicViewCacheSnapshot | null, viewKey: string, now = Date.now(), staleMs = MUSIC_VIEW_STALE_MS): boolean {
  if (!snapshot) {
    return true
  }

  const updatedAt = snapshot.viewUpdatedAt[viewKey]
  if (!updatedAt) {
    return true
  }

  return now - updatedAt > staleMs
}

export function pickPlaylistToRefresh(activeTab: string, playlists: Array<{ id: string }>): string | null {
  if (activeTab === 'search') {
    return null
  }

  if (playlists.some((playlist) => playlist.id === activeTab)) {
    return activeTab
  }

  return playlists[0]?.id ?? null
}

export function hasCachedMusicContent(snapshot: MusicViewCacheSnapshot | null): boolean {
  if (!snapshot) {
    return false
  }

  const hasSongs = Object.values(snapshot.songsByView).some((songs) => songs.length > 0)
  return Boolean(hasSongs || snapshot.playlists.length || snapshot.userInfo)
}
