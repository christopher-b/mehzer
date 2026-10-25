import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

const dir = './drizzle';
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const statements = (file: string) =>
	readFileSync(join(dir, file), 'utf8').split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean);

describe('migration 0003 (accounts) on a database that already holds data', () => {
	it('keeps every existing row, leaves projects without an owner, and has the right ON DELETE actions', () => {
		const sqlite = new Database(':memory:');
		sqlite.pragma('foreign_keys = ON');
		const before = files.filter((f) => f < '0003');
		expect(files.some((f) => f.startsWith('0003_accounts'))).toBe(true);
		for (const file of before) for (const statement of statements(file)) sqlite.exec(statement);

		sqlite.exec(`
			insert into project (id, name, unit_system) values ('p1', 'Old house', 'imperial');
			insert into room (id, project_id, name) values ('r1', 'p1', 'Kitchen');
			insert into photo (id, project_id, room_id, blob_key, width, height) values ('f1', 'p1', 'r1', 'projects/p1/a.jpg', 10, 10);
			insert into annotation (id, photo_id, x1, y1, x2, y2, value_mm) values ('a1', 'f1', 0.1, 0.1, 0.9, 0.9, 3000);
		`);

		for (const file of files.filter((f) => f >= '0003')) for (const statement of statements(file)) sqlite.exec(statement);

		const count = (table: string) => (sqlite.prepare(`select count(*) as n from ${table}`).get() as { n: number }).n;
		expect([count('project'), count('room'), count('photo'), count('annotation')]).toEqual([1, 1, 1, 1]);
		expect(sqlite.prepare("select owner_id, created_by, updated_by from project where id = 'p1'").get()).toEqual({
			owner_id: null,
			created_by: null,
			updated_by: null
		});

		const action = (table: string, from: string) =>
			(sqlite.prepare(`pragma foreign_key_list(${table})`).all() as { from: string; to: string; on_delete: string }[]).find((fk) => fk.from === from)?.on_delete;
		expect(action('project', 'owner_id')).toBe('CASCADE');
		for (const table of ['project', 'room', 'photo', 'annotation']) {
			expect(action(table, 'created_by'), `${table}.created_by`).toBe('SET NULL');
			expect(action(table, 'updated_by'), `${table}.updated_by`).toBe('SET NULL');
		}

		// the foreign keys really work: deleting a user deletes their projects and clears authorship elsewhere
		sqlite.exec(`
			insert into user (id, email, name, password_hash) values ('u1', 'a@example.com', 'A', 'x'), ('u2', 'b@example.com', 'B', 'x');
			update project set owner_id = 'u1' where id = 'p1';
			insert into project (id, name, owner_id) values ('p2', 'Other', 'u2');
			update project set created_by = 'u1' where id = 'p2';
		`);
		sqlite.exec("delete from user where id = 'u1'");
		expect(count('project')).toBe(1);
		expect(sqlite.prepare("select created_by from project where id = 'p2'").get()).toEqual({ created_by: null });
	});
});
