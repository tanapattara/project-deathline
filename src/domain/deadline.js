import { randomUUID } from "node:crypto";

export const COMPLETION_STATES = ["incomplete", "completed", "cancelled"];
export const PRIORITIES = ["high", "medium", "low"];

const MUTABLE_FIELDS = new Set([
  "title",
  "description",
  "category",
  "dueDateTime",
  "priority",
  "progress",
  "notes",
  "completionState",
  "completedAt"
]);
const DEADLINE_ID_PATTERN = /^deadline-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ValidationError extends Error {
  constructor(errors) {
    super("Deadline validation failed");
    this.name = "ValidationError";
    this.errors = errors;
  }
}

function normalizeString(value, field, errors, { required = false } = {}) {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    errors[field] = "must be a string";
    return undefined;
  }

  const normalized = value.trim();
  if (required && normalized.length === 0) {
    errors[field] = "is required";
  }
  return normalized;
}

function normalizeDate(value, field, errors, { nullable = false } = {}) {
  if (value === undefined) return undefined;
  if (nullable && value === null) return null;
  if (typeof value !== "string" || value.trim() === "") {
    errors[field] = "must be an ISO 8601 date-time string";
    return undefined;
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    errors[field] = "must be a valid ISO 8601 date-time string";
    return undefined;
  }
  return new Date(timestamp).toISOString();
}

export function validateDeadlineInput(input, { partial = false, allowId = false } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ValidationError({ body: "must be a JSON object" });
  }

  const errors = {};
  const allowedFields = allowId ? new Set([...MUTABLE_FIELDS, "id"]) : MUTABLE_FIELDS;
  const unknownFields = Object.keys(input).filter((field) => !allowedFields.has(field));
  if (unknownFields.length > 0) {
    errors.body = `contains unsupported fields: ${unknownFields.join(", ")}`;
  }

  const result = {};
  if (allowId && input.id !== undefined) {
    if (typeof input.id !== "string" || !DEADLINE_ID_PATTERN.test(input.id)) {
      errors.id = "must use the format deadline-<UUID>";
    } else {
      result.id = input.id.toLowerCase();
    }
  }

  const title = normalizeString(input.title, "title", errors, { required: true });
  if (title !== undefined) result.title = title;

  const description = normalizeString(input.description, "description", errors);
  if (description !== undefined) result.description = description;

  const category = normalizeString(input.category, "category", errors);
  if (category !== undefined) result.category = category;

  const dueDateTime = normalizeDate(input.dueDateTime, "dueDateTime", errors);
  if (dueDateTime !== undefined) result.dueDateTime = dueDateTime;

  if (input.priority !== undefined) {
    if (typeof input.priority !== "string" || !PRIORITIES.includes(input.priority.toLowerCase())) {
      errors.priority = `must be one of: ${PRIORITIES.join(", ")}`;
    } else {
      result.priority = input.priority.toLowerCase();
    }
  }

  if (input.progress !== undefined) {
    if (!Number.isInteger(input.progress) || input.progress < 0 || input.progress > 100) {
      errors.progress = "must be an integer between 0 and 100";
    } else {
      result.progress = input.progress;
    }
  }

  const notes = normalizeString(input.notes, "notes", errors);
  if (notes !== undefined) result.notes = notes;

  if (input.completionState !== undefined) {
    if (typeof input.completionState !== "string" || !COMPLETION_STATES.includes(input.completionState.toLowerCase())) {
      errors.completionState = `must be one of: ${COMPLETION_STATES.join(", ")}`;
    } else {
      result.completionState = input.completionState.toLowerCase();
    }
  }

  const completedAt = normalizeDate(input.completedAt, "completedAt", errors, { nullable: true });
  if (completedAt !== undefined) result.completedAt = completedAt;

  if (!partial) {
    if (input.title === undefined) errors.title = "is required";
    if (input.dueDateTime === undefined) errors.dueDateTime = "is required";
  }

  if (Object.keys(errors).length > 0) throw new ValidationError(errors);
  return result;
}

export function buildDeadline(input, now = new Date()) {
  const values = validateDeadlineInput(input, { allowId: true });
  const timestamp = now.toISOString();
  const completionState = values.completionState ?? "incomplete";

  return {
    id: values.id ?? `deadline-${randomUUID()}`,
    title: values.title,
    description: values.description ?? "",
    category: values.category ?? "",
    dueDateTime: values.dueDateTime,
    priority: values.priority ?? "medium",
    progress: values.progress ?? 0,
    notes: values.notes ?? "",
    completionState,
    completedAt: completionState === "completed" ? (values.completedAt ?? timestamp) : null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function applyDeadlineChanges(current, input, now = new Date(), { replace = false } = {}) {
  const values = validateDeadlineInput(input, { partial: !replace });
  const base = replace
    ? {
        title: values.title,
        description: "",
        category: "",
        dueDateTime: values.dueDateTime,
        priority: "medium",
        progress: 0,
        notes: "",
        completionState: "incomplete",
        completedAt: null
      }
    : current;

  const next = { ...base, ...values };
  if (next.completionState === "completed") {
    next.completedAt = values.completedAt ?? current.completedAt ?? now.toISOString();
  } else {
    next.completedAt = null;
  }

  return {
    ...current,
    ...next,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: now.toISOString()
  };
}

export function calculateDeadlineStatus(deadline, now = new Date()) {
  if (deadline.completionState === "cancelled") return "cancelled";
  if (deadline.completionState === "completed") {
    return Date.parse(deadline.completedAt) <= Date.parse(deadline.dueDateTime)
      ? "completed-on-time"
      : "completed-late";
  }

  const due = new Date(deadline.dueDateTime);
  if (due.getTime() < now.getTime()) return "overdue";

  const sameLocalDay =
    due.getFullYear() === now.getFullYear() &&
    due.getMonth() === now.getMonth() &&
    due.getDate() === now.getDate();
  if (sameLocalDay) return "due-today";

  const threeDays = 3 * 24 * 60 * 60 * 1000;
  return due.getTime() - now.getTime() <= threeDays ? "due-soon" : "upcoming";
}

export function serializeDeadline(deadline, now = new Date()) {
  return { ...deadline, status: calculateDeadlineStatus(deadline, now) };
}
