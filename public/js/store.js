import { editablePayload } from "./domain.js";

const ITEMS_KEY = "deadline_items";
const OUTBOX_KEY = "deadline_outbox";

function safeRead(key, fallback = []) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return Array.isArray(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent("deadline-store-change"));
}

export function getDeadlines() {
  return safeRead(ITEMS_KEY).filter((item) => item && typeof item.id === "string" && item.title);
}

export function getDeadline(id) {
  return getDeadlines().find((item) => item.id === id) ?? null;
}

export function saveDeadline(deadline) {
  const items = getDeadlines();
  const index = items.findIndex((item) => item.id === deadline.id);
  if (index === -1) items.push(deadline);
  else items[index] = deadline;
  write(ITEMS_KEY, items);
  return deadline;
}

export function removeDeadline(id) {
  write(ITEMS_KEY, getDeadlines().filter((item) => item.id !== id));
}

export function getOutbox() {
  return safeRead(OUTBOX_KEY);
}

function saveOutbox(items) {
  write(OUTBOX_KEY, items);
}

export function queueCreate(deadline) {
  saveOutbox([
    ...getOutbox().filter((operation) => operation.deadlineId !== deadline.id),
    { operationId: crypto.randomUUID(), type: "create", deadlineId: deadline.id, payload: { id: deadline.id, ...editablePayload(deadline) }, queuedAt: new Date().toISOString() }
  ]);
}

export function queueUpdate(deadline) {
  const outbox = getOutbox();
  const create = outbox.find((operation) => operation.deadlineId === deadline.id && operation.type === "create");
  if (create) {
    create.payload = { id: deadline.id, ...editablePayload(deadline) };
    saveOutbox(outbox);
    return;
  }
  const withoutPreviousUpdate = outbox.filter((operation) => !(operation.deadlineId === deadline.id && operation.type === "update"));
  saveOutbox([...withoutPreviousUpdate, {
    operationId: crypto.randomUUID(), type: "update", deadlineId: deadline.id,
    payload: editablePayload(deadline), queuedAt: new Date().toISOString()
  }]);
}

export function queueDelete(id) {
  const outbox = getOutbox();
  const wasOnlyLocal = outbox.some((operation) => operation.deadlineId === id && operation.type === "create");
  const remaining = outbox.filter((operation) => operation.deadlineId !== id);
  if (!wasOnlyLocal) remaining.push({
    operationId: crypto.randomUUID(), type: "delete", deadlineId: id,
    payload: null, queuedAt: new Date().toISOString()
  });
  saveOutbox(remaining);
}

export function removeOperation(operationId) {
  saveOutbox(getOutbox().filter((operation) => operation.operationId !== operationId));
}

export function mergeRemote(remoteItems) {
  const pendingIds = new Set(getOutbox().map((operation) => operation.deadlineId));
  const local = getDeadlines();
  const localById = new Map(local.map((item) => [item.id, item]));

  for (const remote of remoteItems) {
    if (!pendingIds.has(remote.id)) localById.set(remote.id, remote);
  }
  const remoteIds = new Set(remoteItems.map((item) => item.id));
  for (const localItem of local) {
    if (!pendingIds.has(localItem.id) && !remoteIds.has(localItem.id)) localById.delete(localItem.id);
  }
  write(ITEMS_KEY, [...localById.values()]);
}

export function clearAllLocalData() {
  localStorage.removeItem(ITEMS_KEY);
  localStorage.removeItem(OUTBOX_KEY);
  window.dispatchEvent(new CustomEvent("deadline-store-change"));
}
