import { useEffect, useMemo, useState } from 'react';
import { AlignLeft, Calendar, Clock, Tag, Trash2, X } from 'lucide-react';
import TaskDatePicker from './TaskDatePicker';
import { useAppStore } from './store';
import type { Priority, Task } from './types';
import { parseTaskDate } from './date';

const PRIORITY_COLORS: Record<Priority, string> = {
  0: 'border-slate-300',
  1: 'border-blue-400',
  3: 'border-amber-400',
  5: 'border-red-500',
};

function formatDetailDate(task: Task) {
  if (!task.dueDate) {
    return '设置日期';
  }
  const date = parseTaskDate(task.dueDate);
  if (!date) {
    return '设置日期';
  }
  return date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' });
}

function repeatLabel(value?: string) {
  if (!value) return '不重复';
  if (value === 'daily') return '每天';
  if (value === 'weekly') return '每周';
  if (value === 'monthly') return '每月';
  if (value === 'yearly') return '每年';
  return '自定义重复';
}

function reminderLabel(value?: string) {
  if (!value) return '无提醒';
  if (value === '0') return '准时';
  if (value === '-5m') return '提前5分钟';
  if (value === '-30m') return '提前30分钟';
  if (value === '-1h') return '提前1小时';
  if (value === '-1d') return '提前1天';
  return '自定义提醒';
}

