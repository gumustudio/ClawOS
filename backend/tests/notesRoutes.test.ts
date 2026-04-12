import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('notes migrate merges source notes into target directory', async () => {
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'clawos-notes-migrate-'));
  const sourceDir = path.join(tempHome, 'source');
  const targetDir = path.join(tempHome, 'target');
  const sourceFile = path.join(sourceDir, '旧笔记-1.md');
  const targetFile = path.join(targetDir, '新目录已有笔记-2.md');

  await fs.mkdir(sourceDir, { recursive: true });
  await fs.mkdir(targetDir, { recursive: true });
  await fs.writeFile(sourceFile, '---\nid: 1\ntitle: "旧笔记"\nupdatedAt: 2026-03-29T10:00:00.000Z\n---\n\na');
  await fs.writeFile(targetFile, '---\nid: 2\ntitle: "新目录已有笔记"\nupdatedAt: 2026-03-29T11:00:00.000Z\n---\n\nb');

  const { default: router } = await import(`../src/routes/index?ts=${Date.now()}`);
  const app = express();
  app.use(express.json());
  app.use('/api/system', router);

  try {
    const response = await request(app)
      .post('/api/system/notes/migrate')
      .send({ fromDir: sourceDir, toDir: targetDir });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.migrated, 1);

    const targetEntries = await fs.readdir(targetDir);
    assert.equal(targetEntries.filter((entry) => entry.endsWith('.md')).length, 2);
  } finally {
    await fs.rm(tempHome, { recursive: true, force: true });
  }
});

test('notes store keeps valid markdown files under concurrent writes', async () => {
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'clawos-notes-store-'));

  try {
    const notesStore = await import(`../src/utils/notesStore?ts=${Date.now()}`);

    await Promise.all(
      Array.from({ length: 20 }, (_, index) => notesStore.updateNoteInDir(tempHome, {
          id: String(index),
          title: `笔记${index}`,
          date: '2026-03-29',
          content: '',
          updatedAt: new Date(2026, 2, 29, 12, 0, index).toISOString()
      }))
    );

    const stored = await notesStore.readNotesDir(tempHome);
    assert.equal(stored.length, 20);
    assert.ok(stored.every((note: { id: string }) => typeof note.id === 'string'));
  } finally {
    await fs.rm(tempHome, { recursive: true, force: true });
  }
});

test('notes store migrates legacy notes.json into markdown files', async () => {
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'clawos-notes-legacy-'));
  const legacyFile = path.join(tempHome, 'notes.json');

  await fs.writeFile(legacyFile, JSON.stringify([
    { id: 'legacy-1', title: '旧格式笔记', date: '2026-03-29', content: '# 标题\n\n正文', updatedAt: '2026-03-29T10:00:00.000Z' }
  ], null, 2));

  try {
    const notesStore = await import(`../src/utils/notesStore?ts=${Date.now()}`);
    const notes = await notesStore.readNotesDir(tempHome);
    const entries = await fs.readdir(tempHome);

    assert.equal(notes.length, 1);
    assert.equal(notes[0].id, 'legacy-1');
    assert.equal(entries.some((entry) => entry.endsWith('.md')), true);
    assert.equal(entries.includes('notes.json'), false);
  } finally {
    await fs.rm(tempHome, { recursive: true, force: true });
  }
});

test('notes assets endpoint saves image into assets directory', async () => {
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'clawos-notes-assets-'));
  const targetDir = path.join(tempHome, 'notes');

  const { default: router } = await import(`../src/routes/index?ts=${Date.now()}`);
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/system', router);

  try {
    const response = await request(app)
      .post('/api/system/notes/assets')
      .send({
        dir: targetDir,
        fileName: 'demo.png',
        data: Buffer.from('hello').toString('base64')
      });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.match(response.body.data.relativePath, /^assets\/demo-/);

    const assetPath = path.join(targetDir, response.body.data.relativePath);
    const saved = await fs.readFile(assetPath, 'utf-8');
    assert.equal(saved, 'hello');
  } finally {
    await fs.rm(tempHome, { recursive: true, force: true });
  }
});
