import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('notes tree includes empty folders', async () => {
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'clawos-notes-tree-'));
  const emptyFolder = path.join(tempHome, '空文件夹');
  const nestedFolder = path.join(tempHome, '项目', '子目录');

  try {
    await fs.mkdir(emptyFolder, { recursive: true });
    await fs.mkdir(nestedFolder, { recursive: true });

    const notesStore = await import(`../src/utils/notesStore?ts=${Date.now()}`);
    const tree = await notesStore.getNotesTree(tempHome);

    const emptyNode = tree.find((node: { type: string; path: string }) => node.type === 'folder' && node.path === '空文件夹');
    const projectNode = tree.find((node: { type: string; path: string }) => node.type === 'folder' && node.path === '项目');

    assert.ok(emptyNode);
    assert.ok(projectNode);
    assert.equal(Array.isArray(emptyNode.children), true);
    assert.equal(projectNode.children?.[0]?.path, '项目/子目录');
  } finally {
    await fs.rm(tempHome, { recursive: true, force: true });
  }
});
