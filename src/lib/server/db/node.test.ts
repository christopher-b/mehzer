import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { photos, projects } from './schema.ts';
import { getNodeDb } from './node.ts';

const dirs: string[] = [];
afterAll(() => Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true }))));

describe('getNodeDb', () => {
	it('creates the file and any missing folders, applies the migrations, and enforces foreign keys', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'mehzer-db-'));
		dirs.push(dir);
		const path = join(dir, 'nested', 'deeper', 'mehzer.db');

		const db = getNodeDb(path, './drizzle');

		expect(existsSync(path)).toBe(true);
		await db.insert(projects).values({ name: 'Works' });
		expect(await db.select().from(projects)).toHaveLength(1);
		await expect(
			db.insert(photos).values({ projectId: 'missing', blobKey: 'k', width: 1, height: 1 })
		).rejects.toThrow();
	});

	it('returns the same instance on later calls, ignoring a different path', () => {
		const first = getNodeDb('ignored.db', './drizzle');
		expect(getNodeDb('/somewhere/else.db', './drizzle')).toBe(first);
		expect(existsSync('ignored.db')).toBe(false);
	});
});