export default function TaskDetail() {
  const { state, dispatch, saveTask, removeTask, toggleTaskStatus } = useAppStore();
  const task = useMemo(() => state.tasks.find((item) => item.id === state.selectedTaskId), [state.tasks, state.selectedTaskId]);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!task) {
      return;
    }
    setTitle(task.title);
    setContent(task.content || '');
    setSaveError(null);
  }, [task]);

  if (!task) {
    return (
      <div className="w-80 bg-[#fbfbfb] border-l border-slate-200 flex flex-col justify-center items-center text-slate-400 select-none">
        <svg className="w-24 h-24 text-slate-200 mb-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
          <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" />
          <path d="M15 9L9 15 M9 9l6 6" />
        </svg>
        <span className="font-medium text-sm">点击任务查看详情</span>
        <span className="text-xs opacity-80 mt-2">在这里您可以编辑任务标题、描述和属性</span>
      </div>
    );
  }

  const project = state.projects.find((projectItem) => projectItem.id === task.projectId);
  const isCompleted = task.status === 2;

  const updateTask = async (updates: Partial<Task>) => {
    const mergedTask: Task = { ...task, ...updates };
    dispatch({ type: 'UPDATE_TASK', payload: { id: task.id, ...updates } });
    setSaveError(null);

    try {
      await saveTask(mergedTask);
    } catch (errorObj) {
      dispatch({ type: 'UPDATE_TASK', payload: task });
      setSaveError(errorObj instanceof Error ? errorObj.message : '保存失败');
    }
  };

  const onDelete = async () => {
    setSaveError(null);
    try {
      await removeTask(task);
    } catch (errorObj) {
      setSaveError(errorObj instanceof Error ? errorObj.message : '删除失败');
    }
  };

  const onToggleStatus = async () => {
    setSaveError(null);
    try {
      await toggleTaskStatus(task);
    } catch (errorObj) {
      setSaveError(errorObj instanceof Error ? errorObj.message : '状态更新失败');
    }
  };

  return (
    <div className="w-[360px] bg-white border-l border-slate-200 flex flex-col shadow-[-10px_0_20px_-10px_rgba(0,0,0,0.05)] z-20 overflow-hidden">
      <div className="h-12 px-4 flex items-center justify-between border-b border-slate-100 bg-white flex-shrink-0">
        <div className="flex space-x-2">
          <div className="flex bg-slate-100/50 p-1 rounded-md">
            {([0, 1, 3, 5] as Priority[]).map((priority) => (
              <div
                key={priority}
                onClick={() => void updateTask({ priority })}
                className={`w-6 h-6 rounded cursor-pointer flex items-center justify-center transition-colors ${task.priority === priority ? 'bg-white shadow-sm' : 'hover:bg-slate-200/50'}`}
              >
                <div className={`w-3 h-3 rounded-sm border-2 ${PRIORITY_COLORS[priority]}`}></div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex space-x-2 text-slate-400">
          <Trash2 className="w-5 h-5 cursor-pointer hover:text-red-500 p-0.5 rounded transition-colors" onClick={() => void onDelete()} />
          <X className="w-5 h-5 cursor-pointer hover:text-slate-600 p-0.5 rounded transition-colors" onClick={() => dispatch({ type: 'SELECT_TASK', payload: null })} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 custom-scrollbar">
        <div className="flex items-start mb-6 group">
          <div
            onClick={() => void onToggleStatus()}
            className={`w-5 h-5 mt-1 mr-3 rounded border-[1.5px] cursor-pointer flex items-center justify-center flex-shrink-0 transition-colors ${
              isCompleted ? 'bg-blue-500 border-blue-500' : `${PRIORITY_COLORS[task.priority]} hover:bg-slate-100`
            }`}
          >
            {isCompleted ? (
              <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : null}
          </div>

          <textarea
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => {
              if (title !== task.title) {
                void updateTask({ title });
              }
            }}
            className={`flex-1 text-[17px] font-bold outline-none bg-transparent resize-none overflow-hidden ${isCompleted ? 'line-through text-slate-400' : 'text-slate-800'}`}
            placeholder="准备做什么？"
            rows={1}
            onInput={(event) => {
              event.currentTarget.style.height = 'auto';
              event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`;
            }}
          />
        </div>

        <div className="flex items-center space-x-2 text-sm text-slate-600 mb-6 relative">
          <div
            className={`flex items-center px-3 py-1.5 rounded font-medium cursor-pointer transition-colors ${task.dueDate ? 'bg-blue-50 text-blue-600 hover:bg-blue-100' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
            onClick={() => setShowDatePicker((prev) => !prev)}
          >
            <Calendar className="w-4 h-4 mr-2" />
            {formatDetailDate(task)}
          </div>

          {task.dueDate ? (
            <div className={`flex items-center px-3 py-1.5 rounded cursor-pointer transition-colors ${!task.isAllDay ? 'bg-blue-50 text-blue-600 font-medium hover:bg-blue-100' : 'hover:bg-slate-100 text-slate-500'}`} onClick={() => setShowDatePicker(true)}>
              <Clock className="w-4 h-4 mr-2" />
              {task.isAllDay ? '全天' : (parseTaskDate(task.dueDate)?.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) || '时间异常')}
            </div>
          ) : null}

          {showDatePicker ? (
            <TaskDatePicker
              task={task}
              onSave={(updates) => {
                void updateTask(updates);
              }}
              onClose={() => setShowDatePicker(false)}
            />
          ) : null}
        </div>

        <div className="h-px bg-slate-100 my-6"></div>

        <div className="mb-4 flex items-center gap-2 text-xs text-slate-500">
          <span className="px-2 py-1 bg-slate-100 rounded">提醒: {reminderLabel(task.reminder)}</span>
          <span className="px-2 py-1 bg-slate-100 rounded">重复: {repeatLabel(task.repeat)}</span>
        </div>

        <div className="mb-6 flex items-start">
          <AlignLeft className="w-4 h-4 mr-3 mt-1 text-slate-400" />
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            onBlur={() => {
              if (content !== task.content) {
                void updateTask({ content });
              }
            }}
            placeholder="描述..."
            className="flex-1 w-full min-h-[200px] outline-none resize-none text-[14px] leading-relaxed text-slate-600 bg-transparent placeholder-slate-300"
          ></textarea>
        </div>

        {saveError ? <div className="text-xs text-red-500">{saveError}</div> : null}
      </div>

      <div className="h-12 border-t border-slate-100 bg-[#fbfbfb] flex items-center justify-between px-4 text-xs font-medium flex-shrink-0">
        <div className="flex space-x-2">
          <div className="flex items-center text-slate-500 px-2 py-1.5 rounded">
            <div className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: project?.color || '#cbd5e1' }}></div>
            {project?.name || '收集箱'}
          </div>

          <div className="flex items-center text-slate-500 px-2 py-1.5 rounded">
            <Tag className="w-3.5 h-3.5 mr-1.5 opacity-70" />
            {task.tags.length > 0 ? task.tags.join(', ') : '标签'}
          </div>
        </div>

        <div className="text-[10px] text-slate-400">{state.isSyncing ? '同步中...' : '已同步'}</div>
      </div>
    </div>
  );
}
