import { useEffect, useRef, useState } from 'react'
import { PlusIcon, TrashIcon, ArrowPathIcon, ArrowDownTrayIcon, FolderOpenIcon } from '@heroicons/react/24/solid'
import { NotesIcon } from '../components/Icons'
import { withBasePath } from '../lib/basePath'
import { fetchServerPaths, saveServerPaths } from '../lib/serverPaths'
import DirSetting from '../components/DirSetting'
import NoteEditor from './NoteEditor'
import { downloadMarkdownFile } from './noteMarkdown'
import FileTree from './Notes/FileTree'
import type { NoteTreeNode } from './Notes/FileTree'
import { ChevronRight } from 'lucide-react'

interface Note {
  id: string
  title: string
  date: string
  content: string
  updatedAt: string
  folder?: string
}

function updateTreeNote(nodes: NoteTreeNode[], noteId: string, updater: (node: NoteTreeNode) => NoteTreeNode): NoteTreeNode[] {
  return nodes.map((node) => {
    if (node.type === 'note' && node.note?.id === noteId) {
      return updater(node)
    }

    if (node.type === 'folder' && node.children) {
      return {
        ...node,
        children: updateTreeNote(node.children, noteId, updater)
      }
    }

    return node
  })
}

type NotesConfirmState =
  | {
      type: 'delete'
      noteId: string
      title: string
    }
  | {
      type: 'delete-folder'
      folderPath: string
      folderName: string
    }
  | {
      type: 'migrate'
      currentCount: number
      nextDir: string
      onConfirm: () => void
      onSkip: () => void
    }

type NameDialogState =
  | {
      mode: 'create-folder'
      title: string
      description: string
      label: string
      confirmLabel: string
      value: string
      onConfirm: (value: string) => Promise<void>
    }
  | {
      mode: 'rename-folder' | 'rename-note'
      title: string
      description: string
      label: string
      confirmLabel: string
      value: string
      onConfirm: (value: string) => Promise<void>
    }

