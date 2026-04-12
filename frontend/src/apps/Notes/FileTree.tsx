import { useEffect, useRef, useState } from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { ChevronRight, ChevronDown, Folder, FileText, Plus, Edit2, Trash2, Download } from 'lucide-react';

export type NoteTreeNode = {
  type: 'folder' | 'note';
  name: string;
  path: string;
  children?: NoteTreeNode[];
  note?: {
    id: string;
    title: string;
    updatedAt: string;
    content: string;
    folder?: string;
  };
};

interface FileTreeProps {
  nodes: NoteTreeNode[];
  activeNoteId: string | null;
  onSelectNote: (noteId: string) => void;
  onNewNote: (folderPath: string) => void;
  onNewFolder: (folderPath: string) => void;
  onRenameFolder: (folderPath: string, oldName: string, nextName?: string) => void | Promise<void>;
  onDeleteFolder: (folderPath: string, folderName: string) => void;
  onRenameNote: (noteId: string, currentTitle: string, nextTitle?: string) => void | Promise<void>;
  onDeleteNote: (noteId: string, title: string) => void;
  onExportNote: (noteId: string) => void;
  onMoveNote: (noteId: string, folderPath: string) => void | Promise<void>;
  level?: number;
  enableBlankAreaMenu?: boolean;
  revealPath?: string | null;
}

type EditingNodeState =
  | { type: 'folder'; key: string; originalValue: string; value: string }
  | { type: 'note'; key: string; originalValue: string; value: string };

function findPathByNoteId(nodes: NoteTreeNode[], noteId: string): string | null {
  for (const node of nodes) {
    if (node.type === 'note' && node.note?.id === noteId) {
      return node.path;
    }

    if (node.type === 'folder' && node.children) {
      const nestedMatch = findPathByNoteId(node.children, noteId);
      if (nestedMatch) {
        return nestedMatch;
      }
    }
  }

  return null;
}

function buildAncestorPaths(targetPath: string, includeSelf: boolean): string[] {
  const segments = targetPath.split('/').filter(Boolean);
  const maxLength = includeSelf ? segments.length : segments.length - 1;
  const ancestors: string[] = [];

  for (let index = 0; index < maxLength; index += 1) {
    ancestors.push(segments.slice(0, index + 1).join('/'));
  }

  return ancestors;
}

