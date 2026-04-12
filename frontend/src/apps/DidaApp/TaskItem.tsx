import { Calendar, GripVertical, Hash } from 'lucide-react';
import { useAppStore } from './store';
import type { Priority, Task } from './types';
import { parseTaskDate } from './date';

const PRIORITY_COLORS: Record<Priority, string> = {
  0: 'border-slate-300',
  1: 'border-blue-400 bg-blue-50',
  3: 'border-amber-400 bg-yellow-50',
  5: 'border-red-500 bg-red-50',
};

function formatDueDate(dueDate?: string) {
  if (!dueDate) return '';
  const date = parseTaskDate(dueDate);
  if (!date) return '';
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

interface TaskItemProps {
  task: Task;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (taskId: string, checked: boolean) => void;
  dragHandleProps?: {
    draggable: boolean;
    onDragStart: (event: React.DragEvent<HTMLDivElement>) => void;
    onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
    onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  };
}

export default function TaskItem({ task, selectable, selected, onSelect, dragHandleProps }: TaskItemProps) {
  const { state, dispatch, toggleTaskStatus } = useAppStore();
  const isSelected = state.selectedTaskId === task.id;
  const isCompleted = task.status === 2;
  const project = state.projects.find((projectItem) => projectItem.id === task.projectId);

  const onToggleStatus = async (event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      await toggleTaskStatus(task);
    } catch {
      // logged by store
    }
  };

  return (
    <div
      onClick={() => dispatch({ type: 'SELECT_TASK', payload: task.id })}
      className={`group flex items-start px-4 py-2.5 mx-2 rounded-lg cursor-pointer border-l-2 transition-all duration-200 ${
        isSelected ? 'bg-blue-50 shadow-sm border-blue-500' : 'bg-transparent border-transparent hover:bg-slate-50'
      } ${isCompleted ? 'opacity-60' : ''}`}
      draggable={dragHandleProps?.draggable}
      onDragStart={dragHandleProps?.onDragStart}
      onDragOver={dragHandleProps?.onDragOver}
      onDrop={dragHandleProps?.onDrop}
    >
      {selectable ? (
        <input
          type="checkbox"
          checked={Boolean(selected)}
          onChange={(event) => onSelect?.(task.id, event.target.checked)}
          onClick={(event) => event.stopPropagation()}
          className="mt-1.5 mr-2"
        />
      ) : null}

      {dragHandleProps ? <GripVertical className="w-4 h-4 mt-1 mr-2 text-slate-300 group-hover:text-slate-500" /> : null}

      <div
        onClick={onToggleStatus}
        className={`w-4 h-4 mt-0.5 rounded flex items-center justify-center flex-shrink-0 cursor-pointer border-[1.5px] transition-colors ${
          isCompleted ? 'bg-blue-500 border-blue-500' : `${PRIORITY_COLORS[task.priority]} hover:bg-slate-100`
        }`}
      >
        {isCompleted ? (
          <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : null}
      </div>

      <div className="ml-3 flex-1 overflow-hidden flex flex-col min-h-6 justify-center">
        <div className={`text-[14px] leading-relaxed truncate ${isCompleted ? 'line-through text-slate-500' : 'text-slate-800'}`}>{task.title}</div>

        <div className="flex items-center space-x-3 mt-1.5 overflow-hidden text-[11px] font-medium opacity-0 max-h-0 group-hover:max-h-10 group-hover:opacity-100 transition-all duration-300 ease-out">
          {task.dueDate ? (
            <div className={`flex items-center space-x-1 ${isCompleted ? 'text-slate-400' : 'text-blue-500'}`}>
              <Calendar className="w-3 h-3" />
              <span>{formatDueDate(task.dueDate)}</span>
            </div>
          ) : null}

          {project ? (
            <div className="flex items-center space-x-1 text-slate-500">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: project.color }} />
              <span>{project.name}</span>
            </div>
          ) : null}

          {task.tags.map((tag) => {
            const tagObj = state.tags.find((tagItem) => tagItem.name === tag);
            return (
              <div key={tag} className="flex items-center space-x-0.5" style={{ color: tagObj?.color || '#94a3b8' }}>
                <Hash className="w-2.5 h-2.5" />
                <span>{tag}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
