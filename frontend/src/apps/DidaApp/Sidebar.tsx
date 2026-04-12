import { Calendar, CalendarDays, CalendarRange, Circle, Hash, Inbox, Plus, Trash2, Pencil } from 'lucide-react';
import { useState } from 'react';
import { useAppStore } from './store';
import type { ViewMode } from './types';

interface NavItemProps {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  mode: ViewMode;
  id?: string;
  color?: string;
  currentMode: ViewMode;
  currentId?: string;
  onClick: (mode: ViewMode, id?: string) => void;
  actions?: React.ReactNode;
}

function NavItem({ icon: Icon, label, mode, id, color = '#64748b', currentMode, currentId, onClick, actions }: NavItemProps) {
  const isActive = currentMode === mode && currentId === id;
  return (
    <div
      onClick={() => onClick(mode, id)}
      className={`group px-3 py-1.5 flex items-center text-[13px] rounded-lg cursor-pointer transition-colors mb-0.5 ${
        isActive ? 'bg-blue-50/80 text-blue-600 font-medium' : 'text-slate-700 hover:bg-slate-100/60'
      }`}
    >
      <Icon className={`w-4 h-4 mr-2.5 ${isActive ? 'text-blue-500' : ''}`} style={{ color: isActive ? '#3b82f6' : color }} />
      <span className="flex-1 truncate">{label}</span>
      {actions ? <span className="opacity-0 group-hover:opacity-100 transition-opacity">{actions}</span> : null}
    </div>
  );
}

const PRESET_COLORS = ['#3b82f6', '#10b981', '#ef4444', '#f59e0b', '#8b5cf6', '#06b6d4'];

export default function Sidebar() {
  const { state, dispatch, createProject, renameProject, deleteProject, renameTag, deleteTag } = useAppStore();
  const [newProjectName, setNewProjectName] = useState('');
  const [showProjectInput, setShowProjectInput] = useState(false);
  const [tagEditTarget, setTagEditTarget] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState('');

  const handleNav = (mode: ViewMode, id?: string) => {
    dispatch({ type: 'SET_VIEW', payload: { mode, id } });
  };

  const onCreateProject = async (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    if (!newProjectName.trim()) return;

    const color = PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)];
    await createProject(newProjectName.trim(), color);
    setNewProjectName('');
    setShowProjectInput(false);
  };

  const onRenameProject = async (projectId: string, currentName: string) => {
    const next = window.prompt('重命名清单', currentName);
    if (!next || next.trim() === currentName) return;
    await renameProject(projectId, next.trim());
  };

  const onDeleteProject = async (projectId: string, projectName: string) => {
    const confirmed = window.confirm(`确认删除清单「${projectName}」？清单内任务将回收到收集箱。`);
    if (!confirmed) return;
    await deleteProject(projectId);
  };

  const beginRenameTag = (tagName: string) => {
    setTagEditTarget(tagName);
    setTagDraft(tagName);
  };

  const commitRenameTag = async () => {
    if (!tagEditTarget) return;
    const next = tagDraft.trim();
    if (!next || next === tagEditTarget) {
      setTagEditTarget(null);
      return;
    }
    await renameTag(tagEditTarget, next);
    setTagEditTarget(null);
  };

  return (
    <div className="w-64 border-r border-slate-200 bg-[#f8fafc] flex flex-col select-none">
      <div className="h-14 flex items-center px-4 border-b border-transparent">
        <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-blue-400 to-indigo-400 flex items-center justify-center text-white text-xs font-bold shadow-sm">CW</div>
        <span className="ml-3 font-semibold text-[14px] text-slate-800">Chris Wong</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
        <div className="mb-4 space-y-0.5">
          <NavItem icon={Inbox} label="收集箱" mode="inbox" color="#3b82f6" currentMode={state.currentView.mode} currentId={state.currentView.id} onClick={handleNav} />
          <NavItem icon={Calendar} label="今天" mode="today" color="#eab308" currentMode={state.currentView.mode} currentId={state.currentView.id} onClick={handleNav} />
          <NavItem icon={CalendarDays} label="最近7天" mode="next7" color="#a855f7" currentMode={state.currentView.mode} currentId={state.currentView.id} onClick={handleNav} />
          <NavItem icon={CalendarRange} label="日历" mode="calendar" color="#ec4899" currentMode={state.currentView.mode} currentId={state.currentView.id} onClick={handleNav} />
        </div>

        <div className="mb-4">
          <div className="px-3 flex items-center justify-between group mb-1 text-slate-400 hover:text-slate-600 cursor-pointer">
            <span className="text-xs font-bold tracking-wider">清单</span>
            <Plus className="w-3.5 h-3.5" onClick={() => setShowProjectInput((prev) => !prev)} />
          </div>

          {showProjectInput ? (
            <div className="px-3 mb-2">
              <input
                value={newProjectName}
                onChange={(event) => setNewProjectName(event.target.value)}
                onKeyDown={onCreateProject}
                onBlur={() => setShowProjectInput(false)}
                autoFocus
                placeholder="输入清单名称回车创建"
                className="w-full text-xs px-2 py-1 border border-slate-200 rounded bg-white outline-none focus:border-blue-400"
              />
            </div>
          ) : null}

          <div className="space-y-0.5">
            {state.projects
              .filter((project) => !project.isSystem)
              .map((project) => (
                <NavItem
                  key={project.id}
                  icon={Circle}
                  label={project.name}
                  mode="project"
                  id={project.id}
                  color={project.color}
                  currentMode={state.currentView.mode}
                  currentId={state.currentView.id}
                  onClick={handleNav}
                  actions={
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          void onRenameProject(project.id, project.name);
                        }}
                        className="p-0.5 rounded hover:bg-white/80"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          void onDeleteProject(project.id, project.name);
                        }}
                        className="p-0.5 rounded hover:bg-white/80"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  }
                />
              ))}
          </div>
        </div>

        <div className="mb-4">
          <div className="px-3 flex items-center justify-between group mb-1 text-slate-400 hover:text-slate-600 cursor-pointer">
            <span className="text-xs font-bold tracking-wider">标签</span>
          </div>

          <div className="flex flex-wrap gap-1.5 px-3 mt-2">
            {state.tags.map((tag) => {
              const isActive = state.currentView.mode === 'tag' && state.currentView.id === tag.name;

              if (tagEditTarget === tag.name) {
                return (
                  <input
                    key={tag.name}
                    value={tagDraft}
                    onChange={(event) => setTagDraft(event.target.value)}
                    onBlur={() => void commitRenameTag()}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void commitRenameTag();
                      if (event.key === 'Escape') setTagEditTarget(null);
                    }}
                    autoFocus
                    className="text-xs px-2 py-1 border border-blue-300 rounded bg-white outline-none w-24"
                  />
                );
              }

              return (
                <div
                  key={tag.name}
                  onClick={() => handleNav('tag', tag.name)}
                  className={`group flex items-center px-2 py-1 rounded-md text-xs cursor-pointer border ${
                    isActive ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <Hash className="w-3 h-3 mr-1" style={{ color: tag.color }} />
                  {tag.name}
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      beginRenameTag(tag.name);
                    }}
                    className="ml-1 opacity-0 group-hover:opacity-100"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      void deleteTag(tag.name);
                    }}
                    className="ml-0.5 opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
