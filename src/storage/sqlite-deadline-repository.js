import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

const SELECT_COLUMNS = `
  id,
  title,
  description,
  category,
  due_date_time AS dueDateTime,
  priority,
  progress,
  notes,
  completion_state AS completionState,
  completed_at AS completedAt,
  created_at AS createdAt,
  updated_at AS updatedAt
`;

function asPlainObject(row) {
  return row ? { ...row } : null;
}

export class SqliteDeadlineRepository {
  constructor(filename) {
    if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true });
    this.database = new DatabaseSync(filename);
    this.database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
    this.migrate();
  }

  migrate() {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS deadlines (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL CHECK (length(trim(title)) > 0),
        description TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT '',
        due_date_time TEXT NOT NULL,
        priority TEXT NOT NULL CHECK (priority IN ('high', 'medium', 'low')),
        progress INTEGER NOT NULL CHECK (progress BETWEEN 0 AND 100),
        notes TEXT NOT NULL DEFAULT '',
        completion_state TEXT NOT NULL CHECK (completion_state IN ('incomplete', 'completed', 'cancelled')),
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK (
          (completion_state = 'completed' AND completed_at IS NOT NULL)
          OR (completion_state != 'completed' AND completed_at IS NULL)
        )
      );

      CREATE INDEX IF NOT EXISTS deadlines_due_date_time_idx
      ON deadlines(due_date_time);

      CREATE INDEX IF NOT EXISTS deadlines_completion_state_idx
      ON deadlines(completion_state);
    `);
  }

  list() {
    const rows = this.database
      .prepare(`SELECT ${SELECT_COLUMNS} FROM deadlines ORDER BY due_date_time ASC, created_at DESC`)
      .all();
    return rows.map(asPlainObject);
  }

  findById(id) {
    return asPlainObject(
      this.database.prepare(`SELECT ${SELECT_COLUMNS} FROM deadlines WHERE id = ?`).get(id)
    );
  }

  create(deadline) {
    this.database.prepare(`
      INSERT INTO deadlines (
        id, title, description, category, due_date_time, priority, progress,
        notes, completion_state, completed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      deadline.id,
      deadline.title,
      deadline.description,
      deadline.category,
      deadline.dueDateTime,
      deadline.priority,
      deadline.progress,
      deadline.notes,
      deadline.completionState,
      deadline.completedAt,
      deadline.createdAt,
      deadline.updatedAt
    );
    return this.findById(deadline.id);
  }

  update(deadline) {
    const result = this.database.prepare(`
      UPDATE deadlines SET
        title = ?, description = ?, category = ?, due_date_time = ?, priority = ?,
        progress = ?, notes = ?, completion_state = ?, completed_at = ?, updated_at = ?
      WHERE id = ?
    `).run(
      deadline.title,
      deadline.description,
      deadline.category,
      deadline.dueDateTime,
      deadline.priority,
      deadline.progress,
      deadline.notes,
      deadline.completionState,
      deadline.completedAt,
      deadline.updatedAt,
      deadline.id
    );
    return result.changes === 0 ? null : this.findById(deadline.id);
  }

  delete(id) {
    return this.database.prepare("DELETE FROM deadlines WHERE id = ?").run(id).changes > 0;
  }

  close() {
    this.database.close();
  }
}
