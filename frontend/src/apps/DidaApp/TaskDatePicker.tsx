import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Clock, Bell, Repeat } from 'lucide-react';
import type { Task } from './types';
import { parseTaskDate } from './date';

interface TaskDatePickerProps {
  task: Task;
  onSave: (updates: Partial<Task>) => void;
  onClose: () => void;
}

export default function TaskDatePicker({ task, onSave, onClose }: TaskDatePickerProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  const [selectedDate, setSelectedDate] = useState<Date | null>(
    parseTaskDate(task.dueDate)
  );
  
  const [isAllDay, setIsAllDay] = useState(task.isAllDay);
  const [timeStr, setTimeStr] = useState(() => {
    if (!task.dueDate || task.isAllDay) return '12:00';
    const d = parseTaskDate(task.dueDate);
    if (!d) return '12:00';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
  
  const [reminder, setReminder] = useState(task.reminder || 'none');
  const [repeat, setRepeat] = useState(task.repeat || 'none');

  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = firstDay === 0 ? 6 : firstDay - 1; 

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const prefixDays = Array.from({ length: startOffset });

  const isToday = (d: number) => {
    const today = new Date();
    return d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
  };

  const isSelected = (d: number) => {
    if (!selectedDate) return false;
    return d === selectedDate.getDate() && month === selectedDate.getMonth() && year === selectedDate.getFullYear();
  };

  const handleDayClick = (d: number) => {
    const newDate = new Date(year, month, d);
    setSelectedDate(newDate);
  };

  const handleSave = () => {
    if (!selectedDate) {
      onSave({ dueDate: undefined, isAllDay: true, reminder: undefined, repeat: undefined });
      return;
    }
    
    let finalDate = new Date(selectedDate);
    if (!isAllDay) {
      const [h, m] = timeStr.split(':').map(Number);
      finalDate.setHours(h, m, 0, 0);
    } else {
      finalDate.setHours(0, 0, 0, 0);
    }

    onSave({
      dueDate: finalDate.toISOString(),
      isAllDay,
      reminder: reminder === 'none' ? undefined : reminder,
      repeat: repeat === 'none' ? undefined : repeat
    });
  };

  const handleClear = () => {
    onSave({ dueDate: undefined, isAllDay: true, reminder: undefined, repeat: undefined });
  };

  const quickPicks = [
    { label: '今天', onClick: () => { setSelectedDate(new Date()); } },
    { label: '明天', onClick: () => { const d = new Date(); d.setDate(d.getDate() + 1); setSelectedDate(d); } },
    { label: '下周', onClick: () => { const d = new Date(); d.setDate(d.getDate() + 7); setSelectedDate(d); } },
    { label: '下个月', onClick: () => { const d = new Date(); d.setMonth(d.getMonth() + 1); setSelectedDate(d); } },
  ];

  return (
    <div 
      ref={popoverRef}
      className="absolute top-full left-0 mt-2 bg-white rounded-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] border border-slate-200 w-[320px] z-50 overflow-hidden flex flex-col text-slate-800 animate-in fade-in zoom-in-95 duration-200"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex space-x-1">
          <button onClick={() => setCurrentMonth(new Date(year, month - 1, 1))} className="p-1 rounded hover:bg-slate-100 text-slate-500"><ChevronLeft className="w-4 h-4" /></button>
          <span className="text-sm font-bold flex items-center justify-center min-w-[80px]">{year}年 {month + 1}月</span>
          <button onClick={() => setCurrentMonth(new Date(year, month + 1, 1))} className="p-1 rounded hover:bg-slate-100 text-slate-500"><ChevronRight className="w-4 h-4" /></button>
        </div>
        <div className="flex space-x-1 text-[11px] font-medium">
           {quickPicks.slice(0, 2).map(p => (
             <button key={p.label} onClick={p.onClick} className="px-2 py-1 rounded bg-slate-50 hover:bg-slate-100 text-slate-600 transition-colors">{p.label}</button>
           ))}
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="p-4">
        <div className="grid grid-cols-7 mb-2">
          {['一', '二', '三', '四', '五', '六', '日'].map(d => (
            <div key={d} className="text-center text-[11px] font-bold text-slate-400 py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {prefixDays.map((_, i) => (
            <div key={`pre-${i}`} className="h-8"></div>
          ))}
          {days.map(d => (
            <button
              key={d}
              onClick={() => handleDayClick(d)}
              className={`h-8 text-sm font-medium rounded-full flex items-center justify-center transition-all ${
                isSelected(d) 
                  ? 'bg-blue-500 text-white shadow-md shadow-blue-500/30' 
                  : isToday(d)
                    ? 'text-blue-600 bg-blue-50'
                    : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Options */}
      <div className="bg-slate-50/80 px-4 py-3 border-t border-slate-100 space-y-3">
        {/* Time Settings */}
        <div className="flex items-center justify-between">
          <div className="flex items-center text-sm font-medium text-slate-700">
            <Clock className="w-4 h-4 mr-2 text-slate-400" />
            时间
          </div>
          <div className="flex items-center space-x-3">
            {!isAllDay && (
              <input 
                type="time" 
                value={timeStr}
                onChange={(e) => setTimeStr(e.target.value)}
                className="bg-white border border-slate-200 rounded px-2 py-1 text-xs font-medium outline-none focus:border-blue-400"
              />
            )}
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={!isAllDay}
                onChange={(e) => setIsAllDay(!e.target.checked)}
              />
              <div className="w-8 h-4.5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-[14px] peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-blue-500"></div>
            </label>
          </div>
        </div>

        {/* Reminder Settings */}
        <div className="flex items-center justify-between">
          <div className="flex items-center text-sm font-medium text-slate-700">
            <Bell className="w-4 h-4 mr-2 text-slate-400" />
            提醒
          </div>
          <select 
            value={reminder}
            onChange={(e) => setReminder(e.target.value)}
            disabled={isAllDay}
            className="bg-white border border-slate-200 rounded px-2 py-1 text-xs font-medium outline-none focus:border-blue-400 disabled:opacity-50 disabled:bg-slate-100 cursor-pointer w-[120px]"
          >
            <option value="none">无提醒</option>
            <option value="0">准时</option>
            <option value="-5m">提前 5 分钟</option>
            <option value="-30m">提前 30 分钟</option>
            <option value="-1h">提前 1 小时</option>
            <option value="-1d">提前 1 天</option>
          </select>
        </div>

        {/* Repeat Settings */}
        <div className="flex items-center justify-between">
          <div className="flex items-center text-sm font-medium text-slate-700">
            <Repeat className="w-4 h-4 mr-2 text-slate-400" />
            重复
          </div>
          <select 
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            className="bg-white border border-slate-200 rounded px-2 py-1 text-xs font-medium outline-none focus:border-blue-400 cursor-pointer w-[120px]"
          >
            <option value="none">不重复</option>
            <option value="daily">每天</option>
            <option value="weekly">每周</option>
            <option value="monthly">每月</option>
            <option value="yearly">每年</option>
          </select>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-white">
        <button 
          onClick={handleClear}
          className="text-xs font-medium text-slate-500 hover:text-red-500 transition-colors px-2 py-1 rounded hover:bg-slate-50"
        >
          清除
        </button>
        <div className="flex space-x-2">
          <button 
            onClick={onClose}
            className="text-xs font-medium text-slate-600 px-3 py-1.5 rounded hover:bg-slate-100 transition-colors"
          >
            取消
          </button>
          <button 
            onClick={() => { handleSave(); onClose(); }}
            className="text-xs font-bold text-white bg-blue-500 px-4 py-1.5 rounded shadow-sm hover:bg-blue-600 transition-colors"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
