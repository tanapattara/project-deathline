export const STATUS_META = {
  upcoming: { label: "Upcoming", tone: "upcoming" },
  "due-soon": { label: "Due soon", tone: "due-soon" },
  "due-today": { label: "Due today", tone: "due-today" },
  overdue: { label: "Overdue", tone: "overdue" },
  "completed-on-time": { label: "On time", tone: "completed" },
  "completed-late": { label: "Completed late", tone: "completed-late" },
  cancelled: { label: "Cancelled", tone: "cancelled" }
};

export function calculateStatus(deadline, now = new Date()) {
  if (deadline.completionState === "cancelled") return "cancelled";
  if (deadline.completionState === "completed") {
    return Date.parse(deadline.completedAt) <= Date.parse(deadline.dueDateTime)
      ? "completed-on-time"
      : "completed-late";
  }

  const due = new Date(deadline.dueDateTime);
  if (due < now) return "overdue";
  if (
    due.getFullYear() === now.getFullYear() &&
    due.getMonth() === now.getMonth() &&
    due.getDate() === now.getDate()
  ) return "due-today";
  return due - now <= 3 * 86400000 ? "due-soon" : "upcoming";
}

export function remainingParts(deadline, now = new Date()) {
  const difference = Date.parse(deadline.dueDateTime) - now.getTime();
  const absolute = Math.abs(difference);
  return {
    expired: difference < 0,
    days: Math.floor(absolute / 86400000),
    hours: Math.floor((absolute % 86400000) / 3600000),
    minutes: Math.floor((absolute % 3600000) / 60000),
    seconds: Math.floor((absolute % 60000) / 1000)
  };
}

export function formatDateTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function formatRelativeDate(value, now = new Date()) {
  const due = new Date(value);
  const startDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const startNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((startDue - startNow) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(days, "day");
}

export function createDeadline(values) {
  const timestamp = new Date().toISOString();
  return {
    id: `deadline-${crypto.randomUUID()}`,
    title: values.title.trim(),
    description: values.description.trim(),
    category: values.category.trim(),
    dueDateTime: new Date(values.dueDateTime).toISOString(),
    priority: values.priority,
    progress: Number(values.progress),
    notes: values.notes.trim(),
    completionState: "incomplete",
    completedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function editablePayload(deadline) {
  const {
    title, description, category, dueDateTime, priority, progress,
    notes, completionState, completedAt
  } = deadline;
  return { title, description, category, dueDateTime, priority, progress, notes, completionState, completedAt };
}

export function validateDeadline(values) {
  const errors = {};
  if (!values.title?.trim()) errors.title = "Add a title so you can recognize this deadline.";
  if (!values.dueDateTime || Number.isNaN(Date.parse(values.dueDateTime))) {
    errors.dueDateTime = "Choose a valid due date and time.";
  }
  const progress = Number(values.progress);
  if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
    errors.progress = "Progress must be a whole number from 0 to 100.";
  }
  if (!["high", "medium", "low"].includes(values.priority)) {
    errors.priority = "Choose a valid priority.";
  }
  return errors;
}

export function sortDeadlines(items, mode) {
  const rank = { high: 0, medium: 1, low: 2 };
  return [...items].sort((a, b) => {
    if (mode === "latest") return Date.parse(b.dueDateTime) - Date.parse(a.dueDateTime);
    if (mode === "priority") return rank[a.priority] - rank[b.priority] || Date.parse(a.dueDateTime) - Date.parse(b.dueDateTime);
    if (mode === "created") return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    if (mode === "progress") return b.progress - a.progress;
    return Date.parse(a.dueDateTime) - Date.parse(b.dueDateTime);
  });
}
