import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export type NoteRecord = {
  id: string;
  title: string;
  date: string;
  content: string;
  updatedAt: string;
  fileName?: string;
  folder?: string;
};

export type NoteTreeNode = {
  type: 'folder' | 'note';
  name: string;
  path: string;
  children?: NoteTreeNode[];
  note?: NoteRecord;
};

type FolderEntry = {
  name: string;
  path: string;
};

const notesWriteQueue = new Map<string, Promise<void>>();

function slugifyFileName(value: string) {
  const normalized = value
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-');

  return normalized || '无标题笔记';
}

function getSafePath(baseDir: string, relativeTarget: string) {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(resolvedBase, relativeTarget || '');
  if (!resolvedTarget.startsWith(resolvedBase)) {
    throw new Error('Invalid path: Directory traversal detected');
  }
  return resolvedTarget;
}

function getMarkdownFilePath(notesDir: string, note: Pick<NoteRecord, 'id' | 'title' | 'folder'>) {
  const folderPath = getSafePath(notesDir, note.folder || '');
  return path.join(folderPath, `${slugifyFileName(note.title)}-${note.id}.md`);
}

function buildMarkdownDocument(note: NoteRecord) {
  return [
    '---',
    `id: ${note.id}`,
    `title: ${JSON.stringify(note.title)}`,
    `updatedAt: ${note.updatedAt}`,
    '---',
    '',
    note.content || ''
  ].join('\n');
}

function parseFrontMatter(content: string) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { meta: {}, body: content };
  }

  const [, rawMeta, body] = match;
  const meta: Record<string, string> = {};

  rawMeta.split('\n').forEach((line) => {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      return;
    }

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    meta[key] = rawValue;
  });

  return { meta, body };
}

function parseMetaValue(value: string | undefined) {
  if (!value) {
    return '';
  }

  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }

  return value;
}

function deriveTitleFromMarkdown(body: string, fallback: string) {
  const heading = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith('# '));

  if (heading) {
    return heading.slice(2).trim() || fallback;
  }

  return fallback;
}

async function readLegacyNotesJson(notesDir: string): Promise<NoteRecord[]> {
  const notesFile = path.join(notesDir, 'notes.json');

  try {
    const data = await fs.readFile(notesFile, 'utf-8');
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed as NoteRecord[] : [];
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return [];
    }

    throw new Error(`read legacy notes json failed: ${error.message}`);
  }
}

async function writeMarkdownAtomically(targetPath: string, content: string) {
  const pendingWrite = notesWriteQueue.get(targetPath) ?? Promise.resolve();

  const nextWrite = pendingWrite.then(async () => {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    const tempFile = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tempFile, content, 'utf-8');
    await fs.rename(tempFile, targetPath);
  });

  notesWriteQueue.set(targetPath, nextWrite.catch(() => undefined));
  await nextWrite;
}

async function deleteIfExists(filePath: string) {
  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      await fs.rm(filePath, { recursive: true, force: true });
    } else {
      await fs.unlink(filePath);
    }
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

export async function ensureNotesMigrated(notesDir: string) {
  const legacyNotes = await readLegacyNotesJson(notesDir);
  if (legacyNotes.length === 0) {
    return;
  }

  await Promise.all(legacyNotes.map(async (note) => {
    const noteWithFileName = {
      ...note,
      folder: '',
      fileName: path.basename(getMarkdownFilePath(notesDir, note))
    };
    await writeMarkdownAtomically(getMarkdownFilePath(notesDir, noteWithFileName), buildMarkdownDocument(noteWithFileName));
  }));

  await deleteIfExists(path.join(notesDir, 'notes.json'));
}

async function scanDirectoryRecursive(baseDir: string, currentDir: string): Promise<NoteRecord[]> {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  const notes: NoteRecord[] = [];

  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    
    // Skip assets folder and hidden files/folders
    if (entry.name === 'assets' || entry.name.startsWith('.')) {
      continue;
    }

    if (entry.isDirectory()) {
      const subNotes = await scanDirectoryRecursive(baseDir, fullPath);
      notes.push(...subNotes);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const relativeFolder = path.relative(baseDir, currentDir);
      
      const content = await fs.readFile(fullPath, 'utf-8');
      const { meta, body } = parseFrontMatter(content);
      const stats = await fs.stat(fullPath);

      const title = deriveTitleFromMarkdown(body.trim(), parseMetaValue(meta.title) || entry.name.replace(/-[^-]+\.md$/, ''));
      const updatedAt = parseMetaValue(meta.updatedAt) || stats.mtime.toISOString();
      const id = parseMetaValue(meta.id) || entry.name.replace(/\.md$/, '');

      notes.push({
        id,
        title,
        date: new Date(updatedAt).toISOString().split('T')[0],
        content: body.replace(/^\n+/, ''),
        updatedAt,
        fileName: entry.name,
        folder: relativeFolder === '' ? undefined : relativeFolder.replace(/\\/g, '/')
      });
    }
  }

  return notes;
}

async function scanFoldersRecursive(baseDir: string, currentDir: string): Promise<FolderEntry[]> {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  const folders: FolderEntry[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'assets' || entry.name.startsWith('.')) {
      continue;
    }

    const fullPath = path.join(currentDir, entry.name);
    const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

    folders.push({
      name: entry.name,
      path: relativePath,
    });

    const subFolders = await scanFoldersRecursive(baseDir, fullPath);
    folders.push(...subFolders);
  }

  return folders;
}

