export async function startQuarkWebLoginFlow(openWindow: typeof window.open, fetchImpl: typeof fetch, basePath = '') {
  const loginUrl = `${basePath}/proxy/quark-auth/`
  const popup = openWindow(loginUrl, '_blank', 'noopener,noreferrer')

  if (!popup) {
    throw new Error('浏览器拦截了夸克登录弹窗，请允许弹窗后再试一次')
  }

  try {
    await fetchImpl(`${basePath}/api/system/netdisk/quark-auth/reset`, { method: 'POST' })
  } catch (error) {
    popup.close()
    throw error
  }

  return popup
}
