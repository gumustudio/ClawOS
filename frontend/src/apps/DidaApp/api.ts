import { withBasePath } from '../../lib/basePath';
import type { Priority, Project, Task } from './types';
import { normalizeDidaDateForJs, toDidaApiDate } from './date';

interface DidaProjectDto {
  id: string;
  name: string;
  color?: string;
  kind?: string;
}

interface DidaTaskDto {
  id: string;
  projectId: string;
  title: string;
  content?: string;
  priority?: number;
  status?: number;
  startDate?: string;
  dueDate?: string;
  isAllDay?: boolean;
  repeatFlag?: string;
  reminders?: string[];
  tags?: string[];
  sortOrder?: number;
}

interface DidaProjectDataDto {
  project?: DidaProjectDto;
  tasks?: DidaTaskDto[];
}

interface DidaColumnDto {
  id: string;
  projectId: string;
  name?: string;
  sortOrder?: number;
}

interface DidaInboxDataDto {
  tasks?: DidaTaskDto[];
  columns?: DidaColumnDto[];
}

function normalizePriority(rawPriority: number | undefined): Priority {
  if (rawPriority === 5 || rawPriority === 3 || rawPriority === 1) return rawPriority;
  return 0;
}

function toDidaRepeatFlag(value?: string): string | undefined {
  if (!value || value === 'none') return undefined;
  if (value.startsWith('RRULE:')) return value;
  if (value === 'daily') return 'RRULE:FREQ=DAILY';
  if (value === 'weekly') return 'RRULE:FREQ=WEEKLY';
  if (value === 'monthly') return 'RRULE:FREQ=MONTHLY';
  if (value === 'yearly') return 'RRULE:FREQ=YEARLY';
  return undefined;
}

function fromDidaRepeatFlag(value?: string): string | undefined {
  if (!value) return undefined;
  if (value.includes('FREQ=DAILY')) return 'daily';
  if (value.includes('FREQ=WEEKLY')) return 'weekly';
  if (value.includes('FREQ=MONTHLY')) return 'monthly';
  if (value.includes('FREQ=YEARLY')) return 'yearly';
  return value;
}

function toDidaReminder(value?: string): string | undefined {
  if (!value || value === 'none') return undefined;
  if (value.startsWith('TRIGGER:')) return value;
  if (value === '0') return 'TRIGGER:PT0S';
  if (value === '-5m') return 'TRIGGER:-PT5M';
  if (value === '-30m') return 'TRIGGER:-PT30M';
  if (value === '-1h') return 'TRIGGER:-PT1H';
  if (value === '-1d') return 'TRIGGER:-P1D';
  return undefined;
}

function fromDidaReminder(value?: string): string | undefined {
  if (!value) return undefined;
  if (value.includes('PT0S')) return '0';
  if (value.includes('PT5M')) return '-5m';
  if (value.includes('PT30M')) return '-30m';
  if (value.includes('PT1H')) return '-1h';
  if (value.includes('P1D')) return '-1d';
  return value;
}

function normalizeTask(task: DidaTaskDto): Task {
  return {
    id: task.id,
    projectId: task.projectId,
    title: task.title || '未命名任务',
    content: task.content || '',
    priority: normalizePriority(task.priority),
    status: task.status === 2 ? 2 : 0,
    startDate: normalizeDidaDateForJs(task.startDate),
    dueDate: normalizeDidaDateForJs(task.dueDate),
    isAllDay: task.isAllDay !== false,
    repeat: fromDidaRepeatFlag(task.repeatFlag),
    reminder: fromDidaReminder(task.reminders?.[0]),
    tags: Array.isArray(task.tags) ? task.tags : [],
    sortOrder: task.sortOrder ?? 0,
  };
}

function normalizeProject(project: DidaProjectDto): Project {
  return {
    id: project.id,
    name: project.name || '未命名清单',
    color: project.color || '#3b82f6',
    isSystem: project.kind === 'INBOX' || project.id === 'inbox',
  };
}

async function proxy<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(withBasePath(`/api/system/dida/proxy/${path}`), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  });

  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    const detail = typeof payload === 'string' ? payload : JSON.stringify(payload);
    throw new Error(`Dida API ${path} failed (${response.status}): ${detail}`);
  }

  return payload as T;
}

