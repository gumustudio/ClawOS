export interface LyricLine {
  time: number
  text: string
}

export const parseLrc = (lrcStr: string): LyricLine[] => {
  const lines = lrcStr.split('\n')
  const result: LyricLine[] = []
  const timeReg = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g
  for (const line of lines) {
    const matches = Array.from(line.matchAll(timeReg))
    if (matches.length > 0) {
      const text = line.replace(timeReg, '').trim()
      if (text) {
        for (const match of matches) {
          const min = parseInt(match[1])
          const sec = parseInt(match[2])
          const ms = match[3] ? parseInt(match[3]) : 0
          const time = min * 60 + sec + (match[3] ? (match[3].length === 2 ? ms * 10 : ms) / 1000 : 0)
          result.push({ time, text })
        }
      }
    }
  }
  return result.sort((a, b) => a.time - b.time)
}
