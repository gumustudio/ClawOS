import { useMemo, useState } from 'react';
import { ArrowRightLeft, CheckCheck, Plus, RefreshCw, Trash2 } from 'lucide-react';
import TaskItem from './TaskItem';
import { useAppStore } from './store';
import type { Task } from './types';
import { getNaturalTimeFragments, parseNaturalTaskInput } from './naturalInput';
import { parseTaskDate } from './date';

function isSameDay(dateString: string | undefined, compareDate: Date) {
  const date = parseTaskDate(dateString);
  if (!date) return false;
  return date.toDateString() === compareDate.toDateString();
}

function isTaskInView(task: Task, mode: string, id: string | undefined, inboxProjectId: string) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const sevenDaysLater = new Date(now);
  sevenDaysLater.setDate(now.getDate() + 6);
  sevenDaysLater.setHours(23, 59, 59, 999);

  const dueDate = parseTaskDate(task.dueDate);

  if (mode === 'inbox') return task.projectId === inboxProjectId;
  if (mode === 'project') return task.projectId === id;
  if (mode === 'tag') return task.tags.includes(id || '');
  if (mode === 'today') return dueDate ? dueDate <= todayEnd : false;
  if (mode === 'next7') {
    if (!dueDate) return false;
    return dueDate >= now && dueDate <= sevenDaysLater;
  }
  return true;
}

function sortTasks(tasks: Task[]) {
  return [...tasks].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
    const leftDate = left.dueDate ? new Date(left.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    const rightDate = right.dueDate ? new Date(right.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    if (leftDate !== rightDate) return leftDate - rightDate;
    return right.priority - left.priority;
  });
}

function formatNext7GroupLabel(date: Date, todayStart: Date) {
  const tomorrow = new Date(todayStart);
  tomorrow.setDate(todayStart.getDate() + 1);

  if (date.toDateString() === todayStart.toDateString()) return '今天';
  if (date.toDateString() === tomorrow.toDateString()) return '明天';

  const weekday = date.toLocaleDateString('zh-CN', { weekday: 'short' });
  const md = date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
  return `${weekday} ${md}`;
}

