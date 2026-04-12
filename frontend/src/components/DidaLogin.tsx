import { useState, useEffect } from 'react';
import { CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { withBasePath } from '../lib/basePath';

export default function DidaLogin() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const checkStatus = async () => {
    try {
      const res = await fetch(withBasePath('/api/system/dida/status'));
      const data = await res.json();
      if (data.success && data.connected) {
        setStatus('success');
        setMessage('已连接到滴答清单开放平台');
      } else {
        setStatus('idle');
        setMessage('未授权');
      }
    } catch (err) {
      setStatus('error');
      setMessage('获取状态失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();
    
    // Listen for auth success message from popup window
    const handleMessage = (event: MessageEvent) => {
      if (event.data === 'dida-auth-success' || event.data?.type === 'dida-auth-success') {
        checkStatus();
        return;
      }

      if (event.data?.type === 'dida-auth-error') {
        setStatus('error');
        setMessage(event.data.error || '授权失败，请检查回调地址和应用配置');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleLogin = async () => {
    setLoading(true);
    try {
      const res = await fetch(withBasePath('/api/system/dida/auth/url'));
      const data = await res.json();
      if (data.success && data.url) {
        // Open OAuth window
        window.open(data.url, 'dida-auth', 'width=600,height=700');
        setMessage(`请在新窗口完成授权。若报 redirect_uri 错误，请到滴答开发者平台将回调地址配置为：${data.redirectUri}`);
      } else {
        setStatus('error');
        setMessage('获取授权链接失败');
      }
    } catch (err: any) {
      setStatus('error');
      setMessage(err.message || '网络错误');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    try {
      await fetch(withBasePath('/api/system/dida/logout'), { method: 'POST' });
      setStatus('idle');
      setMessage('已断开连接');
    } catch (err) {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded bg-blue-500 flex items-center justify-center">
            <svg viewBox="0 0 32 32" fill="none" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
              <path d="M10 16l4 4 8-8" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <h5 className="text-sm font-bold text-slate-800">滴答清单 (OpenAPI)</h5>
            <div className="flex items-center space-x-1 mt-0.5">
              {loading ? (
                <span className="text-[10px] text-slate-500">检查状态中...</span>
              ) : status === 'success' ? (
                <><CheckCircle className="w-3 h-3 text-green-500" /><span className="text-[10px] text-green-600 font-medium">已授权</span></>
              ) : status === 'error' ? (
                <><AlertCircle className="w-3 h-3 text-red-500" /><span className="text-[10px] text-red-600 font-medium">状态异常</span></>
              ) : (
                <span className="text-[10px] text-slate-500">未授权</span>
              )}
            </div>
          </div>
        </div>

        <div>
          {status === 'success' ? (
            <button
              onClick={handleLogout}
              disabled={loading}
              className="px-4 py-1.5 bg-white border border-red-200 text-red-600 rounded text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              断开连接
            </button>
          ) : (
            <button
              onClick={handleLogin}
              disabled={loading}
              className="px-4 py-1.5 bg-blue-500 text-white rounded text-sm font-medium hover:bg-blue-600 transition-colors flex items-center disabled:opacity-50"
            >
              <ExternalLink className="w-4 h-4 mr-1.5" />
              前往授权
            </button>
          )}
        </div>
      </div>
      
      {message && <div className="mt-3 text-xs text-slate-500">{message}</div>}
    </div>
  );
}
