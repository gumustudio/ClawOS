import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { didaApi } from './api';
import { frontendLog } from '../../lib/logger';
import type { AppState, Project, Tag, Task, TaskStatus, ViewMode } from './types';
import { createAppNotifier } from '../notify';

type AppStatus = 'loading' | 'ready' | 'error' | 'unauthorized';

interface StoreState extends AppState {
  appStatus: AppStatus;
  appError: string | null;
  isSyncing: boolean;
}

type Action =
  | { type: 'LOAD_START' }
  | { type: 'LOAD_SUCCESS'; payload: { projects: Project[]; tasks: Task[]; tags: Tag[] } }
  | { type: 'LOAD_UNAUTHORIZED' }
  | { type: 'LOAD_ERROR'; payload: string }
  | { type: 'SET_VIEW'; payload: { mode: ViewMode; id?: string } }
  | { type: 'SELECT_TASK'; payload: string | null }
  | { type: 'ADD_TASK'; payload: Task }
  | { type: 'UPDATE_TASK'; payload: Partial<Task> & { id: string } }
  | { type: 'DELETE_TASK'; payload: string }
  | { type: 'TOGGLE_TASK_STATUS'; payload: string }
  | { type: 'SYNC_START' }
  | { type: 'SYNC_FINISH' }
  | { type: 'SYNC_REVERT'; payload: Task }
  | { type: 'SET_PROJECTS'; payload: Project[] }
  | { type: 'SET_TAGS'; payload: Tag[] }
  | { type: 'BULK_DELETE_TASKS'; payload: string[] }
  | { type: 'BULK_UPDATE_TASKS'; payload: { ids: string[]; updates: Partial<Task> } };

const initialState: StoreState = {
  tasks: [],
  projects: [{ id: 'inbox', name: '收集箱', color: '#3b82f6', isSystem: true }],
  tags: [],
  currentView: { mode: 'inbox' },
  selectedTaskId: null,
  appStatus: 'loading',
  appError: null,
  isSyncing: false,
};

function normalizeProjects(projects: Project[]): Project[] {
  if (projects.some((p) => p.isSystem)) {
    return projects;
  }
  if (projects.some((p) => p.id === 'inbox')) {
    return projects.map((p) => (p.id === 'inbox' ? { ...p, isSystem: true } : p));
  }
  return [{ id: 'inbox', name: '收集箱', color: '#3b82f6', isSystem: true }, ...projects];
}

function reducer(state: StoreState, action: Action): StoreState {
  switch (action.type) {
    case 'LOAD_START':
      return { ...state, appStatus: 'loading', appError: null };
    case 'LOAD_SUCCESS':
      return {
        ...state,
        projects: normalizeProjects(action.payload.projects),
        tasks: action.payload.tasks,
        tags: action.payload.tags,
        appStatus: 'ready',
        appError: null,
      };
    case 'LOAD_UNAUTHORIZED':
      return { ...state, appStatus: 'unauthorized', appError: '滴答未授权，请前往系统设置完成授权' };
    case 'LOAD_ERROR':
      return { ...state, appStatus: 'error', appError: action.payload };
    case 'SET_VIEW':
      return { ...state, currentView: action.payload, selectedTaskId: null };
    case 'SELECT_TASK':
      return { ...state, selectedTaskId: action.payload };
    case 'ADD_TASK':
      return { ...state, tasks: [action.payload, ...state.tasks], selectedTaskId: action.payload.id };
    case 'UPDATE_TASK':
      return {
        ...state,
        tasks: state.tasks.map((task) => (task.id === action.payload.id ? { ...task, ...action.payload } : task)),
      };
    case 'DELETE_TASK':
      return {
        ...state,
        tasks: state.tasks.filter((task) => task.id !== action.payload),
        selectedTaskId: state.selectedTaskId === action.payload ? null : state.selectedTaskId,
      };
    case 'TOGGLE_TASK_STATUS':
      return {
        ...state,
        tasks: state.tasks.map((task) => {
          if (task.id !== action.payload) return task;
          const nextStatus = (task.status === 0 ? 2 : 0) as TaskStatus;
          return { ...task, status: nextStatus };
        }),
      };
    case 'SET_PROJECTS':
      return { ...state, projects: normalizeProjects(action.payload) };
    case 'SET_TAGS':
      return { ...state, tags: action.payload };
    case 'BULK_DELETE_TASKS': {
      const idSet = new Set(action.payload);
      return {
        ...state,
        tasks: state.tasks.filter((task) => !idSet.has(task.id)),
        selectedTaskId: state.selectedTaskId && idSet.has(state.selectedTaskId) ? null : state.selectedTaskId,
      };
    }
    case 'BULK_UPDATE_TASKS': {
      const idSet = new Set(action.payload.ids);
      return {
        ...state,
        tasks: state.tasks.map((task) => (idSet.has(task.id) ? { ...task, ...action.payload.updates } : task)),
      };
    }
    case 'SYNC_START':
      return { ...state, isSyncing: true };
    case 'SYNC_FINISH':
      return { ...state, isSyncing: false };
    case 'SYNC_REVERT':
      return {
        ...state,
        tasks: state.tasks.map((task) => (task.id === action.payload.id ? action.payload : task)),
      };
    default:
      return state;
  }
}