export async function readNotesDir(notesDir: string): Promise<NoteRecord[]> {
  try {
    await fs.mkdir(notesDir, { recursive: true });
    await ensureNotesMigrated(notesDir);

    const notes = await scanDirectoryRecursive(notesDir, notesDir);
    return notes.sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
  } catch (error: any) {
    throw new Error(`read notes dir failed: ${error.message}`);
  }
}

export async function getNotesTree(notesDir: string): Promise<NoteTreeNode[]> {
  await fs.mkdir(notesDir, { recursive: true });
  await ensureNotesMigrated(notesDir);

  const [notes, folders] = await Promise.all([
    readNotesDir(notesDir),
    scanFoldersRecursive(notesDir, notesDir),
  ]);
  const root: NoteTreeNode[] = [];
  const folderMap = new Map<string, NoteTreeNode>();

  // Ensure directories are created in the tree
  const getOrCreateFolder = (folderPath: string): NoteTreeNode[] => {
    if (!folderPath) return root;
    
    if (folderMap.has(folderPath)) {
      return folderMap.get(folderPath)!.children!;
    }

    const parts = folderPath.split('/');
    let currentPath = '';
    let currentChildren = root;

    for (const part of parts) {
      if (!part) continue;
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      
      if (!folderMap.has(currentPath)) {
        const newNode: NoteTreeNode = {
          type: 'folder',
          name: part,
          path: currentPath,
          children: []
        };
        currentChildren.push(newNode);
        folderMap.set(currentPath, newNode);
      }
      currentChildren = folderMap.get(currentPath)!.children!;
    }

    return currentChildren;
  };

  for (const folder of folders) {
    getOrCreateFolder(folder.path);
  }

  for (const note of notes) {
    const parentChildren = getOrCreateFolder(note.folder || '');
    parentChildren.push({
      type: 'note',
      name: note.title,
      path: note.folder ? `${note.folder}/${note.fileName}` : (note.fileName || ''),
      note
    });
  }

  return root;
}

export async function createNoteInDir(notesDir: string, note: NoteRecord): Promise<NoteRecord> {
  const targetDir = getSafePath(notesDir, note.folder || '');
  await fs.mkdir(targetDir, { recursive: true });
  
  const filePath = getMarkdownFilePath(notesDir, note);
  const fileName = path.basename(filePath);
  
  await writeMarkdownAtomically(filePath, buildMarkdownDocument({ ...note, fileName }));
  return { ...note, fileName };
}

export async function updateNoteInDir(notesDir: string, note: NoteRecord): Promise<NoteRecord> {
  const currentNotes = await readNotesDir(notesDir);
  const existingNote = currentNotes.find((currentNote) => currentNote.id === note.id);
  
  const targetDir = getSafePath(notesDir, note.folder || '');
  await fs.mkdir(targetDir, { recursive: true });
  
  const nextFilePath = getMarkdownFilePath(notesDir, note);
  const nextFileName = path.basename(nextFilePath);

  if (existingNote?.fileName) {
    const oldFilePath = getSafePath(notesDir, path.join(existingNote.folder || '', existingNote.fileName));
    if (oldFilePath !== nextFilePath) {
      await deleteIfExists(oldFilePath);
    }
  }

  await writeMarkdownAtomically(nextFilePath, buildMarkdownDocument({ ...note, fileName: nextFileName }));
  return { ...note, fileName: nextFileName };
}

export async function moveNote(notesDir: string, noteId: string, newFolder: string): Promise<NoteRecord | null> {
  const currentNotes = await readNotesDir(notesDir);
  const note = currentNotes.find((currentNote) => currentNote.id === noteId);
  if (!note) return null;

  return updateNoteInDir(notesDir, { ...note, folder: newFolder });
}

export async function deleteNoteFromDir(notesDir: string, noteId: string): Promise<void> {
  const currentNotes = await readNotesDir(notesDir);
  const note = currentNotes.find((currentNote) => currentNote.id === noteId);
  if (!note?.fileName) {
    return;
  }

  const filePath = getSafePath(notesDir, path.join(note.folder || '', note.fileName));
  await deleteIfExists(filePath);
}

export async function createFolder(notesDir: string, folderPath: string): Promise<void> {
  const targetDir = getSafePath(notesDir, folderPath);
  await fs.mkdir(targetDir, { recursive: true });
}

export async function renameFolder(notesDir: string, oldPath: string, newPath: string): Promise<void> {
  const oldDir = getSafePath(notesDir, oldPath);
  const newDir = getSafePath(notesDir, newPath);
  
  // Ensure we're not renaming root
  if (oldDir === path.resolve(notesDir)) {
    throw new Error('Cannot rename root notes directory');
  }

  await fs.rename(oldDir, newDir);
}

export async function deleteFolder(notesDir: string, folderPath: string): Promise<void> {
  const targetDir = getSafePath(notesDir, folderPath);
  
  // Ensure we're not deleting root
  if (targetDir === path.resolve(notesDir)) {
    throw new Error('Cannot delete root notes directory');
  }

  await fs.rm(targetDir, { recursive: true, force: true });
}

export async function saveNoteAsset(notesDir: string, originalName: string, base64Data: string) {
  const assetsDir = path.join(notesDir, 'assets');
  await fs.mkdir(assetsDir, { recursive: true });

  const extension = path.extname(originalName) || '.bin';
  const baseName = path.basename(originalName, extension) || 'image';
  const safeBaseName = slugifyFileName(baseName);
  const fileName = `${safeBaseName}-${crypto.randomUUID().slice(0, 8)}${extension}`;
  const filePath = path.join(assetsDir, fileName);

  await fs.writeFile(filePath, Buffer.from(base64Data, 'base64'));

  return {
    fileName,
    relativePath: `assets/${fileName}`
  };
}