export default function TaskList() {
  const {
    state,
    createTask,
    bulkCompleteTasks,
    bulkDeleteTasks,
    moveTasksToProject,
    reorderTasks,
    refresh,
  } = useAppStore();

  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);

  const inboxProjectId = state.projects.find((project) => project.isSystem)?.id || 'inbox';

  const currentViewTitle = () => {
    switch (state.currentView.mode) {
      case 'inbox': return '收集箱';
      case 'today': return '今天';
      case 'next7': return '最近7天';
      case 'project': return state.projects.find((project) => project.id === state.currentView.id)?.name || '未知清单';
      case 'tag': return `#${state.currentView.id}`;
      case 'calendar': return '日历';
      default: return '';
    }
  };

  const scopedTasks = useMemo(
    () => sortTasks(state.tasks.filter((task) => isTaskInView(task, state.currentView.mode, state.currentView.id, inboxProjectId))),
    [state.tasks, state.currentView.mode, state.currentView.id, inboxProjectId],
  );

  const activeTasks = scopedTasks.filter((task) => task.status === 0);
  const completedTasks = scopedTasks.filter((task) => task.status === 2);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const overdueTasks =
    state.currentView.mode === 'today'
      ? activeTasks.filter((task) => {
          const due = parseTaskDate(task.dueDate);
          return due ? due < todayStart : false;
        })
      : [];

  const todayTasks =
    state.currentView.mode === 'today'
      ? activeTasks.filter((task) => isSameDay(task.dueDate, todayStart))
      : activeTasks;

  const next7Groups =
    state.currentView.mode === 'next7'
      ? Object.entries(
          activeTasks.reduce<Record<string, Task[]>>((acc, task) => {
            const due = parseTaskDate(task.dueDate);
            if (!due) return acc;
            const key = due.toDateString();
            if (!acc[key]) acc[key] = [];
            acc[key].push(task);
            return acc;
          }, {}),
        )
          .map(([key, tasks]) => ({ key, date: new Date(key), tasks }))
          .sort((a, b) => a.date.getTime() - b.date.getTime())
      : [];

  const inboxGroups =
    state.currentView.mode === 'inbox'
      ? (() => {
          const tomorrowStart = new Date(todayStart);
          tomorrowStart.setDate(todayStart.getDate() + 1);

          const dayAfterTomorrowStart = new Date(todayStart);
          dayAfterTomorrowStart.setDate(todayStart.getDate() + 2);

          const next7End = new Date(todayStart);
          next7End.setDate(todayStart.getDate() + 7);
          next7End.setHours(23, 59, 59, 999);

          const groups: Record<'today' | 'tomorrow' | 'next7' | 'farther' | 'noDate', Task[]> = {
            today: [],
            tomorrow: [],
            next7: [],
            farther: [],
            noDate: [],
          };

          for (const task of activeTasks) {
            const due = parseTaskDate(task.dueDate);
            if (!due) {
              groups.noDate.push(task);
              continue;
            }

            if (due < tomorrowStart) {
              groups.today.push(task);
              continue;
            }

            if (due < dayAfterTomorrowStart) {
              groups.tomorrow.push(task);
              continue;
            }

            if (due <= next7End) {
              groups.next7.push(task);
              continue;
            }

            groups.farther.push(task);
          }

          return [
            { key: 'today', label: '今天', tasks: groups.today, tone: 'text-blue-500' },
            { key: 'tomorrow', label: '明天', tasks: groups.tomorrow, tone: 'text-cyan-500' },
            { key: 'next7', label: '接下来7天', tasks: groups.next7, tone: 'text-indigo-500' },
            { key: 'farther', label: '更远', tasks: groups.farther, tone: 'text-slate-500' },
            { key: 'noDate', label: '没有日期', tasks: groups.noDate, tone: 'text-slate-500' },
          ];
        })()
      : [];

  const selectedTasks = state.tasks.filter((task) => selectedTaskIds.includes(task.id));

  const handleAddTask = async (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || !newTaskTitle.trim()) return;

    setCreateError(null);
    const projectId = state.currentView.mode === 'project' && state.currentView.id ? state.currentView.id : inboxProjectId;
    const tags = state.currentView.mode === 'tag' && state.currentView.id ? [state.currentView.id] : [];

    const parsed = parseNaturalTaskInput(newTaskTitle);
    const fallbackDueDate = state.currentView.mode === 'today' && !parsed.dueDate ? new Date().toISOString() : undefined;

    try {
      await createTask({
        title: parsed.title,
        projectId,
        content: '',
        priority: 0,
        isAllDay: parsed.isAllDay,
        tags,
        dueDate: parsed.dueDate || fallbackDueDate,
        reminder: parsed.reminder,
      });
      setNewTaskTitle('');
    } catch (errorObj) {
      setCreateError(errorObj instanceof Error ? errorObj.message : '创建任务失败');
    }
  };

  const toggleSelection = (taskId: string, checked: boolean) => {
    if (checked) {
      setSelectedTaskIds((prev) => (prev.includes(taskId) ? prev : [...prev, taskId]));
      return;
    }
    setSelectedTaskIds((prev) => prev.filter((id) => id !== taskId));
  };

  const clearSelection = () => {
    setSelectionMode(false);
    setSelectedTaskIds([]);
  };

  const onBulkComplete = async () => {
    try {
      await bulkCompleteTasks(selectedTasks);
      clearSelection();
    } catch (errorObj) {
      setCreateError(errorObj instanceof Error ? errorObj.message : '批量完成失败');
    }
  };

  const onBulkDelete = async () => {
    const confirmed = window.confirm(`确认删除选中的 ${selectedTasks.length} 个任务？`);
    if (!confirmed) return;
    try {
      await bulkDeleteTasks(selectedTasks);
      clearSelection();
    } catch (errorObj) {
      setCreateError(errorObj instanceof Error ? errorObj.message : '批量删除失败');
    }
  };

  const onBulkMove = async () => {
    const options = state.projects.filter((project) => !project.isSystem);
    if (options.length === 0) return;

    const targetName = window.prompt(`输入目标清单名称:\n${options.map((project) => `- ${project.name}`).join('\n')}`);
    if (!targetName) return;

    const target = options.find((project) => project.name === targetName.trim());
    if (!target) {
      setCreateError('目标清单不存在');
      return;
    }

    try {
      await moveTasksToProject(selectedTasks, target.id);
      clearSelection();
    } catch (errorObj) {
      setCreateError(errorObj instanceof Error ? errorObj.message : '批量移动失败');
    }
  };

  const onDragStart = (taskId: string) => (event: React.DragEvent<HTMLDivElement>) => {
    setDragTaskId(taskId);
    event.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (_taskId: string) => (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const onDrop = (targetTaskId: string) => async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!dragTaskId || dragTaskId === targetTaskId) return;

    const current = activeTasks.map((task) => task.id);
    const fromIndex = current.indexOf(dragTaskId);
    const toIndex = current.indexOf(targetTaskId);
    if (fromIndex < 0 || toIndex < 0) return;

    const next = [...current];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);

    try {
      await reorderTasks(next);
    } catch (errorObj) {
      setCreateError(errorObj instanceof Error ? errorObj.message : '排序失败');
    } finally {
      setDragTaskId(null);
    }
  };

  const onRefresh = async () => {
    setCreateError(null);
    try {
      await refresh();
    } catch (errorObj) {
      setCreateError(errorObj instanceof Error ? errorObj.message : '刷新失败');
    }
  };

  const fragments = getNaturalTimeFragments(newTaskTitle);

  const renderInputPreview = () => {
    if (!newTaskTitle.trim()) {
      return <span className="text-slate-400">{`添加任务至「${currentViewTitle()}」，回车保存`}</span>;
    }

    const escapedFragments = fragments
      .slice()
      .sort((a, b) => b.length - a.length)
      .map((fragment) => fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

    if (escapedFragments.length === 0) {
      return <span>{newTaskTitle}</span>;
    }

    const regex = new RegExp(`(${escapedFragments.join('|')})`, 'g');
    const parts = newTaskTitle.split(regex);

    return (
      <>
        {parts.map((part, index) =>
          fragments.includes(part) ? (
            <span key={`${part}-${index}`} className="bg-amber-100 text-amber-700 rounded-sm">{part}</span>
          ) : (
            <span key={`${part}-${index}`}>{part}</span>
          ),
        )}
      </>
    );
  };

  if (state.appStatus === 'loading') {
    return <div className="flex-1 border-r border-slate-200 bg-white flex items-center justify-center text-slate-500">正在同步滴答数据...</div>;
  }
  if (state.appStatus === 'unauthorized') {
    return <div className="flex-1 border-r border-slate-200 bg-white flex items-center justify-center text-slate-500">未授权滴答账号，请前往系统设置完成授权。</div>;
  }
  if (state.appStatus === 'error') {
    return <div className="flex-1 border-r border-slate-200 bg-white flex items-center justify-center text-red-500">同步失败：{state.appError || '未知错误'}</div>;
  }

  return (
    <div className="flex-1 border-r border-slate-200 bg-white flex flex-col min-w-[300px]">
      <div className="h-14 flex items-center justify-between px-6 border-b border-transparent sticky top-0 bg-white z-10">
        <h2 className="text-xl font-bold text-slate-800">{currentViewTitle()}</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={() => void onRefresh()}
            className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${state.isSyncing ? 'animate-spin' : ''}`} />
            刷新
          </button>
          <div className="text-slate-400 text-sm font-medium">{activeTasks.length} 项</div>
        </div>
      </div>

      <div className="px-4 pt-1 pb-2 bg-white border-b border-slate-100 flex items-center justify-between text-xs text-slate-500">
        <button className="hover:text-slate-700" onClick={() => { setSelectionMode((prev) => !prev); setSelectedTaskIds([]); }}>
          {selectionMode ? '退出多选' : '多选'}
        </button>
        {selectionMode ? <span>已选 {selectedTaskIds.length}</span> : <span>拖拽可排序</span>}
      </div>

      {selectionMode && selectedTaskIds.length > 0 ? (
        <div className="px-4 py-2 border-b border-slate-100 bg-slate-50 flex items-center gap-2 text-xs">
          <button onClick={() => void onBulkComplete()} className="px-2 py-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 flex items-center gap-1"><CheckCheck className="w-3 h-3" />完成</button>
          <button onClick={() => void onBulkMove()} className="px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 flex items-center gap-1"><ArrowRightLeft className="w-3 h-3" />移动</button>
          <button onClick={() => void onBulkDelete()} className="px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 flex items-center gap-1"><Trash2 className="w-3 h-3" />删除</button>
          <button onClick={clearSelection} className="ml-auto px-2 py-1 rounded bg-white border border-slate-200">取消</button>
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto pb-20 custom-scrollbar">
        <div className="px-4 pt-2 pb-4 sticky top-0 bg-white z-10">
          <div className="bg-slate-100/50 hover:bg-slate-100 transition-colors border border-transparent hover:border-slate-200 rounded-lg p-2.5 flex items-center shadow-sm">
            <Plus className="w-5 h-5 text-blue-500 mr-2.5 flex-shrink-0" />
            <div className="relative flex-1">
              <div className="absolute inset-0 text-sm font-medium leading-5 tracking-normal whitespace-pre pointer-events-none overflow-hidden py-[1px]">
                {renderInputPreview()}
              </div>
              <input
                type="text"
                value={newTaskTitle}
                onChange={(event) => setNewTaskTitle(event.target.value)}
                onKeyDown={handleAddTask}
                className="relative w-full bg-transparent outline-none text-sm font-medium leading-5 tracking-normal text-transparent caret-slate-700 selection:bg-blue-200 py-[1px]"
              />
            </div>
          </div>
          {createError ? <div className="text-xs text-red-500 mt-2">{createError}</div> : null}
        </div>

        <div className="space-y-1">
          {activeTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400">
              <div className="w-16 h-16 bg-slate-100 rounded-full mb-4 flex items-center justify-center">
                <svg className="w-8 h-8 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M8 12h8 M12 8v8" />
                </svg>
              </div>
              <span className="text-sm font-medium">当前视图下没有任务</span>
              <span className="text-xs mt-1 opacity-70">点击上方输入框添加新任务</span>
            </div>
          ) : state.currentView.mode === 'inbox' ? (
            <>
              {inboxGroups.map((group) => (
                <div key={group.key}>
                  <div className={`px-4 pt-2 text-[11px] font-semibold ${group.tone}`}>{group.label}</div>
                  {group.tasks.length === 0 ? (
                    <div className="px-6 py-1 text-[11px] text-slate-300">暂无任务</div>
                  ) : (
                    group.tasks.map((task) => (
                      <TaskItem
                        key={task.id}
                        task={task}
                        selectable={selectionMode}
                        selected={selectedTaskIds.includes(task.id)}
                        onSelect={toggleSelection}
                        dragHandleProps={{
                          draggable: !selectionMode,
                          onDragStart: onDragStart(task.id),
                          onDragOver: onDragOver(task.id),
                          onDrop: onDrop(task.id),
                        }}
                      />
                    ))
                  )}
                </div>
              ))}
            </>
          ) : state.currentView.mode === 'today' ? (
            <>
              {overdueTasks.length > 0 ? (
                <>
                  <div className="px-4 pt-1 text-[11px] font-semibold text-red-500">逾期</div>
                  {overdueTasks.map((task) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      selectable={selectionMode}
                      selected={selectedTaskIds.includes(task.id)}
                      onSelect={toggleSelection}
                      dragHandleProps={{
                        draggable: !selectionMode,
                        onDragStart: onDragStart(task.id),
                        onDragOver: onDragOver(task.id),
                        onDrop: onDrop(task.id),
                      }}
                    />
                  ))}
                </>
              ) : null}

              {todayTasks.length > 0 ? (
                <>
                  <div className="px-4 pt-2 text-[11px] font-semibold text-blue-500">今天</div>
                  {todayTasks.map((task) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      selectable={selectionMode}
                      selected={selectedTaskIds.includes(task.id)}
                      onSelect={toggleSelection}
                      dragHandleProps={{
                        draggable: !selectionMode,
                        onDragStart: onDragStart(task.id),
                        onDragOver: onDragOver(task.id),
                        onDrop: onDrop(task.id),
                      }}
                    />
                  ))}
                </>
              ) : null}
            </>
          ) : state.currentView.mode === 'next7' ? (
            <>
              {next7Groups.map((group) => (
                <div key={group.key}>
                  <div className="px-4 pt-2 text-[11px] font-semibold text-indigo-500">
                    {formatNext7GroupLabel(group.date, todayStart)}
                  </div>
                  {group.tasks.map((task) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      selectable={selectionMode}
                      selected={selectedTaskIds.includes(task.id)}
                      onSelect={toggleSelection}
                      dragHandleProps={{
                        draggable: !selectionMode,
                        onDragStart: onDragStart(task.id),
                        onDragOver: onDragOver(task.id),
                        onDrop: onDrop(task.id),
                      }}
                    />
                  ))}
                </div>
              ))}
            </>
          ) : (
            activeTasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                selectable={selectionMode}
                selected={selectedTaskIds.includes(task.id)}
                onSelect={toggleSelection}
                dragHandleProps={{
                  draggable: !selectionMode,
                  onDragStart: onDragStart(task.id),
                  onDragOver: onDragOver(task.id),
                  onDrop: onDrop(task.id),
                }}
              />
            ))
          )}

          {completedTasks.length > 0 ? (
            <div className="mx-2 mt-4 border-t border-slate-100 pt-2">
              <button onClick={() => setShowCompleted((prev) => !prev)} className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1">
                {showCompleted ? '隐藏' : '显示'}已完成 ({completedTasks.length})
              </button>
              {showCompleted ? (
                <div className="space-y-1 mt-1">
                  {completedTasks.map((task) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      selectable={selectionMode}
                      selected={selectedTaskIds.includes(task.id)}
                      onSelect={toggleSelection}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
