export type Priority = 0 | 1 | 3 | 5; // 0: None, 1: Low (Blue), 3: Medium (Yellow), 5: High (Red)
export type TaskStatus = 0 | 2; // 0: Normal, 2: Completed

export interface Task {
  id: string;
  projectId: string;
  title: string;
  content: string; // Markdown description
  priority: Priority;
  status: TaskStatus;
  startDate?: string;
  dueDate?: string;
  isAllDay: boolean;
  reminder?: string;
  repeat?: string;
  tags: string[];
  sortOrder: number;
}

export interface Project {
  id: string;
  name: string;
  color: string;
  isSystem?: boolean; // e.g. "inbox"
}

export interface Tag {
  name: string;
  color: string;
}

export type ViewMode = 'inbox' | 'today' | 'next7' | 'project' | 'tag' | 'calendar';

export interface AppState {
  tasks: Task[];
  projects: Project[];
  tags: Tag[];
  currentView: {
    mode: ViewMode;
    id?: string; // projectId or tagName if mode is 'project' or 'tag'
  };
  selectedTaskId: string | null;
}
