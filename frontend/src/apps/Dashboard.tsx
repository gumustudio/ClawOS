import { useState, useEffect } from 'react'
import { 
  CpuChipIcon, 
  ServerStackIcon, 
  CircleStackIcon, 
  ArrowPathIcon,
  WifiIcon,
  ClockIcon,
  ArrowsRightLeftIcon,
  BoltIcon
} from '@heroicons/react/24/solid'
import { withBasePath } from '../lib/basePath'

interface HardwareStats {
  uptime: number
  cpu: { usage: string; cores: number }
  memory: { total: string; used: string; free: string; usagePercent: string }
  disk: { total: string; used: string; usagePercent: string }
}

interface NetworkStats {
  speed: { rx_sec: number; tx_sec: number }
  tailscale: { ip?: string; active: boolean }
  interfaces: { name: string; ip4: string; type: string }[]
}

const Sparkline = ({ data, colorClass, fillClass }: { data: number[], colorClass: string, fillClass: string }) => {
  const max = 100;
  // Create an array of 30 points minimum to keep the chart width stable
  const renderData = data.length < 30 ? [...Array(30 - data.length).fill(0), ...data] : data.slice(-30);
  
  const points = renderData.map((val, i) => `${(i / (renderData.length - 1 || 1)) * 100},${100 - (val / max) * 100}`).join(' ');
  return (
    <svg viewBox="0 0 100 100" className="absolute bottom-0 left-0 w-full h-16 preserve-aspect-none opacity-20 pointer-events-none rounded-b-2xl" preserveAspectRatio="none">
      <polyline points={`0,100 ${points} 100,100`} className={`fill-current ${fillClass}`} />
      <polyline points={points} className={`stroke-current ${colorClass}`} fill="none" strokeWidth="3" strokeLinejoin="round" />
    </svg>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<HardwareStats | null>(null)
  const [network, setNetwork] = useState<NetworkStats | null>(null)
  const [history, setHistory] = useState<{cpu: number[], mem: number[]}>({ cpu: [], mem: [] })
  const [loading, setLoading] = useState(true)

  // Speedtest state
  const [isTesting, setIsTesting] = useState(false)
  const [testResults, setTestResults] = useState<{ ping: number | null, dl: string | null, ul: string | null }>({ ping: null, dl: null, ul: null })
  const [testStatus, setTestStatus] = useState('点击开始测速')

  const runSpeedTest = async () => {
    if (isTesting) return;
    setIsTesting(true);
    setTestResults({ ping: null, dl: null, ul: null });
    
    try {
      // 1. Ping
      setTestStatus('Ping 测速中...');
      const pings = [];
      for(let i=0; i<3; i++) {
        const start = performance.now();
        await fetch(withBasePath('/api/system/network'), { cache: 'no-store' }); 
        pings.push(performance.now() - start);
      }
      const ping = Math.round(pings.reduce((a, b) => a + b, 0) / pings.length);
      setTestResults(prev => ({ ...prev, ping }));

      // 2. Download (10MB)
      setTestStatus('下载测速中...');
      const dlSizeMb = 10;
      const dlStart = performance.now();
      const dlRes = await fetch(withBasePath(`/api/system/speedtest/download?size=${dlSizeMb}`), { cache: 'no-store' });
      const reader = dlRes.body?.getReader();
      if (reader) {
        while(true) {
          const { done } = await reader.read();
          if (done) break;
        }
      }
      const dlEnd = performance.now();
      const dlTime = (dlEnd - dlStart) / 1000;
      const dlSpeedMbps = ((dlSizeMb * 8) / dlTime).toFixed(1);
      setTestResults(prev => ({ ...prev, dl: dlSpeedMbps }));

      // 3. Upload (5MB)
      setTestStatus('上传测速中...');
      const ulSizeMb = 5;
      const ulData = new Uint8Array(ulSizeMb * 1024 * 1024);
      const ulStart = performance.now();
      await fetch(withBasePath('/api/system/speedtest/upload'), {
        method: 'POST',
        body: ulData
      });
      const ulEnd = performance.now();
      const ulTime = (ulEnd - ulStart) / 1000;
      const ulSpeedMbps = ((ulSizeMb * 8) / ulTime).toFixed(1);
      setTestResults(prev => ({ ...prev, ul: ulSpeedMbps }));

      setTestStatus('测速完成');
    } catch (err) {
      setTestStatus('测速失败');
      console.error(err);
    } finally {
      setIsTesting(false);
    }
  }

  const fetchStats = async () => {
      try {
        const [hwRes, netRes] = await Promise.all([
        fetch(withBasePath('/api/system/hardware')),
        fetch(withBasePath('/api/system/network'))
      ])
      
      const hwJson = await hwRes.json()
      const netJson = await netRes.json()
      
      if (hwJson.success) {
        setStats(hwJson.data)
        setHistory(prev => ({
          cpu: [...prev.cpu, parseFloat(hwJson.data.cpu.usage)].slice(-30),
          mem: [...prev.mem, parseFloat(hwJson.data.memory.usagePercent)].slice(-30)
        }))
      }
      if (netJson.success) setNetwork(netJson.data)
      
    } catch (error) {
      console.error('Failed to fetch system stats', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
    const timer = setInterval(fetchStats, 5000)
    return () => clearInterval(timer)
  }, [])

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500">
        <ArrowPathIcon className="w-6 h-6 animate-spin mr-2" /> 正在读取系统状态...
      </div>
    )
  }

  const formatSpeed = (bytesPerSec: number) => {
    if (bytesPerSec === null || bytesPerSec === undefined || isNaN(bytesPerSec)) return '0 B/s'
    if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(1)} B/s`
    if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
    return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
  }

  const formatUptime = (seconds: number) => {
    if (!seconds) return '刚刚'
    const d = Math.floor(seconds / (3600 * 24))
    const h = Math.floor((seconds % (3600 * 24)) / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    if (d > 0) return `${d}天 ${h}小时 ${m}分钟`
    if (h > 0) return `${h}小时 ${m}分钟`
    return `${m}分钟`
  }

  return (
    <div className="p-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* CPU Card */}
        <div className="relative bg-white/50 backdrop-blur-md rounded-2xl p-6 border border-white/40 shadow-sm flex flex-col justify-between overflow-hidden">
          <div className="relative z-10 flex items-center justify-between mb-4">
            <div className="flex items-center text-slate-700">
              <CpuChipIcon className="w-5 h-5 mr-2 text-blue-500" />
              <h3 className="font-semibold">CPU</h3>
            </div>
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-md shadow-sm">{stats.cpu.cores} Cores</span>
          </div>
          <div className="relative z-10 flex items-end space-x-2">
            <span className="text-5xl font-light text-slate-800">{stats.cpu.usage}</span>
            <span className="text-lg text-slate-500 mb-1">%</span>
          </div>
          <div className="relative z-10 w-full bg-slate-200/50 rounded-full h-1.5 mt-4 overflow-hidden backdrop-blur-sm">
            <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-1000" style={{ width: `${stats.cpu.usage}%` }}></div>
          </div>
          <Sparkline data={history.cpu} colorClass="text-blue-500" fillClass="text-blue-200" />
        </div>

        {/* Memory Card */}
        <div className="relative bg-white/50 backdrop-blur-md rounded-2xl p-6 border border-white/40 shadow-sm flex flex-col justify-between overflow-hidden">
          <div className="relative z-10 flex items-center justify-between mb-4">
            <div className="flex items-center text-slate-700">
              <ServerStackIcon className="w-5 h-5 mr-2 text-purple-500" />
              <h3 className="font-semibold">Memory</h3>
            </div>
            <span className="text-xs text-slate-500 bg-white/40 px-2 py-1 rounded-md">{stats.memory.used}GB / {stats.memory.total}GB</span>
          </div>
          <div className="relative z-10 flex items-end space-x-2">
            <span className="text-5xl font-light text-slate-800">{stats.memory.usagePercent}</span>
            <span className="text-lg text-slate-500 mb-1">%</span>
          </div>
          <div className="relative z-10 w-full bg-slate-200/50 rounded-full h-1.5 mt-4 overflow-hidden backdrop-blur-sm">
            <div className="bg-purple-500 h-1.5 rounded-full transition-all duration-1000" style={{ width: `${stats.memory.usagePercent}%` }}></div>
          </div>
          <Sparkline data={history.mem} colorClass="text-purple-500" fillClass="text-purple-200" />
        </div>

        {/* Disk Card */}
        <div className="bg-white/50 backdrop-blur-md rounded-2xl p-6 border border-white/40 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center text-slate-700">
              <CircleStackIcon className="w-5 h-5 mr-2 text-orange-500" />
              <h3 className="font-semibold">Main Storage (/)</h3>
            </div>
            <span className="text-xs text-slate-500">{stats.disk.used}GB / {stats.disk.total}GB</span>
          </div>
          <div className="flex items-end space-x-2">
            <span className="text-5xl font-light text-slate-800">{stats.disk.usagePercent}</span>
            <span className="text-lg text-slate-500 mb-1">%</span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-1.5 mt-4">
            <div className="bg-orange-500 h-1.5 rounded-full" style={{ width: `${stats.disk.usagePercent}%` }}></div>
          </div>
        </div>

        {/* Network Card */}
        {network && (
          <div className="bg-white/50 backdrop-blur-md rounded-2xl p-6 border border-white/40 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center text-slate-700">
                <WifiIcon className="w-5 h-5 mr-2 text-teal-500" />
                <h3 className="font-semibold">Network</h3>
              </div>
              <span className={`text-xs px-2 py-1 rounded-md ${network.tailscale.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {network.tailscale.active ? 'Tailscale Online' : 'Tailscale Offline'}
              </span>
            </div>
            <div className="flex flex-col space-y-3 mt-2">
              {network.tailscale.active && (
                <div>
                  <div className="text-xs text-slate-500 mb-1">Tailscale IP</div>
                  <div className="text-2xl font-light text-slate-800">{network.tailscale.ip}</div>
                </div>
              )}
              {network.interfaces.filter(i => i.name !== 'tailscale0' && i.name !== 'lo' && !i.name.startsWith('docker') && !i.name.startsWith('br-') && !i.name.startsWith('veth')).map(iface => (
                <div key={iface.name}>
                  <div className="text-xs text-slate-500 mb-1">Local IP ({iface.name})</div>
                  <div className="text-xl font-light text-slate-800">{iface.ip4}</div>
                </div>
              )).slice(0, network.tailscale.active ? 1 : 2)}
            </div>
          </div>
        )}

        {/* Network Speed Card */}
        {network && network.speed && (
          <div className="bg-white/50 backdrop-blur-md rounded-2xl p-6 border border-white/40 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center text-slate-700">
                <ArrowsRightLeftIcon className="w-5 h-5 mr-2 text-cyan-500" />
                <h3 className="font-semibold">实时网速</h3>
              </div>
            </div>
            <div className="flex flex-col space-y-4">
              <div>
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>↓ 下载 (RX)</span>
                </div>
                <div className="text-3xl font-light text-cyan-600">{formatSpeed(network.speed.rx_sec)}</div>
              </div>
              <div>
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>↑ 上传 (TX)</span>
                </div>
                <div className="text-3xl font-light text-indigo-600">{formatSpeed(network.speed.tx_sec)}</div>
              </div>
            </div>
          </div>
        )}

        {/* Uptime Card */}
        <div className="bg-white/50 backdrop-blur-md rounded-2xl p-6 border border-white/40 shadow-sm flex flex-col justify-center">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center text-slate-700">
              <ClockIcon className="w-5 h-5 mr-2 text-emerald-500" />
              <h3 className="font-semibold">运行时长</h3>
            </div>
          </div>
          <div className="flex items-end mt-2">
            <span className="text-3xl font-light text-emerald-700">{formatUptime(stats.uptime)}</span>
          </div>
          <p className="text-xs text-slate-500 mt-4">ClawOS 后端服务已连续运行时间</p>
        </div>

        {/* Speedtest Card */}
        <div className="bg-white/50 backdrop-blur-md rounded-2xl p-6 border border-white/40 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center text-slate-700">
              <BoltIcon className="w-5 h-5 mr-2 text-yellow-500" />
              <h3 className="font-semibold">连接测速</h3>
            </div>
            <button 
              onClick={runSpeedTest} 
              disabled={isTesting}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors shadow-sm border ${
                isTesting 
                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' 
                  : 'bg-white text-slate-700 border-white/60 hover:bg-slate-50 active:scale-95 cursor-pointer'
              }`}
            >
              {isTesting ? '测速中...' : '开始测速'}
            </button>
          </div>
          
          <div className="grid grid-cols-3 gap-2 mt-2">
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-500 mb-1">延迟 (Ping)</span>
              <div className="flex items-baseline space-x-1">
                <span className="text-xl font-light text-slate-700">{testResults.ping !== null ? testResults.ping : '--'}</span>
                <span className="text-xs text-slate-500">ms</span>
              </div>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-500 mb-1">下载</span>
              <div className="flex items-baseline space-x-1">
                <span className="text-xl font-light text-slate-700">{testResults.dl !== null ? testResults.dl : '--'}</span>
                <span className="text-xs text-slate-500">Mbps</span>
              </div>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-500 mb-1">上传</span>
              <div className="flex items-baseline space-x-1">
                <span className="text-xl font-light text-slate-700">{testResults.ul !== null ? testResults.ul : '--'}</span>
                <span className="text-xs text-slate-500">Mbps</span>
              </div>
            </div>
          </div>
          <div className="mt-4 text-xs text-slate-400 text-center bg-white/30 py-1.5 rounded-lg border border-white/20">
            {testStatus}
          </div>
        </div>

      </div>
    </div>
  )
}