async function fetchAllProjectsData(projects: Project[]): Promise<Task[]> {
  const allTasks: Task[] = [];

  await Promise.all(
    projects.map(async (project) => {
      const data = await proxy<DidaProjectDataDto>(`project/${project.id}/data`);
      const tasks = (data.tasks || []).map(normalizeTask);
      allTasks.push(...tasks);
    }),
  );

  const dedupMap = new Map<string, Task>();
  for (const task of allTasks) dedupMap.set(task.id, task);
  return Array.from(dedupMap.values());
}

async function fetchInboxData(): Promise<{ inboxProject: Project; tasks: Task[] }> {
  const inboxData = await proxy<DidaInboxDataDto>('project/inbox/data');
  const inboxTasks = (inboxData.tasks || []).map(normalizeTask);
  const inboxProjectId =
    inboxTasks[0]?.projectId || inboxData.columns?.[0]?.projectId || 'inbox';

  return {
    inboxProject: {
      id: inboxProjectId,
      name: '收集箱',
      color: '#3b82f6',
      isSystem: true,
    },
    tasks: inboxTasks,
  };
}

export const didaApi = {
  getStatus: async () => {
    const result = await fetch(withBasePath('/api/system/dida/status'));
    return (await result.json()) as { success: boolean; connected: boolean; error?: string };
  },

  loadAll: async () => {
    const projectDtos = await proxy<DidaProjectDto[]>('project');
    const projects = projectDtos.map(normalizeProject);

    const inbox = await fetchInboxData();
    const projectTasks = await fetchAllProjectsData(projects);
    const tasks = [...inbox.tasks, ...projectTasks];

    const allProjects = [inbox.inboxProject, ...projects.filter((project) => project.id !== inbox.inboxProject.id)];

    const tagNames = new Set<string>();
    for (const task of tasks) {
      for (const tag of task.tags) tagNames.add(tag);
    }

    return {
      projects: allProjects,
      tasks,
      tags: Array.from(tagNames).map((name) => ({ name, color: '#64748b' })),
    };
  },

  createProject: async (name: string, color: string) => {
    const created = await proxy<DidaProjectDto>('project', {
      method: 'POST',
      body: JSON.stringify({ name, color }),
    });
    return normalizeProject(created);
  },

  updateProject: async (projectId: string, payload: { name?: string; color?: string }) => {
    const updated = await proxy<DidaProjectDto>(`project/${projectId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return normalizeProject(updated);
  },

  deleteProject: async (projectId: string) => {
    await proxy<unknown>(`project/${projectId}`, { method: 'DELETE' });
  },

  createTask: async (task: Partial<Task> & { title: string; projectId: string }) => {
    const reminder = toDidaReminder(task.reminder);
    const normalizedDueDate = toDidaApiDate(task.dueDate);
    const normalizedStartDate = toDidaApiDate(task.startDate || normalizedDueDate);
    const payload = {
      projectId: task.projectId,
      title: task.title,
      content: task.content || '',
      priority: task.priority ?? 0,
      startDate: task.isAllDay === false ? normalizedStartDate : toDidaApiDate(task.startDate),
      dueDate: normalizedDueDate,
      isAllDay: task.isAllDay ?? true,
      repeatFlag: toDidaRepeatFlag(task.repeat),
      reminders: reminder ? [reminder] : [],
      tags: task.tags || [],
      sortOrder: task.sortOrder,
    };
    const created = await proxy<DidaTaskDto>('task', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return normalizeTask(created);
  },

  updateTask: async (task: Task) => {
    const reminder = toDidaReminder(task.reminder);
    const payload = {
      id: task.id,
      projectId: task.projectId,
      title: task.title,
      content: task.content,
      priority: task.priority,
      status: task.status,
      startDate: toDidaApiDate(task.startDate),
      dueDate: toDidaApiDate(task.dueDate),
      isAllDay: task.isAllDay,
      repeatFlag: toDidaRepeatFlag(task.repeat),
      reminders: reminder ? [reminder] : [],
      tags: task.tags,
      sortOrder: task.sortOrder,
    };
    const updated = await proxy<DidaTaskDto>(`task/${task.id}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return normalizeTask(updated);
  },

  completeTask: async (projectId: string, taskId: string) => {
    await proxy<unknown>(`project/${projectId}/task/${taskId}/complete`, { method: 'POST' });
  },

  reopenTask: async (task: Task) => {
    await didaApi.updateTask({ ...task, status: 0 });
  },

  deleteTask: async (projectId: string, taskId: string) => {
    await proxy<unknown>(`project/${projectId}/task/${taskId}`, { method: 'DELETE' });
  },
};
