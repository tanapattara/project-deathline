import { getOutbox, mergeRemote, removeOperation, saveDeadline } from "./store.js";

let syncing = false;

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: options.body ? { "content-type": "application/json", ...options.headers } : options.headers
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  return { response, body };
}

async function pushOperation(operation) {
  if (operation.type === "create") {
    const result = await apiRequest("/api/deadlines", { method: "POST", body: JSON.stringify(operation.payload) });
    if (result.response.status === 409) {
      const { id: _ignored, ...patch } = operation.payload;
      const update = await apiRequest(`/api/deadlines/${encodeURIComponent(operation.deadlineId)}`, {
        method: "PATCH", body: JSON.stringify(patch)
      });
      if (!update.response.ok) throw new Error(update.body?.error ?? "Could not reconcile deadline");
      return update.body;
    }
    if (!result.response.ok) throw new Error(result.body?.error ?? "Could not create deadline");
    return result.body;
  }

  if (operation.type === "update") {
    const result = await apiRequest(`/api/deadlines/${encodeURIComponent(operation.deadlineId)}`, {
      method: "PATCH", body: JSON.stringify(operation.payload)
    });
    if (!result.response.ok) throw new Error(result.body?.error ?? "Could not update deadline");
    return result.body;
  }

  const result = await apiRequest(`/api/deadlines/${encodeURIComponent(operation.deadlineId)}`, { method: "DELETE" });
  if (!result.response.ok && result.response.status !== 404) throw new Error(result.body?.error ?? "Could not delete deadline");
  return null;
}

export async function synchronize() {
  if (syncing || !navigator.onLine) return { synced: false, pending: getOutbox().length };
  syncing = true;
  window.dispatchEvent(new CustomEvent("deadline-sync-start"));
  try {
    for (const operation of getOutbox()) {
      const saved = await pushOperation(operation);
      if (saved) saveDeadline(saved);
      removeOperation(operation.operationId);
    }

    const result = await apiRequest("/api/deadlines");
    if (!result.response.ok) throw new Error("Could not refresh deadlines");
    mergeRemote(result.body.items);
    const detail = { synced: true, pending: 0 };
    window.dispatchEvent(new CustomEvent("deadline-sync-complete", { detail }));
    return detail;
  } catch (error) {
    const detail = { synced: false, pending: getOutbox().length, message: error.message };
    window.dispatchEvent(new CustomEvent("deadline-sync-complete", { detail }));
    return detail;
  } finally {
    syncing = false;
  }
}
