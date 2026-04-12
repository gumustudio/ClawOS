import CalendarView from './CalendarView';
import Sidebar from './Sidebar';
import TaskDetail from './TaskDetail';
import TaskList from './TaskList';
import { AppProvider, useAppStore } from './store';

function AppContent() {
  const { state } = useAppStore();

  return (
    <div className="flex h-full w-full bg-white text-slate-800 font-sans shadow-inner overflow-hidden rounded-b-2xl">
      <Sidebar />
      {state.currentView.mode === 'calendar' ? <CalendarView /> : <TaskList />}
      <TaskDetail />
    </div>
  );
}

export default function DidaApp() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
