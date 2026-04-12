export const NON_TRADING_REFRESH_INTERVAL_MS = 60_000
export const TRADING_REFRESH_INTERVAL_MS = 30_000

const MARKET_BOUNDARIES = [
  { hour: 9, minute: 15 },
  { hour: 9, minute: 25 },
  { hour: 9, minute: 30 },
  { hour: 11, minute: 30 },
  { hour: 13, minute: 0 },
  { hour: 14, minute: 57 },
  { hour: 15, minute: 0 },
  { hour: 15, minute: 5 },
  { hour: 16, minute: 0 },
] as const

export function getAutoRefreshIntervalMs(canTrade: boolean): number {
  return canTrade ? TRADING_REFRESH_INTERVAL_MS : NON_TRADING_REFRESH_INTERVAL_MS
}

export function getMsUntilNextMarketBoundary(now: Date): number {
  const currentTime = now.getTime()
  const boundaryCandidates = [0, 1].flatMap((dayOffset) =>
    MARKET_BOUNDARIES.map(({ hour, minute }) => new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + dayOffset,
      hour,
      minute,
      0,
      0,
    )),
  )
  const nextBoundary = boundaryCandidates.find((candidate) => candidate.getTime() > currentTime)
  if (!nextBoundary) {
    return NON_TRADING_REFRESH_INTERVAL_MS
  }
  return Math.max(1_000, nextBoundary.getTime() - currentTime)
}
