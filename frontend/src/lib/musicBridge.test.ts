import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clearMusicState,
  getMusicDisplayState,
  registerMusicCommandHandler,
  reportMusicState,
  resetMusicBridgeForTests,
  sendMusicCommandToActive,
  subscribeMusicDisplayState
} from './musicBridge'

test.beforeEach(() => {
  resetMusicBridgeForTests()
})

test('returns latest snapshot for display after late subscription', () => {
  reportMusicState({
    appId: 'music',
    status: 'playing',
    playing: true,
    title: '夜曲',
    artist: '周杰伦',
    cover: 'cover-a',
    lyric: '一群嗜血的蚂蚁'
  })

  const current = getMusicDisplayState()
  assert.equal(current?.appId, 'music')
  assert.equal(current?.title, '夜曲')
})

test('notifies listeners when state changes', () => {
  let notifyCount = 0
  const unsubscribe = subscribeMusicDisplayState(() => {
    notifyCount += 1
  })

  reportMusicState({
    appId: 'music',
    status: 'preparing',
    playing: false,
    title: '稻香',
    artist: '周杰伦',
    cover: '',
    lyric: ''
  })

  unsubscribe()
  assert.equal(notifyCount, 1)
})

test('latest audible source wins and pauses previous owner', () => {
  const commands: string[] = []

  registerMusicCommandHandler('music', (command) => {
    commands.push(`music:${command}`)
  })
  registerMusicCommandHandler('localmusic', (command) => {
    commands.push(`localmusic:${command}`)
  })

  reportMusicState({
    appId: 'music',
    status: 'playing',
    playing: true,
    title: '歌 A',
    artist: '歌手 A',
    cover: '',
    lyric: ''
  })

  reportMusicState({
    appId: 'localmusic',
    status: 'preparing',
    playing: false,
    title: '歌 B',
    artist: '歌手 B',
    cover: '',
    lyric: ''
  })

  const current = getMusicDisplayState()
  assert.equal(current?.appId, 'localmusic')
  assert.deepEqual(commands, ['music:pause'])
})

test('active commands target the current owner', () => {
  const commands: string[] = []

  registerMusicCommandHandler('music', (command) => {
    commands.push(`music:${command}`)
  })

  reportMusicState({
    appId: 'music',
    status: 'playing',
    playing: true,
    title: '歌 C',
    artist: '歌手 C',
    cover: '',
    lyric: ''
  })

  sendMusicCommandToActive('toggle')
  assert.deepEqual(commands, ['music:toggle'])
})

test('clearing active source falls back to another displayable snapshot', () => {
  reportMusicState({
    appId: 'music',
    status: 'paused',
    playing: false,
    title: '歌 D',
    artist: '歌手 D',
    cover: '',
    lyric: ''
  })

  reportMusicState({
    appId: 'localmusic',
    status: 'paused',
    playing: false,
    title: '歌 E',
    artist: '歌手 E',
    cover: '',
    lyric: ''
  })

  clearMusicState('localmusic')

  const current = getMusicDisplayState()
  assert.equal(current?.appId, 'music')
  assert.equal(current?.title, '歌 D')
})
