import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

const memory = new Map();
globalThis.localStorage = {
  getItem(key) { return memory.has(key) ? memory.get(key) : null; },
  setItem(key, value) { memory.set(key, String(value)); },
  removeItem(key) { memory.delete(key); }
};
globalThis.window = { dispatchEvent() {} };

const {
  getDeadlines, getOutbox, queueCreate, queueDelete, queueUpdate,
  removeDeadline, saveDeadline
} = await import("../public/js/store.js");

function record(overrides = {}) {
  return {
    id: "deadline-123e4567-e89b-42d3-a456-426614174000",
    title: "Offline draft",
    description: "",
    category: "Work",
    dueDateTime: "2026-07-25T10:00:00.000Z",
    priority: "medium",
    progress: 0,
    notes: "",
    completionState: "incomplete",
    completedAt: null,
    createdAt: "2026-07-20T10:00:00.000Z",
    updatedAt: "2026-07-20T10:00:00.000Z",
    ...overrides
  };
}

beforeEach(() => memory.clear());

test("local deadline CRUD survives serialization", () => {
  saveDeadline(record());
  saveDeadline(record({ title: "Updated locally", progress: 40 }));
  assert.equal(getDeadlines().length, 1);
  assert.equal(getDeadlines()[0].title, "Updated locally");
  removeDeadline(record().id);
  assert.equal(getDeadlines().length, 0);
});

test("updates to an unsynchronized create are coalesced", () => {
  const created = record();
  queueCreate(created);
  queueUpdate({ ...created, progress: 80 });
  assert.equal(getOutbox().length, 1);
  assert.equal(getOutbox()[0].type, "create");
  assert.equal(getOutbox()[0].payload.progress, 80);
});

test("deleting an unsynchronized create removes redundant API work", () => {
  const created = record();
  queueCreate(created);
  queueDelete(created.id);
  assert.equal(getOutbox().length, 0);
});

test("deleting a server record supersedes queued updates", () => {
  const existing = record();
  queueUpdate(existing);
  queueDelete(existing.id);
  assert.equal(getOutbox().length, 1);
  assert.equal(getOutbox()[0].type, "delete");
});

test("corrupted local data falls back safely", () => {
  memory.set("deadline_items", "{broken json");
  assert.deepEqual(getDeadlines(), []);
});
