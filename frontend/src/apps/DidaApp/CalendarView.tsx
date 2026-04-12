import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAppStore } from './store';
import type { Priority } from './types';
import { parseTaskDate } from './date';

const PRIORITY_COLORS: Record<Priority, string> = {
  0: 'bg-slate-400',
  1: 'bg-blue-400',
  3: 'bg-amber-400',
  5: 'bg-red-500',
};

export default function CalendarView() {
  const { state, dispatch } = useAppStore();
  const [currentDate, setCurrentDate] = useState(new Date());

  if (state.appStatus === 'loading') {
    return <div className="flex-1 bg-white border-r border-slate-200 flex items-center justify-center text-slate-500">正在同步滴答数据...</div>;
  }

  if (state.appStatus === 'unauthorized') {
    return <div className="flex-1 bg-white border-r border-slate-200 flex items-center justify-center text-slate-500">未授权滴答账号，请前往系统设置完成授权。</div>;
  }

  if (state.appStatus === 'error') {
    return <div className="flex-1 bg-white border-r border-slate-200 flex items-center justify-center text-red-500">同步失败：{state.appError || '未知错误'}</div>;
  }

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;
  const days = Array.from({ length: daysInMonth }, (_, index) => index + 1);
  const prefixDays = Array.from({ length: startOffset });
  const totalCells = prefixDays.length + days.length;
  const rows = totalCells > 35 ? 6 : 5;
  const postCellsCount = rows * 7 - totalCells;

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const jumpToday = () => setCurrentDate(new Date());

  const isToday = (day: number) => {
    const now = new Date();
    return day === now.getDate() && month === now.getMonth() && year === now.getFullYear();
  };

  return (
    <div className="flex-1 bg-slate-50 flex flex-col border-r border-slate-200 min-w-[500px]">
      <div className="h-14 flex items-center justify-between px-6 border-b border-slate-200 bg-white shadow-sm z-10">
        <div className="flex items-center space-x-4">
          <h2 className="text-xl font-bold text-slate-800">{year}年 {month + 1}月</h2>
          <div className="flex items-center space-x-1">
            <button onClick={prevMonth} className="p-1 rounded-md hover:bg-slate-100 text-slate-600 transition-colors"><ChevronLeft className="w-5 h-5" /></button>
            <button onClick={jumpToday} className="px-2.5 py-1 text-xs font-semibold rounded-md border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors">今天</button>
            <button onClick={nextMonth} className="p-1 rounded-md hover:bg-slate-100 text-slate-600 transition-colors"><ChevronRight className="w-5 h-5" /></button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col p-4 overflow-hidden">
        <div className="grid grid-cols-7 mb-2">
          {['一', '二', '三', '四', '五', '六', '日'].map((dayLabel) => (
            <div key={dayLabel} className="text-center text-xs font-bold text-slate-400 py-1">{dayLabel}</div>
          ))}
        </div>

        <div
          className="flex-1 grid grid-cols-7 gap-[1px] bg-slate-200 border border-slate-200 rounded-xl overflow-hidden shadow-sm"
          style={{ gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}
        >
          {prefixDays.map((_, index) => (
            <div key={`pre-${index}`} className="bg-[#fafafa]"></div>
          ))}

          {days.map((day) => {
            const dateString = new Date(year, month, day).toDateString();
            const dayTasks = state.tasks.filter((task) => {
              if (!task.dueDate || task.status !== 0) return false;
              const date = parseTaskDate(task.dueDate);
              return date ? date.toDateString() === dateString : false;
            });

            return (
              <div key={day} className={`bg-white p-1.5 flex flex-col group cursor-pointer hover:bg-blue-50/40 transition-colors ${isToday(day) ? 'bg-blue-50/20' : ''}`}>
                <div className="flex justify-end items-start mb-1.5">
                  <span className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full transition-colors ${isToday(day) ? 'bg-blue-500 text-white shadow-md' : 'text-slate-500 group-hover:text-blue-600'}`}>{day}</span>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1">
                  {dayTasks.map((task) => (
                    <div
                      key={task.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        dispatch({ type: 'SELECT_TASK', payload: task.id });
                      }}
                      className={`text-[10px] truncate px-1.5 py-0.5 rounded flex items-center cursor-pointer transition-all ${state.selectedTaskId === task.id ? 'ring-1 ring-blue-400 bg-blue-100 text-blue-800' : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-100'}`}
                    >
                      <div className={`w-1.5 h-1.5 rounded-full mr-1.5 flex-shrink-0 ${PRIORITY_COLORS[task.priority]}`}></div>
                      {task.title}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {Array.from({ length: postCellsCount }).map((_, index) => (
            <div key={`post-${index}`} className="bg-[#fafafa]"></div>
          ))}
        </div>
      </div>
    </div>
  );
}