export default function NotesApp() {
  const defaultNotesDir = ''
  const [notesTree, setNotesTree] = useState<NoteTreeNode[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null)
  const [revealPath, setRevealPath] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [changingDir, setChangingDir] = useState(false)
  const [toast, setToast] = useState<{ tone: 'success' | 'error' | 'info', message: string } | null>(null)
  const [confirmState, setConfirmState] = useState<NotesConfirmState | null>(null)
  const [nameDialog, setNameDialog] = useState<NameDialogState | null>(null)
  const [storageDir, setStorageDir] = useState(defaultNotesDir)
  const [showCreateMenu, setShowCreateMenu] = useState(false)
  const createMenuRef = useRef<HTMLDivElement | null>(null)
  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const nameDialogOpenRef = useRef(false)

  const activeNote = notes.find(n => n.id === activeNoteId)

  // Load notes
  useEffect(() => {
    void fetchNotes(storageDir)
  }, [storageDir]) // Re-fetch when directory changes

  useEffect(() => {
    fetchServerPaths()
      .then((paths) => setStorageDir(paths.notesDir))
      .catch((error) => console.error('Failed to load notes path config', error))
  }, [])

  const buildNotesUrl = (dir: string) => {
    if (!dir) {
      return withBasePath('/api/system/notes')
    }

    return `${withBasePath('/api/system/notes')}?dir=${encodeURIComponent(dir)}`
  }

  const buildNotesBody = (payload: Record<string, unknown> = {}) => {
    return JSON.stringify({ ...payload, dir: storageDir })
  }

  const showToast = (tone: 'success' | 'error' | 'info', message: string) => {
    setToast({ tone, message })
  }

  const openCurrentDir = () => {
    const base = withBasePath('/proxy/filebrowser/files')
    const target = storageDir ? `${base}${storageDir}` : withBasePath('/proxy/filebrowser/')
    window.open(target, '_blank', 'noopener,noreferrer')
  }

  useEffect(() => {
    if (!toast) {
      return
    }

    const timer = setTimeout(() => setToast(null), 2400)
    return () => clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!revealPath) {
      return
    }

    const timer = window.setTimeout(() => setRevealPath(null), 2200)
    return () => window.clearTimeout(timer)
  }, [revealPath])

  useEffect(() => {
    if (!showCreateMenu) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!createMenuRef.current?.contains(event.target as Node)) {
        setShowCreateMenu(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowCreateMenu(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [showCreateMenu])

  useEffect(() => {
    if (!nameDialog) {
      nameDialogOpenRef.current = false
      return
    }

    // 只在对话框刚打开时聚焦+全选，输入过程中不再触发
    if (nameDialogOpenRef.current) {
      return
    }
    nameDialogOpenRef.current = true

    const timer = window.setTimeout(() => {
      nameInputRef.current?.focus()
      nameInputRef.current?.select()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [nameDialog])

  const fetchNotes = async (dir = storageDir) => {
    try {
      const [listRes, treeRes] = await Promise.all([
        fetch(buildNotesUrl(dir)),
        fetch(`${withBasePath('/api/system/notes/tree')}?dir=${encodeURIComponent(dir)}`)
      ])
      
      const listJson = await listRes.json()
      const treeJson = treeRes.ok ? await treeRes.json() : { success: false }
      
      if (listJson.success) {
        setNotes(listJson.data)
        setNotesTree(treeJson.success ? treeJson.data : listJson.data.map((note: Note) => ({
          type: 'note' as const,
          name: note.title,
          path: note.folder ? `${note.folder}/${note.id}` : note.id,
          note: {
            id: note.id,
            title: note.title,
            updatedAt: note.updatedAt,
            content: note.content
          }
        })))
        
        if (listJson.data.length > 0) {
          const hasActive = listJson.data.some((note: Note) => note.id === activeNoteId)
          setActiveNoteId(hasActive ? activeNoteId : listJson.data[0].id)
        } else {
          setActiveNoteId(null)
        }
      } else {
        throw new Error(listJson.error || treeJson.error || '加载便签失败')
      }
    } catch (e) {
      console.error('Failed to load notes', e)
      setNotes([])
      setNotesTree([])
      setActiveNoteId(null)
    } finally {
      setLoading(false)
    }
  }

  const refreshNotes = async () => {
    setLoading(true)
    await fetchNotes(storageDir)
    showToast('info', '已刷新笔记目录')
  }

  const updateNoteState = (noteId: string, updates: Partial<Note>) => {
    setNotes((currentNotes) => currentNotes.map((note) => note.id === noteId ? { ...note, ...updates } : note))

    if (updates.title !== undefined || updates.updatedAt !== undefined || updates.content !== undefined || updates.folder !== undefined) {
      setNotesTree((currentTree) => updateTreeNote(currentTree, noteId, (node) => ({
        ...node,
        name: updates.title ?? node.name,
        note: node.note
          ? {
              ...node.note,
              title: updates.title ?? node.note.title,
              updatedAt: updates.updatedAt ?? node.note.updatedAt,
              content: updates.content ?? node.note.content,
              folder: updates.folder ?? node.note.folder,
            }
          : node.note,
      })))
    }
  }

  const createNote = async (folderPath: string = '') => {
    setShowCreateMenu(false)
    setCreating(true)
    try {
      const res = await fetch(withBasePath('/api/system/notes'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: buildNotesBody({ title: '无标题笔记', content: '', folder: folderPath })
      })
      const json = await res.json()
      if (json.success) {
        await fetchNotes()
        setActiveNoteId(json.data.id)
        setRevealPath(folderPath ? `${folderPath}/${json.data.id}` : json.data.id)
        showToast('success', '已新建一条便签')
      }
    } catch (e) {
      console.error('Failed to create note', e)
      showToast('error', '新建便签失败')
    } finally {
      setCreating(false)
    }
  }

  const performDeleteNote = async (id: string) => {
    try {
      await fetch(withBasePath(`/api/system/notes/${id}`), { 
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: buildNotesBody()
      })
      await fetchNotes()
    } catch (e) {
      console.error('Failed to delete note', e)
    }
  }

  const openCreateFolderDialog = (parentFolder: string = '') => {
    setShowCreateMenu(false)
    setNameDialog({
      mode: 'create-folder',
      title: '新建文件夹',
      description: parentFolder ? `将在 ${parentFolder} 中创建新文件夹。` : '将在根目录中创建新文件夹。',
      label: '文件夹名称',
      confirmLabel: '创建文件夹',
      value: '',
      onConfirm: async (value: string) => {
        await createFolder(parentFolder, value)
      }
    })
  }

  const createFolder = async (parentFolder: string, folderName: string) => {
    const normalizedFolderName = folderName.trim()
    if (!normalizedFolderName) {
      showToast('error', '文件夹名称不能为空')
      return
    }

    try {
      const path = parentFolder ? `${parentFolder}/${normalizedFolderName}` : normalizedFolderName
      await fetch(withBasePath('/api/system/notes/folders'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: buildNotesBody({ path })
      })
      await fetchNotes()
      setRevealPath(path)
      showToast('success', '已创建文件夹')
    } catch (e) {
      console.error('Failed to create folder', e)
      showToast('error', '创建文件夹失败')
    }
  }

  const moveNote = async (noteId: string, folderPath: string) => {
    try {
      const response = await fetch(withBasePath(`/api/system/notes/${noteId}/move`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: buildNotesBody({ folder: folderPath })
      })
      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || '移动笔记失败')
      }

      await fetchNotes()
      const movedPath = folderPath ? `${folderPath}/${noteId}` : noteId
      setRevealPath(movedPath)
      setActiveNoteId(noteId)
      showToast('success', folderPath ? '已移动到目标文件夹' : '已移动到根目录')
    } catch (error) {
      console.error('Failed to move note', error)
      showToast('error', error instanceof Error ? error.message : '移动笔记失败')
    }
  }

  const submitNameDialog = async () => {
    if (!nameDialog) {
      return
    }

    await nameDialog.onConfirm(nameDialog.value)
    setNameDialog(null)
  }

  const renameFolder = async (folderPath: string, oldName: string, nextName?: string) => {
    if (nextName !== undefined) {
      const newName = nextName.trim()
      if (!newName || newName === oldName) {
        return
      }

      try {
        const basePath = folderPath.substring(0, folderPath.lastIndexOf('/'))
        const newPath = basePath ? `${basePath}/${newName}` : newName

        await fetch(withBasePath('/api/system/notes/folders/rename'), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: buildNotesBody({ oldPath: folderPath, newPath })
        })
        await fetchNotes()
        setRevealPath(newPath)
        showToast('success', '已重命名文件夹')
      } catch (e) {
        console.error('Failed to rename folder', e)
        showToast('error', '重命名文件夹失败')
      }
      return
    }

    setNameDialog({
      mode: 'rename-folder',
      title: '重命名文件夹',
      description: '修改文件夹名称后，内部笔记的目录层级会同步更新。',
      label: '文件夹名称',
      confirmLabel: '保存名称',
      value: oldName,
      onConfirm: async (value: string) => {
        const newName = value.trim()
        if (!newName || newName === oldName) {
          return
        }

        try {
          const basePath = folderPath.substring(0, folderPath.lastIndexOf('/'))
          const newPath = basePath ? `${basePath}/${newName}` : newName

          await fetch(withBasePath('/api/system/notes/folders/rename'), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: buildNotesBody({ oldPath: folderPath, newPath })
          })
          await fetchNotes()
          setRevealPath(newPath)
          showToast('success', '已重命名文件夹')
        } catch (e) {
          console.error('Failed to rename folder', e)
          showToast('error', '重命名文件夹失败')
        }
      }
    })
  }

  const requestDeleteFolder = (folderPath: string, folderName: string) => {
    setConfirmState({ type: 'delete-folder', folderPath, folderName })
  }

  const performDeleteFolder = async (folderPath: string) => {
    try {
      await fetch(withBasePath('/api/system/notes/folders'), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: buildNotesBody({ path: folderPath })
      })
      await fetchNotes()
      showToast('success', '已删除文件夹')
    } catch (e) {
      console.error('Failed to delete folder', e)
      showToast('error', '删除文件夹失败')
    }
  }

  const renameNote = async (noteId: string, currentTitle: string, nextTitle?: string) => {
    if (nextTitle !== undefined) {
      const normalizedTitle = nextTitle.trim()
      if (!normalizedTitle || normalizedTitle === currentTitle) {
        return
      }

      try {
        const nextUpdatedAt = new Date().toISOString()
        updateNoteState(noteId, { title: normalizedTitle, updatedAt: nextUpdatedAt })

        await fetch(withBasePath(`/api/system/notes/${noteId}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: buildNotesBody({ title: normalizedTitle })
        })
        await fetchNotes()
        const matchedNote = notes.find((note) => note.id === noteId)
        setRevealPath(matchedNote?.folder ? `${matchedNote.folder}/${noteId}` : noteId)
        showToast('success', '已重命名笔记')
      } catch (e) {
        console.error('Failed to rename note', e)
        showToast('error', '重命名笔记失败')
      }
      return
    }

    setNameDialog({
      mode: 'rename-note',
      title: '重命名笔记',
      description: '修改笔记名称后，会同步更新本地 Markdown 文件名。',
      label: '笔记名称',
      confirmLabel: '保存名称',
      value: currentTitle,
      onConfirm: async (value: string) => {
        const newTitle = value.trim()
        if (!newTitle || newTitle === currentTitle) {
          return
        }

        try {
          const nextUpdatedAt = new Date().toISOString()
          updateNoteState(noteId, { title: newTitle, updatedAt: nextUpdatedAt })

          await fetch(withBasePath(`/api/system/notes/${noteId}`), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: buildNotesBody({ title: newTitle })
          })
          await fetchNotes()
          setRevealPath(notes.find((note) => note.id === noteId)?.folder ? `${notes.find((note) => note.id === noteId)?.folder}/${noteId}` : noteId)
          showToast('success', '已重命名笔记')
        } catch (e) {
          console.error('Failed to rename note', e)
          showToast('error', '重命名笔记失败')
        }
      }
    })
  }

  const requestDeleteNote = (id: string, title: string) => {
    setConfirmState({ type: 'delete', noteId: id, title })
  }

  // Auto save debounce
  useEffect(() => {
    if (!activeNote) return
    const timer = setTimeout(() => {
      saveNote(activeNote.id, activeNote.title, activeNote.content)
    }, 1000)
    return () => clearTimeout(timer)
  }, [activeNote?.title, activeNote?.content])

  const saveNote = async (id: string, title: string, content: string) => {
    setSaving(true)
    try {
      await fetch(withBasePath(`/api/system/notes/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: buildNotesBody({ title, content })
      })
    } catch (e) {
      console.error('Failed to save note', e)
    } finally {
      setSaving(false)
    }
  }

  const updateActiveNote = (updates: Partial<Note>) => {
    if (!activeNoteId) {
      return
    }

    updateNoteState(activeNoteId, updates)
  }

  const exportActiveNote = () => {
    if (!activeNote) {
      return
    }

    const safeTitle = (activeNote.title || '无标题笔记').replace(/[\\/:*?"<>|]/g, '-').trim() || '无标题笔记'
    downloadMarkdownFile(`${safeTitle}.md`, activeNote.content)
  }

  const exportSpecificNote = (noteId: string) => {
    const noteToExport = notes.find(n => n.id === noteId)
    if (!noteToExport) return
    const safeTitle = (noteToExport.title || '无标题笔记').replace(/[\\/:*?"<>|]/g, '-').trim() || '无标题笔记'
    downloadMarkdownFile(`${safeTitle}.md`, noteToExport.content)
  }

  const changeStorageDir = async (nextDir: string) => {
    const normalizedNextDir = nextDir.trim()
    const normalizedCurrentDir = storageDir.trim()

    if (normalizedNextDir === normalizedCurrentDir) {
      return
    }

    setChangingDir(true)
    try {
      const [currentRes, nextRes] = await Promise.all([
        fetch(buildNotesUrl(normalizedCurrentDir)),
        fetch(buildNotesUrl(normalizedNextDir))
      ])

      const currentJson = await currentRes.json()
      const nextJson = await nextRes.json()

      if (!currentJson.success) {
        throw new Error(currentJson.error || '读取当前目录便签失败')
      }

      if (!nextJson.success) {
        throw new Error(nextJson.error || '读取新目录便签失败')
      }

      const currentNotes: Note[] = currentJson.success ? currentJson.data : []
      const nextNotes: Note[] = nextJson.success ? nextJson.data : []

      let shouldMigrate = false
      if (currentNotes.length > 0) {
        shouldMigrate = await new Promise<boolean>((resolve) => {
          setConfirmState({
            type: 'migrate',
            currentCount: currentNotes.length,
            nextDir: normalizedNextDir,
            onConfirm: () => resolve(true),
            onSkip: () => resolve(false)
          })
        })
      }

      if (shouldMigrate) {
        const migrateRes = await fetch(withBasePath('/api/system/notes/migrate'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fromDir: normalizedCurrentDir, toDir: normalizedNextDir })
        })
        const migrateJson = await migrateRes.json()
        if (!migrateJson.success) {
          throw new Error(migrateJson.error || '迁移失败')
        }
        showToast('success', `已切换到新目录，并迁移 ${migrateJson.data.migrated} 条便签`)
      } else if (nextNotes.length > 0) {
        showToast('info', `已切换到新目录，发现 ${nextNotes.length} 条便签`)
      } else {
        showToast('info', '已切换到新目录，当前目录暂无便签')
      }

      const updatedPaths = await saveServerPaths({ notesDir: normalizedNextDir })
      setStorageDir(updatedPaths.notesDir)
      await fetchNotes(normalizedNextDir)
    } catch (error) {
      console.error('Failed to change notes directory', error)
      const message = error instanceof Error ? error.message : '切换笔记目录失败'
      showToast('error', message)
    } finally {
      setChangingDir(false)
    }
  }

  return (
    <div className="flex h-full bg-[linear-gradient(180deg,#fffdf9_0%,#fffaf1_100%)] text-slate-800">
      {/* Sidebar */}
      <div className="w-72 border-r border-amber-100 bg-white/80 backdrop-blur-sm flex flex-col">
        <div className="p-4 border-b border-amber-100 flex items-center justify-between bg-white/70">
          <h2 className="font-bold text-slate-800 flex items-center">
            <NotesIcon className="w-5 h-5 mr-2" />
            随手小记
          </h2>
          <div className="flex items-center space-x-1">
            {(saving || changingDir || creating) && <ArrowPathIcon className="w-3.5 h-3.5 text-slate-400 animate-spin mr-2" />}
            <button
              type="button"
              onClick={() => void refreshNotes()}
              className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 transition-colors"
              title="刷新笔记目录"
            >
              <ArrowPathIcon className="w-4 h-4" />
            </button>
            <button
              onClick={openCurrentDir}
              className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 transition-colors"
              title={`打开当前笔记目录\n${storageDir}`}
            >
              <FolderOpenIcon className="w-4 h-4" />
            </button>
            <DirSetting 
              label="笔记存储目录" 
              value={storageDir} 
              onChange={(nextDir) => { void changeStorageDir(nextDir) }} 
              description={`默认目录为 ${defaultNotesDir}。切换目录时会检查新目录已有便签，并询问是否迁移旧目录便签。`}
              saveLabel="切换目录"
            />
            <div className="relative" ref={createMenuRef}>
              <button 
                type="button"
                onClick={() => setShowCreateMenu((value) => !value)}
                disabled={creating || changingDir}
                className="p-1 text-slate-400 hover:text-yellow-600 hover:bg-yellow-50 rounded-md transition-colors" 
                title="新建"
              >
                <PlusIcon className="w-5 h-5" />
              </button>
              {showCreateMenu && (
                <div className="absolute right-0 top-9 z-20 min-w-[150px] rounded-xl border border-amber-100 bg-white/95 p-1 shadow-lg backdrop-blur">
                  <button
                    type="button"
                    onClick={() => void createNote('')}
                    className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-amber-50 hover:text-amber-700"
                  >
                    <PlusIcon className="mr-2 h-4 w-4" />
                    新建笔记
                  </button>
                  <button
                    type="button"
                    onClick={() => openCreateFolderDialog('')}
                    className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100"
                  >
                    <FolderOpenIcon className="mr-2 h-4 w-4" />
                    新建文件夹
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="px-4 pt-3 pb-2 text-xs text-slate-500 leading-5">
          像便签一样直接写，底层仍保存为 Markdown，可随时导出。
        </div>

        <div className="flex-1 overflow-auto p-2">
          {loading ? (
            <div className="text-center text-xs text-slate-400 py-4">加载中...</div>
          ) : notesTree.length === 0 ? (
            <div className="text-center text-xs text-slate-400 py-4">暂无笔记</div>
          ) : (
            <FileTree 
              nodes={notesTree}
              activeNoteId={activeNoteId}
              onSelectNote={setActiveNoteId}
              onNewNote={createNote}
              onNewFolder={openCreateFolderDialog}
              onRenameFolder={renameFolder}
              onDeleteFolder={requestDeleteFolder}
              onRenameNote={renameNote}
              onDeleteNote={requestDeleteNote}
              onExportNote={exportSpecificNote}
              onMoveNote={moveNote}
              revealPath={revealPath}
            />
          )}
        </div>
      </div>

      {/* Main Content (Editor) */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeNote ? (
          <>
            <div className="px-10 pt-6 pb-2 flex items-start justify-between gap-6">
              <div className="min-w-0 flex-1 flex flex-col">
                <div className="flex items-center text-xs text-slate-400 mb-2 space-x-1 select-none">
                  {activeNote.folder ? (
                    <>
                      {activeNote.folder.split('/').map((part, index) => (
                        <div key={index} className="flex items-center">
                          {index > 0 && <ChevronRight className="w-3 h-3 mx-1 text-slate-300" />}
                          <span className="hover:text-slate-600 transition-colors">{part}</span>
                        </div>
                      ))}
                    </>
                  ) : (
                    <span>根目录</span>
                  )}
                </div>
                <input 
                  type="text" 
                  value={activeNote.title} 
                  onChange={(e) => updateActiveNote({ title: e.target.value })}
                  className="text-4xl font-black tracking-tight text-slate-900 bg-transparent border-none outline-none w-full placeholder:text-slate-300"
                  placeholder="给这条笔记起个名字"
                />
                <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
                  <span>{saving ? '正在自动保存...' : '自动保存已开启'}</span>
                  <span>最后更新 {new Date(activeNote.updatedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 mt-6">
                <button 
                  onClick={exportActiveNote}
                  className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-white/80 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50 transition-colors"
                  title="导出 Markdown"
                >
                  <ArrowDownTrayIcon className="w-4 h-4" />
                  导出
                </button>
                <button 
                  onClick={() => requestDeleteNote(activeNote.id, activeNote.title || '无标题笔记')}
                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors shrink-0" 
                  title="删除笔记"
                >
                  <TrashIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto px-10 pb-10">
              <div className="mx-auto h-full max-w-4xl">
                <NoteEditor
                  value={activeNote.content}
                  notesDir={storageDir}
                  onChange={(nextContent) => updateActiveNote({ content: nextContent })}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
            新建一条笔记，开始像写便签一样记录内容
          </div>
        )}
      </div>

      {toast && (
        <div className={`absolute right-6 top-6 z-[160] rounded-xl px-4 py-3 shadow-xl text-sm font-medium ${toast.tone === 'success' ? 'bg-emerald-600 text-white' : toast.tone === 'error' ? 'bg-red-600 text-white' : 'bg-slate-900 text-white'}`}>
          {toast.message}
        </div>
      )}

      {confirmState && (
        <div className="absolute inset-0 bg-black/20 backdrop-blur-sm z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-100">
            <div className="p-5">
              {confirmState.type === 'delete' ? (
                <>
                  <h3 className="font-bold text-slate-800 text-lg mb-2">确认删除便签？</h3>
                  <p className="text-sm text-slate-600 leading-6 break-all">
                    删除后无法恢复：{confirmState.title}
                  </p>
                </>
              ) : confirmState.type === 'delete-folder' ? (
                <>
                  <h3 className="font-bold text-slate-800 text-lg mb-2">确认删除文件夹？</h3>
                  <p className="text-sm text-slate-600 leading-6 break-all">
                    删除后将移除此文件夹及其所有子文件夹、笔记：{confirmState.folderName}
                  </p>
                </>
              ) : (
                <>
                  <h3 className="font-bold text-slate-800 text-lg mb-2">迁移旧目录便签？</h3>
                  <p className="text-sm text-slate-600 leading-6">
                    当前目录里有 {confirmState.currentCount} 条便签。你可以把它们合并迁移到新目录，也可以只切换目录不迁移。
                  </p>
                  <div className="mt-3 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-500 break-all">
                    新目录：{confirmState.nextDir || '~/.clawos'}
                  </div>
                </>
              )}
            </div>
            <div className="p-4 bg-slate-50 flex justify-end space-x-3 border-t border-slate-100">
              <button
                onClick={() => {
                  if (confirmState.type === 'delete' || confirmState.type === 'delete-folder') {
                    setConfirmState(null)
                    return
                  }

                  const skipHandler = confirmState.onSkip
                  setConfirmState(null)
                  skipHandler()
                }}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
              >
                {confirmState.type === 'migrate' ? '只切换目录' : '取消'}
              </button>
              <button
                onClick={() => {
                  if (confirmState.type === 'delete') {
                    const noteId = confirmState.noteId
                    setConfirmState(null)
                    void performDeleteNote(noteId)
                    return
                  }

                  if (confirmState.type === 'delete-folder') {
                    const folderPath = confirmState.folderPath
                    setConfirmState(null)
                    void performDeleteFolder(folderPath)
                    return
                  }

                  const confirmHandler = confirmState.onConfirm
                  setConfirmState(null)
                  confirmHandler()
                }}
                className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${confirmState.type === 'migrate' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-red-500 hover:bg-red-600'}`}
              >
                {confirmState.type === 'delete' ? '删除便签' : confirmState.type === 'delete-folder' ? '删除文件夹' : '迁移并切换'}
              </button>
            </div>
          </div>
        </div>
      )}

      {nameDialog && (
        <div className="absolute inset-0 bg-black/20 backdrop-blur-sm z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-100">
            <div className="p-5">
              <h3 className="font-bold text-slate-800 text-lg mb-2">{nameDialog.title}</h3>
              <p className="text-sm text-slate-600 leading-6">{nameDialog.description}</p>
              <div className="mt-4">
                <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-500">
                  {nameDialog.label}
                </label>
                <input
                  ref={nameInputRef}
                  type="text"
                  value={nameDialog.value}
                  onChange={(event) => setNameDialog({ ...nameDialog, value: event.target.value })}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void submitNameDialog()
                    }
                    if (event.key === 'Escape') {
                      setNameDialog(null)
                    }
                  }}
                  placeholder={nameDialog.mode === 'rename-note' ? '例如：周报整理' : '例如：项目资料'}
                  className="w-full rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-amber-400 focus:bg-white focus:ring-4 focus:ring-amber-100"
                />
              </div>
            </div>
            <div className="p-4 bg-slate-50 flex justify-end space-x-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setNameDialog(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void submitNameDialog()}
                disabled={!nameDialog.value.trim()}
                className="px-4 py-2 text-sm font-medium text-white rounded-lg bg-amber-500 hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-amber-300 transition-colors"
              >
                {nameDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
