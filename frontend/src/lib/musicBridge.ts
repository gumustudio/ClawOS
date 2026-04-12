export type MusicAppId = 'music' | 'localmusic'

export type MusicPlaybackStatus = 'idle' | 'preparing' | 'playing' | 'paused' | 'error'

export type MusicCommand = 'toggle' | 'pause' | 'next' | 'prev'

export interface MusicBridgeSnapshot {
  appId: MusicAppId
  status: MusicPlaybackStatus
  playing: boolean
  title: string
  artist: string
  cover: string
  lyric: string
  updatedAt: number
}

type SnapshotMap = Partial<Record<MusicAppId, MusicBridgeSnapshot>>
type BridgeListener = () => void
type CommandHandler = (command: MusicCommand) => void

interface MusicBridgeState {
  activeAppId: MusicAppId | null
  snapshots: SnapshotMap
}

const bridgeState: MusicBridgeState = {
  activeAppId: null,
  snapshots: {}
}

const bridgeListeners = new Set<BridgeListener>()
const commandHandlers = new Map<MusicAppId, CommandHandler>()
let lastReportedAt = 0

const isAudibleStatus = (status: MusicPlaybackStatus) => status === 'preparing' || status === 'playing'
const isDisplayableStatus = (status: MusicPlaybackStatus) => status !== 'idle'

const getSnapshotsByPriority = (filter: (snapshot: MusicBridgeSnapshot) => boolean) => {
  return Object.values(bridgeState.snapshots)
    .filter((snapshot): snapshot is MusicBridgeSnapshot => Boolean(snapshot) && filter(snapshot))
    .sort((left, right) => right.updatedAt - left.updatedAt)
}

const notifyBridgeListeners = () => {
  bridgeListeners.forEach((listener) => listener())
}

const reconcileActiveAppId = () => {
  const activeSnapshot = bridgeState.activeAppId ? bridgeState.snapshots[bridgeState.activeAppId] : null
  const latestAudible = getSnapshotsByPriority((snapshot) => isAudibleStatus(snapshot.status))[0] || null

  if (latestAudible) {
    bridgeState.activeAppId = latestAudible.appId
    return
  }

  if (activeSnapshot && isDisplayableStatus(activeSnapshot.status)) {
    bridgeState.activeAppId = activeSnapshot.appId
    return
  }

  const latestDisplayable = getSnapshotsByPriority((snapshot) => isDisplayableStatus(snapshot.status))[0] || null
  bridgeState.activeAppId = latestDisplayable?.appId || null
}

const maybePausePreviousOwner = (nextSnapshot: MusicBridgeSnapshot) => {
  if (!isAudibleStatus(nextSnapshot.status)) {
    return
  }

  const previousOwnerId = bridgeState.activeAppId
  if (!previousOwnerId || previousOwnerId === nextSnapshot.appId) {
    return
  }

  const previousSnapshot = bridgeState.snapshots[previousOwnerId]
  if (!previousSnapshot || !isAudibleStatus(previousSnapshot.status)) {
    return
  }

  const pausePreviousOwner = commandHandlers.get(previousOwnerId)
  if (pausePreviousOwner) {
    pausePreviousOwner('pause')
  }
}

export const reportMusicState = (snapshot: Omit<MusicBridgeSnapshot, 'updatedAt'> & { updatedAt?: number }) => {
  const nextUpdatedAt = snapshot.updatedAt || Math.max(Date.now(), lastReportedAt + 1)
  lastReportedAt = nextUpdatedAt

  const normalizedSnapshot: MusicBridgeSnapshot = {
    ...snapshot,
    title: snapshot.title || '未知歌名',
    artist: snapshot.artist || '未知歌手',
    cover: snapshot.cover || '',
    lyric: snapshot.lyric || '',
    playing: snapshot.status === 'playing',
    updatedAt: nextUpdatedAt
  }

  maybePausePreviousOwner(normalizedSnapshot)
  bridgeState.snapshots[normalizedSnapshot.appId] = normalizedSnapshot
  reconcileActiveAppId()
  notifyBridgeListeners()
}

export const clearMusicState = (appId: MusicAppId) => {
  delete bridgeState.snapshots[appId]
  reconcileActiveAppId()
  notifyBridgeListeners()
}

export const getMusicDisplayState = (): MusicBridgeSnapshot | null => {
  if (!bridgeState.activeAppId) {
    return null
  }

  return bridgeState.snapshots[bridgeState.activeAppId] || null
}

export const subscribeMusicDisplayState = (listener: BridgeListener) => {
  bridgeListeners.add(listener)
  return () => {
    bridgeListeners.delete(listener)
  }
}

export const registerMusicCommandHandler = (appId: MusicAppId, handler: CommandHandler) => {
  commandHandlers.set(appId, handler)
  return () => {
    const currentHandler = commandHandlers.get(appId)
    if (currentHandler === handler) {
      commandHandlers.delete(appId)
    }
  }
}

export const sendMusicCommand = (appId: MusicAppId, command: MusicCommand) => {
  const handler = commandHandlers.get(appId)
  if (handler) {
    handler(command)
  }
}

export const sendMusicCommandToActive = (command: MusicCommand) => {
  const activeSnapshot = getMusicDisplayState()
  if (activeSnapshot) {
    sendMusicCommand(activeSnapshot.appId, command)
  }
}

export const resetMusicBridgeForTests = () => {
  bridgeState.activeAppId = null
  bridgeState.snapshots = {}
  bridgeListeners.clear()
  commandHandlers.clear()
  lastReportedAt = 0
}
