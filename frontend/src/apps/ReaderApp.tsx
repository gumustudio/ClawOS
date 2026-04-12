import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownTrayIcon,
  BookmarkIcon,
  BookmarkSlashIcon,
  FolderOpenIcon,
  PlusIcon,
  SparklesIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'

import { ReaderIcon } from '../components/Icons'
import { fetchServerPaths } from '../lib/serverPaths'
import { withBasePath } from '../lib/basePath'
import {
  createReaderFeed,
  clearReaderRuntimeData,
  deleteReaderFeed,
  fetchReaderArticles,
  fetchReaderDailyBrief,
  fetchReaderFeeds,
  fetchReaderOverview,
  markReaderArticleRead,
  pullReaderSubscriptions,
  refreshReaderLocalInbox,
  saveReaderArticle,
  summarizeReaderArticle,
  translateReaderArticle,
} from './Reader/api'
import { formatReaderDate, importanceStars } from './Reader/format'
import type { ReaderArticle, ReaderCategory, ReaderFeed, ReaderOverview, ReaderView } from './Reader/types'

const CATEGORIES: ReaderCategory[] = ['AI', '科技', '财经', '新闻', '游戏']

type ToastState = { tone: 'success' | 'error' | 'info'; message: string } | null

type FeedDialogState = {
  name: string
  url: string
  category: ReaderCategory
}