function escapeSelectorValue(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }

  return value.replace(/([\\"])|\//g, '\\$&');
}

export default function FileTree({
  nodes,
  activeNoteId,
  onSelectNote,
  onNewNote,
  onNewFolder,
  onRenameFolder,
  onDeleteFolder,
  onRenameNote,
  onDeleteNote,
  onExportNote,
  onMoveNote,
  level = 0,
  enableBlankAreaMenu = true,
  revealPath = null,
}: FileTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [editingNode, setEditingNode] = useState<EditingNodeState | null>(null);
  const [dragOverFolderPath, setDragOverFolderPath] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const isFirstRenderRef = useRef(true);

  const menuContentClassName = 'min-w-[170px] bg-white rounded-lg shadow-lg border border-slate-100 p-1 z-50 text-sm overflow-hidden animate-in fade-in zoom-in-95';
  const menuItemClassName = 'flex items-center px-2 py-1.5 cursor-pointer outline-none hover:bg-slate-100 rounded text-slate-700 data-[highlighted]:bg-slate-100';
  const dangerMenuItemClassName = 'flex items-center px-2 py-1.5 cursor-pointer outline-none hover:bg-red-50 hover:text-red-600 rounded text-red-600 data-[highlighted]:bg-red-50 data-[highlighted]:text-red-600';

  const toggleFolder = (path: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedFolders(newExpanded);
  };

  const startFolderRename = (folderPath: string, currentName: string) => {
    setEditingNode({ type: 'folder', key: folderPath, originalValue: currentName, value: currentName });
  };

  const startNoteRename = (noteId: string, currentTitle: string) => {
    setEditingNode({ type: 'note', key: noteId, originalValue: currentTitle, value: currentTitle });
  };

  const commitEditingNode = async () => {
    if (!editingNode) {
      return;
    }

    const nextValue = editingNode.value.trim();
    const currentEditingNode = editingNode;
    setEditingNode(null);

    if (!nextValue || nextValue === currentEditingNode.originalValue) {
      return;
    }

    if (currentEditingNode.type === 'folder') {
      await onRenameFolder(currentEditingNode.key, currentEditingNode.originalValue, nextValue);
      return;
    }

    await onRenameNote(currentEditingNode.key, currentEditingNode.originalValue, nextValue);
  };

  const cancelEditingNode = () => {
    setEditingNode(null);
  };

  useEffect(() => {
    if (!enableBlankAreaMenu || !revealPath) {
      return;
    }

    setExpandedFolders((currentExpanded) => {
      const nextExpanded = new Set(currentExpanded);
      buildAncestorPaths(revealPath, true).forEach((folderPath) => nextExpanded.add(folderPath));
      return nextExpanded;
    });

    const timer = window.setTimeout(() => {
      const selector = `[data-tree-path="${escapeSelectorValue(revealPath)}"]`;
      rootRef.current?.querySelector<HTMLElement>(selector)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 80);

    return () => window.clearTimeout(timer);
  }, [enableBlankAreaMenu, revealPath]);

  useEffect(() => {
    if (!enableBlankAreaMenu || !activeNoteId) {
      return;
    }

    // 首次渲染时不自动展开，保持文件夹全部折叠
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }

    const notePath = findPathByNoteId(nodes, activeNoteId);
    if (!notePath) {
      return;
    }

    setExpandedFolders((currentExpanded) => {
      const nextExpanded = new Set(currentExpanded);
      buildAncestorPaths(notePath, false).forEach((folderPath) => nextExpanded.add(folderPath));
      return nextExpanded;
    });

    const timer = window.setTimeout(() => {
      const selector = `[data-tree-note-id="${escapeSelectorValue(activeNoteId)}"]`;
      rootRef.current?.querySelector<HTMLElement>(selector)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 80);

    return () => window.clearTimeout(timer);
  }, [activeNoteId, enableBlankAreaMenu, nodes]);

  const renderCreateActions = (folderPath: string) => (
    <>
      <ContextMenu.Item
        className="flex items-center px-2 py-1.5 cursor-pointer outline-none hover:bg-amber-50 hover:text-amber-700 rounded text-slate-700 data-[highlighted]:bg-amber-50 data-[highlighted]:text-amber-700"
        onSelect={() => onNewNote(folderPath)}
      >
        <Plus className="w-4 h-4 mr-2" />
        新建笔记
      </ContextMenu.Item>
      <ContextMenu.Item
        className={menuItemClassName}
        onSelect={() => onNewFolder(folderPath)}
      >
        <Folder className="w-4 h-4 mr-2" />
        新建文件夹
      </ContextMenu.Item>
    </>
  );

  const treeContent = (
    <div ref={rootRef} className="w-full select-none">
      {nodes.map((node) => {
        const isExpanded = expandedFolders.has(node.path);

        if (node.type === 'folder') {
          return (
            <ContextMenu.Root key={node.path}>
              <ContextMenu.Trigger>
                <div
                  data-tree-path={node.path}
                  className={`flex items-center group cursor-pointer rounded-md py-1 px-2 text-sm text-slate-700 transition-colors my-0.5 ${revealPath === node.path ? 'bg-amber-100/70 ring-1 ring-amber-200' : 'hover:bg-slate-100'} ${dragOverFolderPath === node.path ? 'bg-amber-50 ring-1 ring-amber-300' : ''}`}
                  style={{ paddingLeft: `${level * 12 + 8}px` }}
                  onClick={() => toggleFolder(node.path)}
                  onDoubleClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    startFolderRename(node.path, node.name);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                    setDragOverFolderPath(node.path);
                  }}
                  onDragLeave={() => {
                    if (dragOverFolderPath === node.path) {
                      setDragOverFolderPath(null);
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setDragOverFolderPath(null);

                    const noteId = event.dataTransfer.getData('application/x-clawos-note-id');
                    const sourceFolder = event.dataTransfer.getData('application/x-clawos-note-folder');
                    if (!noteId || sourceFolder === node.path) {
                      return;
                    }

                    void onMoveNote(noteId, node.path);
                  }}
                >
                  <span className="w-4 h-4 mr-1 text-slate-400 flex items-center justify-center">
                    {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  </span>
                  <Folder className="w-4 h-4 mr-2 text-amber-500 shrink-0" />
                  {editingNode?.type === 'folder' && editingNode.key === node.path ? (
                    <input
                      autoFocus
                      value={editingNode.value}
                      onChange={(event) => setEditingNode({ ...editingNode, value: event.target.value })}
                      onClick={(event) => event.stopPropagation()}
                      onBlur={() => void commitEditingNode()}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void commitEditingNode();
                        }
                        if (event.key === 'Escape') {
                          event.preventDefault();
                          cancelEditingNode();
                        }
                      }}
                      className="h-7 flex-1 rounded-md border border-amber-200 bg-white px-2 text-sm text-slate-800 outline-none ring-0 focus:border-amber-400"
                    />
                  ) : (
                    <span className="truncate flex-1">{node.name}</span>
                  )}
                </div>
              </ContextMenu.Trigger>
              <ContextMenu.Portal>
                <ContextMenu.Content className={menuContentClassName}>
                  {renderCreateActions(node.path)}
                  <ContextMenu.Separator className="h-px bg-slate-100 my-1 mx-1" />
                  <ContextMenu.Item
                    className={menuItemClassName}
                    onSelect={() => startFolderRename(node.path, node.name)}
                  >
                    <Edit2 className="w-4 h-4 mr-2" />
                    重命名
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    className={dangerMenuItemClassName}
                    onSelect={() => onDeleteFolder(node.path, node.name)}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    删除
                  </ContextMenu.Item>
                </ContextMenu.Content>
              </ContextMenu.Portal>

              {isExpanded && node.children && (
                <FileTree
                  nodes={node.children}
                  activeNoteId={activeNoteId}
                  onSelectNote={onSelectNote}
                  onNewNote={onNewNote}
                  onNewFolder={onNewFolder}
                  onRenameFolder={onRenameFolder}
                  onDeleteFolder={onDeleteFolder}
                  onRenameNote={onRenameNote}
                  onDeleteNote={onDeleteNote}
                  onExportNote={onExportNote}
                  onMoveNote={onMoveNote}
                  level={level + 1}
                  enableBlankAreaMenu={false}
                  revealPath={revealPath}
                />
              )}
            </ContextMenu.Root>
          );
        }

        // Note Node
        const isActive = activeNoteId === node.note?.id;
        const parentFolder = node.note?.folder ?? '';
        
        return (
          <ContextMenu.Root key={node.note!.id}>
            <ContextMenu.Trigger>
              <div
                data-tree-path={node.path}
                data-tree-note-id={node.note!.id}
                draggable
                className={`flex flex-col group cursor-pointer rounded-md py-1.5 px-2 transition-all my-0.5 ${
                  isActive 
                    ? 'bg-amber-100/50 text-amber-900 border border-amber-200/50 shadow-sm' 
                    : 'text-slate-600 hover:bg-white hover:shadow-sm border border-transparent'
                }`}
                style={{ paddingLeft: `${level * 12 + 12}px` }}
                onClick={() => onSelectNote(node.note!.id)}
                onDoubleClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  startNoteRename(node.note!.id, node.note!.title);
                }}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('application/x-clawos-note-id', node.note!.id);
                  event.dataTransfer.setData('application/x-clawos-note-folder', parentFolder);
                }}
                onDragEnd={() => {
                  setDragOverFolderPath(null);
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center flex-1 min-w-0">
                    <FileText className={`w-3.5 h-3.5 mr-2 shrink-0 ${isActive ? 'text-amber-600' : 'text-slate-400'}`} />
                    {editingNode?.type === 'note' && editingNode.key === node.note!.id ? (
                      <input
                        autoFocus
                        value={editingNode.value}
                        onChange={(event) => setEditingNode({ ...editingNode, value: event.target.value })}
                        onClick={(event) => event.stopPropagation()}
                        onBlur={() => void commitEditingNode()}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            void commitEditingNode();
                          }
                          if (event.key === 'Escape') {
                            event.preventDefault();
                            cancelEditingNode();
                          }
                        }}
                        className="h-7 flex-1 rounded-md border border-amber-200 bg-white px-2 text-sm text-slate-800 outline-none ring-0 focus:border-amber-400"
                      />
                    ) : (
                      <span className={`text-sm truncate font-medium ${isActive ? 'text-amber-900' : 'text-slate-700'}`}>
                        {node.note!.title || '无标题笔记'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </ContextMenu.Trigger>
            <ContextMenu.Portal>
              <ContextMenu.Content className={menuContentClassName}>
                {renderCreateActions(parentFolder)}
                <ContextMenu.Separator className="h-px bg-slate-100 my-1 mx-1" />
                <ContextMenu.Item
                  className={menuItemClassName}
                  onSelect={() => startNoteRename(node.note!.id, node.note!.title)}
                >
                  <Edit2 className="w-4 h-4 mr-2" />
                  重命名
                </ContextMenu.Item>
                <ContextMenu.Item
                  className={menuItemClassName}
                  onSelect={() => onExportNote(node.note!.id)}
                >
                  <Download className="w-4 h-4 mr-2" />
                  导出
                </ContextMenu.Item>
                <ContextMenu.Separator className="h-px bg-slate-100 my-1 mx-1" />
                <ContextMenu.Item
                  className={dangerMenuItemClassName}
                  onSelect={() => onDeleteNote(node.note!.id, node.note!.title)}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  删除
                </ContextMenu.Item>
              </ContextMenu.Content>
            </ContextMenu.Portal>
            </ContextMenu.Root>
        );
      })}
      {enableBlankAreaMenu && (
        <div
          className="h-24"
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            setDragOverFolderPath('');
          }}
          onDragLeave={() => {
            if (dragOverFolderPath === '') {
              setDragOverFolderPath(null);
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragOverFolderPath(null);
            const noteId = event.dataTransfer.getData('application/x-clawos-note-id');
            if (!noteId) {
              return;
            }
            void onMoveNote(noteId, '');
          }}
        />
      )}
    </div>
  );

  if (!enableBlankAreaMenu) {
    return treeContent;
  }

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger>{treeContent}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className={menuContentClassName}>
          {renderCreateActions('')}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