interface AppStoreContextValue {
  state: StoreState;
  dispatch: React.Dispatch<Action>;
  createTask: (draft: Partial<Task> & { title: string; projectId: string }) => Promise<void>;
  saveTask: (task: Task) => Promise<void>;
  removeTask: (task: Task) => Promise<void>;
  toggleTaskStatus: (task: Task) => Promise<void>;
  refresh: () => Promise<void>;
  createProject: (name: string, color: string) => Promise<void>;
  renameProject: (projectId: string, name: string) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  reorderTasks: (orderedTaskIds: string[]) => Promise<void>;
  bulkCompleteTasks: (tasks: Task[]) => Promise<void>;
  bulkDeleteTasks: (tasks: Task[]) => Promise<void>;
  moveTasksToProject: (tasks: Task[], projectId: string) => Promise<void>;
  renameTag: (from: string, to: string) => Promise<void>;
  deleteTag: (tag: string) => Promise<void>;
}

const AppStoreContext = createContext<AppStoreContextValue | null>(null);
const notifyDida = createAppNotifier('dida')

function notifyDidaFailure(title: string, message: string, options?: { dedupeKey?: string; batchKey?: string }) {
  return notifyDida({
    title,
    message,
    level: 'error',
    dedupeKey: options?.dedupeKey,
    batchKey: options?.batchKey,
    batchTitle: title,
    batchMessageBuilder: (count, latestMessage) => `${latestMessage}${count > 1 ? `（近时间段内共 ${count} 次）` : ''}`,
  })
}

function extractErrorMessage(errorObj: unknown): string {
  if (errorObj instanceof Error) return errorObj.message;
  return '未知错误';
}

function buildTagsFromTasks(tasks: Task[]): Tag[] {
  const tagSet = new Set<string>();
  for (const task of tasks) {
    for (const tag of task.tags) tagSet.add(tag);
  }
  return Array.from(tagSet).map((name) => ({ name, color: '#64748b' }));
}

