export type NetdiskBrand = 'baidu' | 'quark'

export type NetdiskGuideStatus = 'mounted' | 'not_mounted' | 'auth_failed' | 'auth_expired' | 'alist_unreachable' | 'alist_error'

export interface NetdiskGuideData {
  title: string
  targetPath: string
  storageTypeLabel: string
  officialSiteUrl: string
  credentialLabel: string
  credentialField: 'refreshToken' | 'cookie'
  setupSteps: string[]
  cookieGuide: {
    recommended: string[]
    manual: string[]
    notes: string[]
  }
  troubleshooting: Record<Exclude<NetdiskGuideStatus, 'mounted'>, string>
}

export function getNetdiskGuideData(brand: NetdiskBrand): NetdiskGuideData {
  const title = brand === 'baidu' ? '百度网盘' : '夸克网盘'
  const targetPath = brand === 'baidu' ? '/baidu' : '/quark'
  const storageTypeLabel = title
  const officialSiteUrl = brand === 'baidu' ? 'https://pan.baidu.com/' : 'https://pan.quark.cn/'

  return {
    title,
    targetPath,
    storageTypeLabel,
    officialSiteUrl,
    credentialLabel: brand === 'baidu' ? 'refresh_token' : 'cookie',
    credentialField: brand === 'baidu' ? 'refreshToken' : 'cookie',
    setupSteps: [
      '登录 AList 后台。',
      '进入“存储”页面，点击“新增存储”。',
      `存储类型选择“${storageTypeLabel}”。`,
      `挂载路径填写“${targetPath}”。`,
      `${title} 所需的 Cookie 或授权信息按 AList 提示填写。`,
      '先不要管高级选项，能成功保存即可。',
      '回到 ClawOS 点击“我已完成，重新检测”。'
    ],
    cookieGuide: {
      recommended: [
        `先在浏览器里打开 ${officialSiteUrl} 并确认已经成功登录 ${title}。`,
        '推荐安装浏览器扩展 Cookie-Editor，安装后刷新网盘页面。',
        '在当前网盘站点点开 Cookie-Editor，直接复制当前站点的 Cookie 内容。',
        '把复制出来的 Cookie 按 AList 页面要求粘贴进去保存。'
      ],
      manual: [
        `打开 ${officialSiteUrl} 并保持登录状态。`,
        '按 F12 打开开发者工具。',
        '切到“网络(Network)”页，刷新一次网页。',
        '随便点开一个请求，在“请求头(Request Headers)”里找到 Cookie。',
        '复制整段 Cookie 内容，粘贴到 AList 对应字段中。'
      ],
      notes: [
        'Cookie 只需要从你已经登录成功的浏览器里复制，不需要另外注册新账号。',
        '如果后面突然失效，通常是网盘登录状态过期了，重新登录官网再复制一次即可。',
        '先只追求“能成功保存并看到文件”，其他高级字段可以后面再调。'
      ]
    },
    troubleshooting: {
      not_mounted: `说明 ${title} 存储还没成功挂到 ${targetPath}。优先检查“存储类型”和“挂载路径”有没有填对。`,
      auth_failed: 'AList 后台自动登录失败。先确认 AList 服务在运行，再确认后台管理员密码是否仍是当前页面显示的默认值。',
      auth_expired: 'AList 登录状态已失效。重新打开一次底层挂载后台，确认能正常登录后，再回来点“重新检测”。',
      alist_unreachable: 'ClawOS 当前连不到 AList 服务。先检查 AList 服务是否启动，以及 5244 端口是否正常监听。',
      alist_error: 'AList 返回了错误。优先检查授权信息是否过期、Cookie 是否完整，以及挂载路径是否和当前页面要求一致。'
    }
  }
}