export default function ReaderApp() {
  const [overview, setOverview] = useState<ReaderOverview | null>(null)
  const [feeds, setFeeds] = useState<ReaderFeed[]>([])
  const [activeView, setActiveView] = useState<ReaderView>('brief')
  const [activeCategory, setActiveCategory] = useState<ReaderCategory>('AI')
  const [articles, setArticles] = useState<ReaderArticle[]>([])
  const [activeArticle, setActiveArticle] = useState<ReaderArticle | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingArticles, setLoadingArticles] = useState(false)
  const [loadingMoreArticles, setLoadingMoreArticles] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [pullingSubscriptions, setPullingSubscriptions] = useState(false)
  const [showFeedDialog, setShowFeedDialog] = useState(false)
  const [feedDialog, setFeedDialog] = useState<FeedDialogState>({ name: '', url: '', category: 'AI' })
  const [deleteFeedId, setDeleteFeedId] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState>(null)
  const [readerDir, setReaderDir] = useState('')
  const [translatingArticleId, setTranslatingArticleId] = useState<string | null>(null)
  const [summarizingArticleId, setSummarizingArticleId] = useState<string | null>(null)
  const [articleOffset, setArticleOffset] = useState(0)
  const [hasMoreArticles, setHasMoreArticles] = useState(false)
  const [showClearDialog, setShowClearDialog] = useState(false)

  const PAGE_SIZE = 30

  useEffect(() => {
    void loadOverview()
    void fetchServerPaths().then((paths) => setReaderDir(paths.readerDir)).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!toast) {
      return
    }
    const timer = window.setTimeout(() => setToast(null), 2500)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    void loadViewArticles(activeView, activeCategory)
  }, [activeView, activeCategory])

  useEffect(() => {
    setArticleOffset(0)
  }, [activeView, activeCategory])

  const currentSection = useMemo(() => {
    return overview?.brief.sections.find((section) => section.category === activeCategory) || null
  }, [overview, activeCategory])

  const openClawCount = useMemo(() => overview?.latestArticles.filter((article) => article.sourceType === 'openclaw').length ?? 0, [overview])

  async function loadOverview() {
    setLoading(true)
    try {
      const [overviewData, feedData] = await Promise.all([fetchReaderOverview(), fetchReaderFeeds()])
      setOverview(overviewData)
      setFeeds(feedData)
      setReaderDir(overviewData.readerDir)
      if (!activeArticle && overviewData.brief.sections[0]?.highlights[0]) {
        setActiveArticle(overviewData.brief.sections[0].highlights[0])
      }
    } catch (error) {
      console.error('Failed to load reader overview', error)
      setToast({ tone: 'error', message: error instanceof Error ? error.message : '加载每日简报失败' })
    } finally {
      setLoading(false)
    }
  }

  async function loadViewArticles(view: ReaderView, category: ReaderCategory, nextOffset = 0, append = false) {
    if (append) {
      setLoadingMoreArticles(true)
    } else {
      setLoadingArticles(true)
    }
    try {
      if (view === 'brief') {
        const brief = await fetchReaderDailyBrief()
        const dayArticles = await fetchReaderArticles({ date: brief.date, limit: PAGE_SIZE, offset: nextOffset })
        const first = dayArticles[0] || null
        setOverview((current) => (current ? { ...current, brief, categories: brief.sections } : current))
        setArticles((current) => (append ? [...current, ...dayArticles] : dayArticles))
        setHasMoreArticles(nextOffset + dayArticles.length < brief.total)
        setArticleOffset(nextOffset + dayArticles.length)
        setActiveArticle((current) => {
          if (current) {
            const targetPool = append ? [...articles, ...dayArticles] : dayArticles
            const matched = targetPool.find((article) => article.id === current.id)
            return matched || current
          }
          return first
        })
        return
      }

      if (view === 'saved') {
        const nextArticles = await fetchReaderArticles({ saved: true, limit: 50, offset: nextOffset })
        setArticles(nextArticles)
        setHasMoreArticles(false)
        setActiveArticle((current) => nextArticles.find((article) => article.id === current?.id) || nextArticles[0] || null)
        return
      }

      if (view === 'openclaw') {
        const nextArticles = await fetchReaderArticles({ source: 'openclaw', limit: 50, offset: nextOffset })
        setArticles(nextArticles)
        setHasMoreArticles(false)
        setActiveArticle((current) => nextArticles.find((article) => article.id === current?.id) || nextArticles[0] || null)
        return
      }

      if (view === 'feeds') {
        const nextArticles = await fetchReaderArticles({ limit: 50, offset: nextOffset })
        setArticles(nextArticles)
        setHasMoreArticles(false)
        setActiveArticle((current) => nextArticles.find((article) => article.id === current?.id) || nextArticles[0] || null)
        return
      }

      const nextArticles = await fetchReaderArticles({ category, limit: 50, offset: nextOffset })
      setArticles(nextArticles)
      setHasMoreArticles(false)
      setActiveArticle((current) => nextArticles.find((article) => article.id === current?.id) || nextArticles[0] || null)
    } catch (error) {
      console.error('Failed to load reader articles', error)
      setToast({ tone: 'error', message: error instanceof Error ? error.message : '加载资讯失败' })
    } finally {
      if (append) {
        setLoadingMoreArticles(false)
      } else {
        setLoadingArticles(false)
      }
    }
  }

  async function loadMoreBriefArticles() {
    if (loadingArticles || loadingMoreArticles || activeView !== 'brief' || !hasMoreArticles || !overview) {
      return
    }

    await loadViewArticles('brief', activeCategory, articleOffset, true)
  }

  async function handleRefresh() {
    setRefreshing(true)
    try {
      const result = await refreshReaderLocalInbox()
      await loadOverview()
      await loadViewArticles(activeView, activeCategory)
      setToast({ tone: 'success', message: `已刷新本地资讯，导入 ${result.importedArticleCount} 条，处理 ${result.processedInboxCount} 个投递文件` })
    } catch (error) {
      console.error('Failed to refresh reader inbox', error)
      setToast({ tone: 'error', message: error instanceof Error ? error.message : '刷新本地资讯失败' })
    } finally {
      setRefreshing(false)
    }
  }

  async function handlePullSubscriptions() {
    setPullingSubscriptions(true)
    try {
      const result = await pullReaderSubscriptions()
      await loadOverview()
      await loadViewArticles(activeView, activeCategory)
      setToast({ tone: 'success', message: `已拉取最新订阅，新增 ${result.importedArticleCount} 条` })
    } catch (error) {
      console.error('Failed to pull reader subscriptions', error)
      setToast({ tone: 'error', message: error instanceof Error ? error.message : '拉取订阅失败' })
    } finally {
      setPullingSubscriptions(false)
    }
  }

  async function handleCreateFeed() {
    if (!feedDialog.url.trim()) {
      setToast({ tone: 'error', message: 'RSS 地址不能为空' })
      return
    }

    try {
      await createReaderFeed(feedDialog)
      setShowFeedDialog(false)
      setFeedDialog({ name: '', url: '', category: 'AI' })
      await loadOverview()
      setToast({ tone: 'success', message: '订阅源已添加' })
    } catch (error) {
      console.error('Failed to create feed', error)
      setToast({ tone: 'error', message: error instanceof Error ? error.message : '添加订阅源失败' })
    }
  }

  async function handleDeleteFeed() {
    if (!deleteFeedId) {
      return
    }

    try {
      await deleteReaderFeed(deleteFeedId)
      setDeleteFeedId(null)
      await loadOverview()
      setToast({ tone: 'success', message: '订阅源已删除' })
    } catch (error) {
      console.error('Failed to delete feed', error)
      setToast({ tone: 'error', message: error instanceof Error ? error.message : '删除订阅源失败' })
    }
  }

  async function toggleSaved(article: ReaderArticle) {
    try {
      const updated = await saveReaderArticle(article.id, !article.savedAt)
      setActiveArticle(updated)
      setArticles((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      await loadOverview()
      setToast({ tone: 'success', message: updated.savedAt ? '已加入稍后阅读' : '已移出稍后阅读' })
    } catch (error) {
      console.error('Failed to save article', error)
      setToast({ tone: 'error', message: error instanceof Error ? error.message : '保存失败' })
    }
  }

  async function markRead(article: ReaderArticle) {
    if (article.isRead) {
      return
    }

    try {
      const updated = await markReaderArticleRead(article.id, true)
      setActiveArticle(updated)
      setArticles((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      setOverview((current) => {
        if (!current) {
          return current
        }
        return {
          ...current,
          stats: {
            ...current.stats,
            unreadArticles: Math.max(0, current.stats.unreadArticles - 1),
          },
          brief: {
            ...current.brief,
            sections: current.brief.sections.map((section) => ({
              ...section,
              unread: section.highlights.some((item) => item.id === updated.id) ? Math.max(0, section.unread - 1) : section.unread,
              highlights: section.highlights.map((item) => (item.id === updated.id ? updated : item)),
              latest: section.latest.map((item) => (item.id === updated.id ? updated : item)),
            })),
          },
        }
      })
    } catch (error) {
      console.error('Failed to mark article read', error)
    }
  }

  async function handleTranslateArticle(article: ReaderArticle) {
    setTranslatingArticleId(article.id)
    try {
      const updated = await translateReaderArticle(article.id)
      setActiveArticle(updated)
      setArticles((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      setOverview((current) => {
        if (!current) {
          return current
        }
        return {
          ...current,
          latestArticles: current.latestArticles.map((item) => (item.id === updated.id ? updated : item)),
          savedArticles: current.savedArticles.map((item) => (item.id === updated.id ? updated : item)),
          brief: {
            ...current.brief,
            sections: current.brief.sections.map((section) => ({
              ...section,
              highlights: section.highlights.map((item) => (item.id === updated.id ? updated : item)),
              latest: section.latest.map((item) => (item.id === updated.id ? updated : item)),
            })),
          },
        }
      })
      setToast({ tone: 'success', message: '全文翻译已完成' })
    } catch (error) {
      console.error('Failed to translate article', error)
      setToast({ tone: 'error', message: error instanceof Error ? error.message : '翻译失败' })
    } finally {
      setTranslatingArticleId(null)
    }
  }

  async function handleSummarizeArticle(article: ReaderArticle) {
    setSummarizingArticleId(article.id)
    try {
      const updated = await summarizeReaderArticle(article.id)
      setActiveArticle(updated)
      setArticles((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      setOverview((current) => {
        if (!current) {
          return current
        }
        return {
          ...current,
          latestArticles: current.latestArticles.map((item) => (item.id === updated.id ? updated : item)),
          savedArticles: current.savedArticles.map((item) => (item.id === updated.id ? updated : item)),
          brief: {
            ...current.brief,
            sections: current.brief.sections.map((section) => ({
              ...section,
              highlights: section.highlights.map((item) => (item.id === updated.id ? updated : item)),
              latest: section.latest.map((item) => (item.id === updated.id ? updated : item)),
            })),
          },
        }
      })
      setToast({ tone: 'success', message: 'AI 摘要已更新' })
    } catch (error) {
      console.error('Failed to summarize article', error)
      setToast({ tone: 'error', message: error instanceof Error ? error.message : 'AI 摘要失败' })
    } finally {
      setSummarizingArticleId(null)
    }
  }

  async function handleClearRuntimeData() {
    try {
      await clearReaderRuntimeData()
      setShowClearDialog(false)
      setActiveArticle(null)
      setArticles([])
      setArticleOffset(0)
      setHasMoreArticles(false)
      await loadOverview()
      await loadViewArticles(activeView, activeCategory)
      setToast({ tone: 'success', message: 'Reader 运行数据已清理，可开始拟真测试' })
    } catch (error) {
      console.error('Failed to clear reader runtime data', error)
      setToast({ tone: 'error', message: error instanceof Error ? error.message : '清理失败' })
    }
  }

  function openReaderDir() {
    const base = withBasePath('/proxy/filebrowser/files')
    const target = readerDir ? `${base}${readerDir}` : withBasePath('/proxy/filebrowser/')
    window.open(target, '_blank', 'noopener,noreferrer')
  }

  function openReaderInboxDir() {
    const base = withBasePath('/proxy/filebrowser/files')
    const target = readerDir ? `${base}${readerDir}/inbox/pending` : withBasePath('/proxy/filebrowser/')
    window.open(target, '_blank', 'noopener,noreferrer')
  }

  async function copyOpenClawSpecPath() {
    const content = 'docs/openclaw-daily-brief-task-template.md'
    try {
      await navigator.clipboard.writeText(content)
      setToast({ tone: 'success', message: '已复制 OpenClaw 模板文档路径' })
    } catch {
      setToast({ tone: 'error', message: content })
    }
  }

  function renderSidebarButton(view: ReaderView, label: string, hint?: string) {
    const active = activeView === view
    return (
      <button
        type="button"
        onClick={() => setActiveView(view)}
        className={`w-full rounded-xl px-3 py-2.5 text-left transition-colors ${active ? 'bg-orange-100 text-orange-700 shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
      >
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
      </button>
    )
  }

  return (
    <div className="relative flex h-full bg-[linear-gradient(180deg,#fffefb_0%,#fff8ef_100%)] text-slate-800">
      <div className="w-72 shrink-0 border-r border-orange-100 bg-white/80 backdrop-blur-sm flex flex-col">
        <div className="border-b border-orange-100 bg-white/70 p-4">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center text-base font-bold text-slate-800">
              <ReaderIcon className="mr-2 h-5 w-5" />
              每日简报
            </h2>
            <div className="flex items-center gap-1">
              <button type="button" onClick={openReaderDir} className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100" title={`打开 RSS 工作目录\n${readerDir}`}>
                <FolderOpenIcon className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => void handlePullSubscriptions()} className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-orange-50 hover:text-orange-600" title="拉取最新订阅">
                <ArrowDownTrayIcon className={`h-4 w-4 ${pullingSubscriptions ? 'animate-bounce' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-2 border-b border-orange-100 p-3">
          {renderSidebarButton('brief', '今日简报', overview ? `收录 ${overview.brief.total} 篇 | 已加载 ${articles.length} 篇` : undefined)}
          {renderSidebarButton('category', '领域浏览', currentSection ? `${currentSection.category} · 今日 ${currentSection.total} 篇` : '按五大领域浏览')}
          {renderSidebarButton('openclaw', 'OpenClaw资讯', overview ? `待处理 ${overview.inboxStatus.pending.count} | 失败 ${overview.inboxStatus.failed.count}` : openClawCount > 0 ? `最近 ${openClawCount} 篇本地投递` : '单独查看本地投递资讯')}
          {renderSidebarButton('saved', '稍后阅读', overview ? `${overview.stats.savedArticles} 篇已收藏` : undefined)}
          {renderSidebarButton('feeds', '订阅管理', overview ? `${overview.stats.totalFeeds} 个订阅源` : undefined)}
        </div>

        <div className="border-b border-orange-100 px-3 py-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-semibold tracking-wide text-slate-500">五大领域</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => {
                  setActiveCategory(category)
                  setActiveView('category')
                }}
                className={`rounded-xl border px-3 py-2 text-left text-sm transition-colors ${activeCategory === category && activeView === 'category' ? 'border-orange-300 bg-orange-50 text-orange-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-auto p-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-semibold tracking-wide text-slate-500">同步状态</div>
            <div className="mt-3 space-y-2 text-xs text-slate-500">
              <div>最近执行：{overview?.syncStatus.lastRunAt ? formatReaderDate(overview.syncStatus.lastRunAt) : '暂无'}</div>
              <div>最近成功：{overview?.syncStatus.lastSuccessAt ? formatReaderDate(overview.syncStatus.lastSuccessAt) : '暂无'}</div>
              <div>Inbox 导入：{overview?.syncStatus.processedInboxCount ?? 0}</div>
              {overview?.syncStatus.lastError && <div className="rounded-lg bg-red-50 px-3 py-2 text-red-600">{overview.syncStatus.lastError}</div>}
            </div>
            <button type="button" onClick={() => setShowClearDialog(true)} className="mt-4 w-full rounded-xl border border-red-200 px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50">清理 Reader 运行数据</button>
          </div>
        </div>
      </div>

      <div className="w-[360px] shrink-0 border-r border-orange-100 bg-white/70 flex flex-col">
        <div className="border-b border-orange-100 bg-white/70 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-800">
                {activeView === 'brief' && '今日简报'}
                {activeView === 'category' && `${activeCategory} 领域`}
                {activeView === 'openclaw' && 'OpenClaw资讯'}
                {activeView === 'saved' && '稍后阅读'}
                {activeView === 'feeds' && '订阅管理'}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {activeView === 'brief' && `今日收录 ${overview?.brief.total ?? 0} 篇，已加载 ${articles.length} 篇，滚动到底部会继续加载`}
                {activeView === 'category' && '查看该领域的热门和最新资讯'}
                {activeView === 'openclaw' && `只显示 OpenClaw 或本地任务投递资讯，当前待处理 ${overview?.inboxStatus.pending.count ?? 0} 个文件`}
                {activeView === 'saved' && '留到稍后集中阅读'}
                {activeView === 'feeds' && '预设源 + 自定义订阅源'}
              </div>
            </div>
            {(activeView === 'brief' || activeView === 'openclaw') && (
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleRefresh()}
                  disabled={refreshing || pullingSubscriptions}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {refreshing ? '刷新中...' : '刷新'}
                </button>
                {activeView === 'brief' && (
                  <button
                    type="button"
                    onClick={() => void handlePullSubscriptions()}
                    disabled={refreshing || pullingSubscriptions}
                    className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-medium text-orange-700 transition-colors hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {pullingSubscriptions ? '拉取中...' : '拉取最新订阅'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div
          className="flex-1 overflow-auto p-3"
          onScroll={(event) => {
            const element = event.currentTarget
            if (element.scrollTop + element.clientHeight >= element.scrollHeight - 120) {
              void loadMoreBriefArticles()
            }
          }}
        >
          {loading || loadingArticles ? (
            <div className="py-12 text-center text-sm text-slate-400">加载中...</div>
          ) : activeView === 'feeds' ? (
            <div className="space-y-3">
              <button type="button" onClick={() => setShowFeedDialog(true)} className="flex w-full items-center justify-center rounded-2xl border border-dashed border-orange-300 bg-orange-50 px-4 py-3 text-sm font-medium text-orange-700 transition-colors hover:bg-orange-100">
                <PlusIcon className="mr-2 h-4 w-4" />
                新建订阅源
              </button>
              {feeds.map((feed) => (
                <div key={feed.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-800">{feed.name}</div>
                      <div className="mt-1 line-clamp-2 text-xs text-slate-500">{feed.url}</div>
                      <div className="mt-2 text-xs text-slate-400">{feed.category} · {feed.source === 'preset' ? '预设源' : '自定义'}</div>
                    </div>
                    {feed.source === 'custom' && (
                      <button type="button" onClick={() => setDeleteFeedId(feed.id)} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600">
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {articles.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-400">当前视图暂无资讯</div>
              ) : (
                <>
                  {articles.map((article) => (
                    <button
                      key={article.id}
                      type="button"
                      onClick={() => {
                        setActiveArticle(article)
                        void markRead(article)
                      }}
                      className={`block w-full rounded-2xl border px-4 py-3 text-left shadow-sm transition-colors ${activeArticle?.id === article.id ? 'border-orange-300 bg-orange-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-500">{article.category}</span>
                          <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${article.sourceType === 'openclaw' ? 'bg-violet-100 text-violet-700' : 'bg-sky-100 text-sky-700'}`}>
                            {article.sourceType === 'openclaw' ? 'OpenClaw' : 'RSS'}
                          </span>
                        </div>
                        <span className="text-[11px] text-amber-600">{importanceStars(article.importance)}</span>
                      </div>
                      <div className={`line-clamp-2 text-sm font-semibold leading-6 ${article.isRead ? 'text-slate-700' : 'text-slate-900'}`}>{article.title}</div>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                        <span>{article.author || '未知来源'}</span>
                        <span>{formatReaderDate(article.publishedAt)}</span>
                      </div>
                    </button>
                  ))}
                  {activeView === 'brief' && hasMoreArticles && (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-4 py-3 text-center text-xs text-slate-400">
                      {loadingMoreArticles ? '正在加载更多今日资讯...' : '下拉到底部继续加载更多今日资讯'}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="min-w-0 flex-1 overflow-hidden bg-white/50">
        {activeArticle ? (
          <div className="h-full overflow-auto">
            <div className="mx-auto max-w-4xl px-8 py-8 lg:px-12">
              <div className="mb-6 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="rounded-full bg-orange-100 px-2 py-1 font-medium text-orange-700">{activeArticle.category}</span>
                <span className={`rounded-full px-2 py-1 font-medium ${activeArticle.sourceType === 'openclaw' ? 'bg-violet-100 text-violet-700' : 'bg-sky-100 text-sky-700'}`}>
                  {activeArticle.sourceType === 'openclaw' ? 'OpenClaw 投递' : 'RSS 订阅'}
                </span>
                <span>{formatReaderDate(activeArticle.publishedAt)}</span>
                <span>{activeArticle.readTime} 分钟</span>
                <span>{importanceStars(activeArticle.importance)}</span>
              </div>

              <div className="mb-4 flex items-start justify-between gap-6">
                <div className="min-w-0">
                  <h1 className="text-3xl font-bold leading-tight text-slate-900">{activeArticle.title}</h1>
                  <div className="mt-3 text-sm text-slate-500">{activeArticle.author || '未知来源'}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void toggleSaved(activeArticle)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50"
                  >
                    {activeArticle.savedAt ? <BookmarkSlashIcon className="mr-2 inline-block h-4 w-4" /> : <BookmarkIcon className="mr-2 inline-block h-4 w-4" />}
                    {activeArticle.savedAt ? '取消稍后阅读' : '加入稍后阅读'}
                  </button>
                  {(activeArticle.contentText || activeArticle.summary.length > 0) && (
                    <button
                      type="button"
                      onClick={() => void handleSummarizeArticle(activeArticle)}
                      disabled={summarizingArticleId === activeArticle.id}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <SparklesIcon className="mr-2 inline-block h-4 w-4" />
                      {summarizingArticleId === activeArticle.id ? '摘要中...' : activeArticle.aiSummary ? '重新 AI 摘要' : 'AI 摘要'}
                    </button>
                  )}
                  {(activeArticle.contentText || activeArticle.summary.length > 0) && (
                    <button
                      type="button"
                      onClick={() => void handleTranslateArticle(activeArticle)}
                      disabled={translatingArticleId === activeArticle.id}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {translatingArticleId === activeArticle.id ? '翻译中...' : activeArticle.translatedText ? '重新翻译' : '全文翻译'}
                    </button>
                  )}
                  <a href={activeArticle.url} target="_blank" rel="noreferrer" className="rounded-xl bg-orange-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-600">
                    阅读原文
                  </a>
                </div>
              </div>

              <div className="mb-6 rounded-3xl border border-orange-100 bg-[linear-gradient(135deg,#fff8ef_0%,#fffdf8_100%)] p-6 shadow-sm">
                <div className="mb-3 text-sm font-semibold text-orange-700">AI 摘要 / 简报摘要</div>
                <div className="space-y-3 text-sm leading-7 text-slate-700">
                  {(activeArticle.aiSummary && activeArticle.aiSummary.length > 0 ? activeArticle.aiSummary : activeArticle.summary).map((line, index) => (
                    <div key={index} className="flex gap-3">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white">{index + 1}</span>
                      <span>{line}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {activeArticle.keywords.map((keyword) => (
                    <span key={keyword} className="rounded-full bg-white px-3 py-1 text-xs text-slate-600 shadow-sm">#{keyword}</span>
                  ))}
                </div>
                {!activeArticle.translatedText && (activeArticle.contentText || activeArticle.summary.length > 0) && (
                  <div className="mt-4 rounded-2xl border border-amber-100 bg-white/80 px-4 py-3 text-xs leading-6 text-slate-500">
                    可点击右上角 <span className="font-semibold text-slate-700">全文翻译</span> 生成中文译文。英文资讯效果最佳。
                  </div>
                )}
                {activeArticle.aiSummarizedAt && (
                  <div className="mt-4 text-xs text-slate-400">AI 摘要生成于 {formatReaderDate(activeArticle.aiSummarizedAt)}</div>
                )}
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-4 text-sm font-semibold text-slate-700">正文速览</div>
                <div className="whitespace-pre-wrap text-[15px] leading-8 text-slate-700">
                  {activeArticle.contentText || '当前资讯未提供正文内容，可点击右上角阅读原文。'}
                </div>
              </div>

              {activeArticle.translatedText && (
                <div className="mt-6 rounded-3xl border border-emerald-100 bg-emerald-50/60 p-6 shadow-sm">
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <div className="text-sm font-semibold text-emerald-800">中文全文翻译</div>
                    <div className="text-xs text-emerald-700/80">
                      {activeArticle.translatedAt ? `生成于 ${formatReaderDate(activeArticle.translatedAt)}` : '已生成'}
                    </div>
                  </div>
                  <div className="whitespace-pre-wrap text-[15px] leading-8 text-slate-700">
                    {activeArticle.translatedText}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-slate-400">
            <div className="w-full max-w-3xl rounded-[32px] border border-orange-100 bg-white/85 p-8 shadow-xl backdrop-blur-sm">
              <ReaderIcon className="mb-5 h-16 w-16 opacity-40" />
              <h3 className="text-2xl font-bold text-slate-900">每日简报已准备就绪</h3>
              <p className="mt-3 text-sm leading-7 text-slate-500">
                现在可以从两条链路给它喂资讯：一是保留 RSS 订阅源定时抓取，二是让 OpenClaw 直接把整理好的 JSON 写入
                <span className="mx-1 rounded bg-slate-100 px-2 py-1 font-mono text-slate-700">{readerDir}/inbox/pending</span>
                。
              </p>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-left">
                  <div className="text-sm font-semibold text-slate-800">OpenClaw 投递入口</div>
                  <div className="mt-2 text-xs leading-6 text-slate-500">把定时资讯任务的输出文件写到 `inbox/pending`，ClawOS 会在你点击“刷新”时自动导入并生成简报。</div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" onClick={openReaderInboxDir} className="rounded-xl bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition-colors hover:bg-slate-100">打开投递目录</button>
                    <button type="button" onClick={() => void copyOpenClawSpecPath()} className="rounded-xl bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition-colors hover:bg-slate-100">复制模板文档路径</button>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-left">
                  <div className="text-sm font-semibold text-slate-800">本地样例文件</div>
                  <div className="mt-2 text-xs leading-6 text-slate-500">机器本地已经放好了样例与说明，你后续让 OpenClaw 照着写就行。</div>
                  <div className="mt-4 space-y-2 text-xs text-slate-600">
                    <div className="rounded-xl bg-white px-3 py-2 font-mono">{readerDir}/config/openclaw-payload.example.json</div>
                    <div className="rounded-xl bg-white px-3 py-2 font-mono">{readerDir}/config/OPENCLAW_TASK_TEMPLATE.md</div>
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-orange-100 bg-orange-50/70 p-5 text-left">
                <div className="text-sm font-semibold text-orange-800">建议下一步</div>
                <div className="mt-2 text-sm leading-7 text-orange-900/80">
                  先在 OpenClaw 里建一个 `07:55` 的资讯整理任务，按模板输出 10-20 条 JSON 资讯到 `inbox/pending`。然后回到这里点一次“刷新”，就能看到第一版真实简报；如果还想补抓 RSS，再点“拉取最新订阅”。
                </div>
                <div className="mt-4">
                  <button type="button" onClick={() => void handleRefresh()} className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-600">刷新本地资讯</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div className={`absolute right-6 top-6 z-[160] rounded-xl px-4 py-3 shadow-xl text-sm font-medium ${toast.tone === 'success' ? 'bg-emerald-600 text-white' : toast.tone === 'error' ? 'bg-red-600 text-white' : 'bg-slate-900 text-white'}`}>
          {toast.message}
        </div>
      )}

      {showFeedDialog && (
        <div className="absolute inset-0 z-[170] flex items-center justify-center bg-slate-900/20 backdrop-blur-sm" onClick={() => setShowFeedDialog(false)}>
          <div className="w-[460px] rounded-3xl border border-white/70 bg-white/95 p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-800">新增订阅源</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">支持你手动添加新的 RSS 源，OpenClaw 投递资讯不需要在这里配置。</p>
            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">名称</label>
                <input value={feedDialog.name} onChange={(event) => setFeedDialog({ ...feedDialog, name: event.target.value })} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 focus:border-orange-300 focus:outline-none" placeholder="例如：Hacker News" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">RSS 地址</label>
                <input value={feedDialog.url} onChange={(event) => setFeedDialog({ ...feedDialog, url: event.target.value })} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 focus:border-orange-300 focus:outline-none" placeholder="https://example.com/rss.xml" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">领域</label>
                <select value={feedDialog.category} onChange={(event) => setFeedDialog({ ...feedDialog, category: event.target.value as ReaderCategory })} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 focus:border-orange-300 focus:outline-none">
                  {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setShowFeedDialog(false)} className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100">取消</button>
              <button type="button" onClick={() => void handleCreateFeed()} className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-600">添加订阅源</button>
            </div>
          </div>
        </div>
      )}

      {deleteFeedId && (
        <div className="absolute inset-0 z-[170] flex items-center justify-center bg-slate-900/20 backdrop-blur-sm" onClick={() => setDeleteFeedId(null)}>
          <div className="w-[420px] rounded-3xl border border-white/70 bg-white/95 p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-800">删除订阅源</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">仅删除 ClawOS 内的订阅配置，不会删除已经落地到本地资讯库的文章。</p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteFeedId(null)} className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100">取消</button>
              <button type="button" onClick={() => void handleDeleteFeed()} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700">确认删除</button>
            </div>
          </div>
        </div>
      )}

      {showClearDialog && (
        <div className="absolute inset-0 z-[170] flex items-center justify-center bg-slate-900/20 backdrop-blur-sm" onClick={() => setShowClearDialog(false)}>
          <div className="w-[460px] rounded-3xl border border-white/70 bg-white/95 p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-800">清理 Reader 运行数据</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">会删除已抓取文章、简报、稍后阅读和缓存，但保留订阅源配置、OpenClaw 模板和目录结构，便于你重新做拟真测试。</p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setShowClearDialog(false)} className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100">取消</button>
              <button type="button" onClick={() => void handleClearRuntimeData()} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700">确认清理</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
