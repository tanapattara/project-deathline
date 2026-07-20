import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateStatus, formatRelativeDate, remainingParts, sortDeadlines, validateDeadline
} from "../public/js/domain.js";

const now = new Date("2026-07-20T10:00:00.000Z");

function localDateOffset(days, hour = 18) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, hour, 0, 0).toISOString();
}

function deadline(overrides = {}) {
  return {
    id: "deadline-123e4567-e89b-42d3-a456-426614174000",
    title: "Test",
    description: "",
    category: "",
    dueDateTime: "2026-07-25T10:00:00.000Z",
    priority: "medium",
    progress: 0,
    notes: "",
    completionState: "incomplete",
    completedAt: null,
    createdAt: "2026-07-19T10:00:00.000Z",
    updatedAt: "2026-07-19T10:00:00.000Z",
    ...overrides
  };
}

test("frontend status rules use the documented precedence", () => {
  assert.equal(calculateStatus(deadline({ completionState: "cancelled" }), now), "cancelled");
  assert.equal(calculateStatus(deadline({ completionState: "completed", completedAt: "2026-07-24T10:00:00.000Z" }), now), "completed-on-time");
  assert.equal(calculateStatus(deadline({ completionState: "completed", completedAt: "2026-07-26T10:00:00.000Z" }), now), "completed-late");
  assert.equal(calculateStatus(deadline({ dueDateTime: "2026-07-19T10:00:00.000Z" }), now), "overdue");
  assert.equal(calculateStatus(deadline({ dueDateTime: localDateOffset(0) }), now), "due-today");
  assert.equal(calculateStatus(deadline({ dueDateTime: "2026-07-22T10:00:00.000Z" }), now), "due-soon");
  assert.equal(calculateStatus(deadline(), now), "upcoming");
});

test("countdown returns stable non-negative parts and overdue direction", () => {
  assert.deepEqual(remainingParts(deadline({ dueDateTime: "2026-07-22T12:03:04.000Z" }), now), {
    expired: false, days: 2, hours: 2, minutes: 3, seconds: 4
  });
  assert.equal(remainingParts(deadline({ dueDateTime: "2026-07-19T10:00:00.000Z" }), now).expired, true);
});

test("frontend validation matches create form requirements", () => {
  const errors = validateDeadline({ title: "", dueDateTime: "not-a-date", priority: "urgent", progress: 101 });
  assert.ok(errors.title);
  assert.ok(errors.dueDateTime);
  assert.ok(errors.priority);
  assert.ok(errors.progress);
});

test("sort functions do not mutate their input", () => {
  const items = [
    deadline({ id: "b", dueDateTime: "2026-07-23T10:00:00.000Z", priority: "low" }),
    deadline({ id: "a", dueDateTime: "2026-07-21T10:00:00.000Z", priority: "high" })
  ];
  assert.deepEqual(sortDeadlines(items, "nearest").map((item) => item.id), ["a", "b"]);
  assert.deepEqual(items.map((item) => item.id), ["b", "a"]);
});

test("relative day labels are concise", () => {
  assert.equal(formatRelativeDate(localDateOffset(0), now), "Today");
  assert.equal(formatRelativeDate(localDateOffset(1), now), "Tomorrow");
});
