import { useState, useEffect } from 'react'
import { PlusIcon, TrashIcon, PlayIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/solid'
import { CronIcon } from '../components/Icons'
import { withBasePath } from '../lib/basePath'

interface CronJob {
  id: string
  name: string
  schedule: string
  command: string
  enabled: boolean
  lastRun?: string
  lastStatus?: 'success' | 'error'
  lastLog?: string
}

export default function CronApp() {
  const [jobs, setJobs] = useState<CronJob[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newJob, setNewJob] = useState({ name: '', schedule: '0 0 * * *', command: '', enabled: true })

  useEffect(() => {
    fetchJobs()
  }, [])

  const fetchJobs = async () => {
    try {
      const res = await fetch(withBasePath('/api/system/cron'))
      const json = await res.json()
      if (json.success) setJobs(json.data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const addJob = async () => {
    try {
      const res = await fetch(withBasePath('/api/system/cron'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newJob)
      })
      const json = await res.json()
      if (json.success) {
        setJobs([...jobs, json.data])
        setShowAdd(false)
        setNewJob({ name: '', schedule: '0 0 * * *', command: '', enabled: true })
      } else {
        alert(json.error)
      }
    } catch (e) {
      console.error(e)
    }
  }

  const deleteJob = async (id: string) => {
    if (!confirm('确定删除此任务？')) return
    try {
      await fetch(withBasePath(`/api/system/cron/${id}`), { method: 'DELETE' })
      setJobs(jobs.filter(j => j.id !== id))
    } catch (e) {
      console.error(e)
    }
  }

  const toggleJob = async (job: CronJob) => {
    try {
      const res = await fetch(withBasePath(`/api/system/cron/${job.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !job.enabled })
      })
      if (res.ok) fetchJobs()
    } catch (e) {
      console.error(e)
    }
  }

  const runJob = async (id: string) => {
    try {
      await fetch(withBasePath(`/api/system/cron/${id}/run`), { method: 'POST' })
      alert('已触发后台执行')
      setTimeout(fetchJobs, 2000)
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-800">
      <div className="flex items-center justify-between p-4 bg-white border-b border-slate-200">
        <div className="flex items-center space-x-3">
          <CronIcon className="w-6 h-6 mr-2" />
          <h2 className="text-lg font-bold text-slate-800">任务自动化</h2>
        </div>
        <button 
          onClick={() => setShowAdd(true)}
          className="flex items-center px-4 py-1.5 bg-indigo-600 text-white rounded-full text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          <PlusIcon className="w-4 h-4 mr-1" /> 新建任务
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {showAdd && (
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm mb-6">
            <h3 className="font-bold mb-4">新建定时任务</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">任务名称</label>
                <input type="text" value={newJob.name} onChange={e => setNewJob({...newJob, name: e.target.value})} className="w-full border rounded px-3 py-2 text-sm" placeholder="如：每日清理缓存" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Cron 表达式 (分 时 日 月 周)</label>
                <input type="text" value={newJob.schedule} onChange={e => setNewJob({...newJob, schedule: e.target.value})} className="w-full border rounded px-3 py-2 text-sm font-mono" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Shell 命令</label>
                <input type="text" value={newJob.command} onChange={e => setNewJob({...newJob, command: e.target.value})} className="w-full border rounded px-3 py-2 text-sm font-mono bg-slate-50" placeholder="rm -rf /tmp/*" />
              </div>
              <div className="flex space-x-3">
                <button onClick={addJob} className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg">保存</button>
                <button onClick={() => setShowAdd(false)} className="px-4 py-2 bg-slate-200 text-slate-700 text-sm rounded-lg">取消</button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center text-slate-400 mt-10">加载中...</div>
        ) : jobs.length === 0 ? (
          <div className="text-center text-slate-400 mt-10">暂无定时任务</div>
        ) : (
          <div className="space-y-4">
            {jobs.map(job => (
              <div key={job.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-1">
                    <h3 className="font-bold text-slate-800">{job.name}</h3>
                    <span className={`px-2 py-0.5 rounded text-xs font-mono ${job.enabled ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                      {job.schedule}
                    </span>
                  </div>
                  <div className="text-sm font-mono text-slate-500 bg-slate-50 px-3 py-2 rounded-lg mt-2 truncate">
                    {job.command}
                  </div>
                  {job.lastRun && (
                    <div className="text-xs text-slate-400 mt-2 flex items-center">
                      上次运行: {new Date(job.lastRun).toLocaleString('zh-CN')}
                      {job.lastStatus === 'success' ? (
                        <CheckCircleIcon className="w-3.5 h-3.5 text-green-500 ml-2 mr-1" /> 
                      ) : (
                        <XCircleIcon className="w-3.5 h-3.5 text-red-500 ml-2 mr-1" />
                      )}
                      <span className="truncate max-w-xs">{job.lastLog}</span>
                    </div>
                  )}
                </div>
                
                <div className="flex items-center space-x-2 shrink-0 border-t md:border-t-0 md:border-l border-slate-100 pt-3 md:pt-0 md:pl-4">
                  <button 
                    onClick={() => runJob(job.id)}
                    className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                    title="立即执行一次"
                  >
                    <PlayIcon className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => toggleJob(job)}
                    className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${job.enabled ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                    {job.enabled ? '停用' : '启用'}
                  </button>
                  <button 
                    onClick={() => deleteJob(job.id)}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="删除"
                  >
                    <TrashIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