function useAppStoreInternal() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const loadingRef = useRef(false);

  const loadAll = async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    dispatch({ type: 'LOAD_START' });

    try {
      const status = await didaApi.getStatus();
      if (!status.success || !status.connected) {
        dispatch({ type: 'LOAD_UNAUTHORIZED' });
        void notifyDida({
          title: '滴答未授权',
          message: '请前往系统设置完成滴答授权',
          level: 'warning',
          dedupeKey: 'unauthorized',
          dedupeWindowMs: 120_000,
        })
        return;
      }

      const payload = await didaApi.loadAll();
      dispatch({ type: 'LOAD_SUCCESS', payload });
      frontendLog.info('DidaApp', 'Dida data loaded', {
        taskCount: payload.tasks.length,
        projectCount: payload.projects.length,
      });
    } catch (errorObj) {
      const message = extractErrorMessage(errorObj);
      dispatch({ type: 'LOAD_ERROR', payload: message });
      frontendLog.error('DidaApp', 'Load Dida data failed', { message });
      void notifyDidaFailure('滴答同步失败', message, { dedupeKey: `sync:${message}` })
    } finally {
      loadingRef.current = false;
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const createTask = async (draft: Partial<Task> & { title: string; projectId: string }) => {
    dispatch({ type: 'SYNC_START' });
    try {
      const created = await didaApi.createTask(draft);
      dispatch({ type: 'ADD_TASK', payload: created });
      dispatch({ type: 'SET_TAGS', payload: buildTagsFromTasks([created, ...state.tasks]) });
    } catch (errorObj) {
      frontendLog.error('DidaApp', 'Create task failed', { message: extractErrorMessage(errorObj) });
      void notifyDidaFailure('创建任务失败', extractErrorMessage(errorObj), { batchKey: 'task-create-failed' })
      throw errorObj;
    } finally {
      dispatch({ type: 'SYNC_FINISH' });
    }
  };

  const saveTask = async (task: Task) => {
    dispatch({ type: 'SYNC_START' });
    try {
      const updated = await didaApi.updateTask(task);
      dispatch({ type: 'UPDATE_TASK', payload: updated });
      const nextTasks = state.tasks.map((item) => (item.id === updated.id ? updated : item));
      dispatch({ type: 'SET_TAGS', payload: buildTagsFromTasks(nextTasks) });
    } catch (errorObj) {
      frontendLog.error('DidaApp', 'Save task failed', { message: extractErrorMessage(errorObj), taskId: task.id });
      void notifyDidaFailure('保存任务失败', extractErrorMessage(errorObj), { batchKey: 'task-save-failed' })
      throw errorObj;
    } finally {
      dispatch({ type: 'SYNC_FINISH' });
    }
  };

  const removeTask = async (task: Task) => {
    dispatch({ type: 'SYNC_START' });
    const snapshot = task;
    dispatch({ type: 'DELETE_TASK', payload: task.id });

    try {
      await didaApi.deleteTask(task.projectId, task.id);
      dispatch({ type: 'SET_TAGS', payload: buildTagsFromTasks(state.tasks.filter((item) => item.id !== task.id)) });
    } catch (errorObj) {
      dispatch({ type: 'ADD_TASK', payload: snapshot });
      frontendLog.error('DidaApp', 'Delete task failed', { message: extractErrorMessage(errorObj), taskId: task.id });
      void notifyDidaFailure('删除任务失败', extractErrorMessage(errorObj), { batchKey: 'task-delete-failed' })
      throw errorObj;
    } finally {
      dispatch({ type: 'SYNC_FINISH' });
    }
  };

  const toggleTaskStatus = async (task: Task) => {
    const snapshot = task;
    dispatch({ type: 'TOGGLE_TASK_STATUS', payload: task.id });
    dispatch({ type: 'SYNC_START' });

    try {
      if (task.status === 0) {
        await didaApi.completeTask(task.projectId, task.id);
      } else {
        await didaApi.reopenTask(task);
      }
    } catch (errorObj) {
      dispatch({ type: 'SYNC_REVERT', payload: snapshot });
      frontendLog.error('DidaApp', 'Toggle task status failed', { message: extractErrorMessage(errorObj), taskId: task.id });
      void notifyDidaFailure('更新任务状态失败', extractErrorMessage(errorObj), { batchKey: 'task-status-failed' })
      throw errorObj;
    } finally {
      dispatch({ type: 'SYNC_FINISH' });
    }
  };

  const createProject = async (name: string, color: string) => {
    dispatch({ type: 'SYNC_START' });
    try {
      const created = await didaApi.createProject(name, color);
      dispatch({ type: 'SET_PROJECTS', payload: [...state.projects, created] });
      void notifyDida({ title: '清单已创建', message: created.name, level: 'success' })
    } catch (errorObj) {
      void notifyDidaFailure('创建清单失败', extractErrorMessage(errorObj), { batchKey: 'project-create-failed' })
      throw errorObj;
    } finally {
      dispatch({ type: 'SYNC_FINISH' });
    }
  };

  const renameProject = async (projectId: string, name: string) => {
    dispatch({ type: 'SYNC_START' });
    const original = state.projects;
    dispatch({
      type: 'SET_PROJECTS',
      payload: state.projects.map((project) => (project.id === projectId ? { ...project, name } : project)),
    });

    try {
      const current = state.projects.find((project) => project.id === projectId);
      if (!current) throw new Error('project not found');
      const updated = await didaApi.updateProject(projectId, { name, color: current.color });
      dispatch({
        type: 'SET_PROJECTS',
        payload: state.projects.map((project) => (project.id === projectId ? updated : project)),
      });
    } catch (errorObj) {
      dispatch({ type: 'SET_PROJECTS', payload: original });
      void notifyDidaFailure('重命名清单失败', extractErrorMessage(errorObj), { batchKey: 'project-rename-failed' })
      throw errorObj;
    } finally {
      dispatch({ type: 'SYNC_FINISH' });
    }
  };

  const deleteProject = async (projectId: string) => {
    const target = state.projects.find((project) => project.id === projectId);
    if (!target || target.isSystem) return;

    dispatch({ type: 'SYNC_START' });
    const originalProjects = state.projects;
    const originalTasks = state.tasks;
    const inboxProjectId = state.projects.find((project) => project.isSystem)?.id || 'inbox';

    dispatch({ type: 'SET_PROJECTS', payload: state.projects.filter((project) => project.id !== projectId) });
    dispatch({
      type: 'BULK_UPDATE_TASKS',
      payload: {
        ids: state.tasks.filter((task) => task.projectId === projectId).map((task) => task.id),
        updates: { projectId: inboxProjectId },
      },
    });

    try {
      await didaApi.deleteProject(projectId);
    } catch (errorObj) {
      dispatch({ type: 'SET_PROJECTS', payload: originalProjects });
      dispatch({
        type: 'LOAD_SUCCESS',
        payload: {
          projects: originalProjects,
          tasks: originalTasks,
          tags: buildTagsFromTasks(originalTasks),
        },
      });
      void notifyDidaFailure('删除清单失败', extractErrorMessage(errorObj), { batchKey: 'project-delete-failed' })
      throw errorObj;
    } finally {
      dispatch({ type: 'SYNC_FINISH' });
    }
  };

  const reorderTasks = async (orderedTaskIds: string[]) => {
    const rank = new Map(orderedTaskIds.map((id, index) => [id, index]));
    const tasksToUpdate = state.tasks
      .filter((task) => rank.has(task.id))
      .map((task) => ({ ...task, sortOrder: rank.get(task.id) || 0 }));

    dispatch({
      type: 'BULK_UPDATE_TASKS',
      payload: {
        ids: tasksToUpdate.map((task) => task.id),
        updates: {},
      },
    });

    dispatch({ type: 'SYNC_START' });
    try {
      await Promise.all(tasksToUpdate.map((task) => didaApi.updateTask(task)));
      for (const task of tasksToUpdate) {
        dispatch({ type: 'UPDATE_TASK', payload: { id: task.id, sortOrder: task.sortOrder } });
      }
    } finally {
      dispatch({ type: 'SYNC_FINISH' });
    }
  };

  const bulkCompleteTasks = async (tasks: Task[]) => {
    if (tasks.length === 0) return;
    dispatch({ type: 'SYNC_START' });

    const snapshots = tasks.map((task) => ({ ...task }));
    for (const task of tasks) dispatch({ type: 'TOGGLE_TASK_STATUS', payload: task.id });

    try {
      await Promise.all(tasks.map((task) => (task.status === 0 ? didaApi.completeTask(task.projectId, task.id) : didaApi.reopenTask(task))));
    } catch (errorObj) {
      for (const snapshot of snapshots) dispatch({ type: 'SYNC_REVERT', payload: snapshot });
      void notifyDidaFailure('批量状态更新失败', extractErrorMessage(errorObj), { batchKey: 'bulk-status-failed' })
      throw errorObj;
    } finally {
      dispatch({ type: 'SYNC_FINISH' });
    }
  };

  const bulkDeleteTasks = async (tasks: Task[]) => {
    if (tasks.length === 0) return;
    dispatch({ type: 'SYNC_START' });

    const ids = tasks.map((task) => task.id);
    dispatch({ type: 'BULK_DELETE_TASKS', payload: ids });

    try {
      await Promise.all(tasks.map((task) => didaApi.deleteTask(task.projectId, task.id)));
      const remain = state.tasks.filter((task) => !ids.includes(task.id));
      dispatch({ type: 'SET_TAGS', payload: buildTagsFromTasks(remain) });
    } catch (errorObj) {
      dispatch({ type: 'LOAD_SUCCESS', payload: { projects: state.projects, tasks: state.tasks, tags: state.tags } });
      void notifyDidaFailure('批量删除失败', extractErrorMessage(errorObj), { batchKey: 'bulk-delete-failed' })
      throw errorObj;
    } finally {
      dispatch({ type: 'SYNC_FINISH' });
    }
  };

  const moveTasksToProject = async (tasks: Task[], projectId: string) => {
    if (tasks.length === 0) return;
    dispatch({ type: 'SYNC_START' });

    const ids = tasks.map((task) => task.id);
    const snapshots = tasks.map((task) => ({ ...task }));

    dispatch({ type: 'BULK_UPDATE_TASKS', payload: { ids, updates: { projectId } } });

    try {
      await Promise.all(tasks.map((task) => didaApi.updateTask({ ...task, projectId })));
    } catch (errorObj) {
      for (const snapshot of snapshots) dispatch({ type: 'SYNC_REVERT', payload: snapshot });
      void notifyDidaFailure('批量移动失败', extractErrorMessage(errorObj), { batchKey: 'bulk-move-failed' })
      throw errorObj;
    } finally {
      dispatch({ type: 'SYNC_FINISH' });
    }
  };

  const renameTag = async (from: string, to: string) => {
    const targets = state.tasks.filter((task) => task.tags.includes(from));
    if (targets.length === 0) return;

    dispatch({ type: 'SYNC_START' });
    const snapshots = targets.map((task) => ({ ...task }));

    try {
      await Promise.all(
        targets.map((task) => {
          const nextTags = Array.from(new Set(task.tags.map((tag) => (tag === from ? to : tag))));
          return didaApi.updateTask({ ...task, tags: nextTags });
        }),
      );
      await loadAll();
    } catch (errorObj) {
      for (const snapshot of snapshots) dispatch({ type: 'SYNC_REVERT', payload: snapshot });
      void notifyDidaFailure('重命名标签失败', extractErrorMessage(errorObj), { batchKey: 'tag-rename-failed' })
      throw errorObj;
    } finally {
      dispatch({ type: 'SYNC_FINISH' });
    }
  };

  const deleteTag = async (tag: string) => {
    const targets = state.tasks.filter((task) => task.tags.includes(tag));
    if (targets.length === 0) return;

    dispatch({ type: 'SYNC_START' });
    const snapshots = targets.map((task) => ({ ...task }));

    try {
      await Promise.all(
        targets.map((task) => {
          const nextTags = task.tags.filter((item) => item !== tag);
          return didaApi.updateTask({ ...task, tags: nextTags });
        }),
      );
      await loadAll();
    } catch (errorObj) {
      for (const snapshot of snapshots) dispatch({ type: 'SYNC_REVERT', payload: snapshot });
      void notifyDidaFailure('删除标签失败', extractErrorMessage(errorObj), { batchKey: 'tag-delete-failed' })
      throw errorObj;
    } finally {
      dispatch({ type: 'SYNC_FINISH' });
    }
  };

  const contextValue = useMemo<AppStoreContextValue>(
    () => ({
      state,
      dispatch,
      createTask,
      saveTask,
      removeTask,
      toggleTaskStatus,
      refresh: loadAll,
      createProject,
      renameProject,
      deleteProject,
      reorderTasks,
      bulkCompleteTasks,
      bulkDeleteTasks,
      moveTasksToProject,
      renameTag,
      deleteTag,
    }),
    [state],
  );

  return contextValue;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const value = useAppStoreInternal();
  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore() {
  const context = useContext(AppStoreContext);
  if (!context) throw new Error('useAppStore must be used inside AppProvider');
  return context;
}
