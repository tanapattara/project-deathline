import {
  STATUS_META, calculateStatus, createDeadline, formatDateTime, formatRelativeDate,
  remainingParts, sortDeadlines, validateDeadline
} from "./domain.js";
import {
  getDeadline, getDeadlines, getOutbox, queueCreate, queueDelete, queueUpdate,
  removeDeadline, saveDeadline
} from "./store.js";
import { synchronize } from "./sync.js";

const app = document.querySelector("#app");
let filters = { query: "", status: "all", priority: "all", sort: "nearest" };
let syncing = false;
let toastTimer;
let pendingToast = null;

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"
  })[character]);
}

function currentRoute() {
  const path = location.hash.slice(1) || "/";
  if (path === "/" || path === "") return { page: "dashboard", path: "/" };
  if (path === "/deadlines") return { page: "deadlines", path };
  if (path === "/deadlines/add") return { page: "add", path };
  const edit = path.match(/^\/deadlines\/([^/]+)\/edit$/);
  if (edit) return { page: "edit", id: decodeURIComponent(edit[1]), path };
  const detail = path.match(/^\/deadlines\/([^/]+)$/);
  if (detail) return { page: "detail", id: decodeURIComponent(detail[1]), path };
  return { page: "not-found", path };
}

function navItem(href, label, symbol, active) {
  return `<a class="nav-item ${active ? "is-active" : ""}" href="#${href}" ${active ? 'aria-current="page"' : ""}>
    <span class="nav-symbol" aria-hidden="true">${symbol}</span><span>${label}</span>
  </a>`;
}

function shell(content, route, title, eyebrow = "Your time, clearly") {
  const deadlinesActive = ["deadlines", "detail", "edit"].includes(route.page);
  const pending = getOutbox().length;
  const connectionText = navigator.onLine ? (pending ? `${pending} pending` : "Up to date") : "Offline";
  const connectionClass = navigator.onLine ? (pending ? "pending" : "online") : "offline";

  return `<aside class="sidebar" aria-label="Primary navigation">
      <a class="brand" href="#/" aria-label="Deadline dashboard">
        <span class="brand-mark" aria-hidden="true">D</span>
        <span class="brand-copy"><strong>Deadline</strong><small>Nxt Gen IT KKU</small></span>
      </a>
      <nav class="desktop-nav">
        ${navItem("/", "Dashboard", "◫", route.page === "dashboard")}
        ${navItem("/deadlines", "Deadlines", "◷", deadlinesActive)}
        ${navItem("/deadlines/add", "Add deadline", "+", route.page === "add")}
      </nav>
      <div class="sidebar-footer">
        <div class="sync-pill ${connectionClass}"><span></span>${connectionText}</div>
        <p>Your changes are saved on this device first.</p>
      </div>
    </aside>
    <div class="app-main">
      <header class="topbar">
        <div><p class="eyebrow">${escapeHtml(eyebrow)}</p><h1>${escapeHtml(title)}</h1></div>
        <div class="topbar-actions">
          <button class="sync-button" type="button" data-action="sync" ${syncing || !navigator.onLine ? "disabled" : ""}>
            <span class="sync-dot ${connectionClass}"></span>${syncing ? "Syncing…" : connectionText}
          </button>
          ${route.page !== "add" ? '<a class="button button-primary top-add" href="#/deadlines/add"><span aria-hidden="true">+</span> Add deadline</a>' : ""}
        </div>
      </header>
      <main class="page-content" id="main-content">${content}</main>
    </div>
    <nav class="bottom-nav" aria-label="Primary navigation">
      ${navItem("/", "Home", "◫", route.page === "dashboard")}
      ${navItem("/deadlines", "Deadlines", "◷", deadlinesActive)}
      ${navItem("/deadlines/add", "Add", "+", route.page === "add")}
    </nav>
    <div id="toast-region" class="toast-region" aria-live="polite"></div>
    <div id="dialog-root"></div>`;
}

function statusBadge(deadline) {
  const status = calculateStatus(deadline);
  const meta = STATUS_META[status];
  return `<span class="status-badge status-${meta.tone}"><span aria-hidden="true"></span>${meta.label}</span>`;
}

function countdown(deadline, { large = false } = {}) {
  if (["completed", "cancelled"].includes(deadline.completionState)) {
    return `<p class="countdown-finished">${deadline.completionState === "completed" ? "Completed" : "No longer active"}</p>`;
  }
  const parts = remainingParts(deadline);
  return `<div class="countdown ${large ? "countdown-large" : ""}" data-countdown="${escapeHtml(deadline.id)}" aria-label="${parts.expired ? "Overdue by" : "Time remaining"}">
    ${countPart(parts.days, "days")} ${countPart(parts.hours, "hours")} ${countPart(parts.minutes, "min")} ${countPart(parts.seconds, "sec")}
  </div>`;
}

function countPart(value, label) {
  return `<span class="count-part"><strong>${String(value).padStart(2, "0")}</strong><small>${label}</small></span>`;
}

function deadlineCard(deadline) {
  const status = calculateStatus(deadline);
  return `<article class="deadline-card status-edge-${STATUS_META[status].tone}">
    <div class="card-head"><div><p class="card-kicker">${escapeHtml(deadline.category || "Uncategorized")}</p><h3><a href="#/deadlines/${encodeURIComponent(deadline.id)}">${escapeHtml(deadline.title)}</a></h3></div>${statusBadge(deadline)}</div>
    <div class="due-line"><span>${formatRelativeDate(deadline.dueDateTime)}</span><span>${escapeHtml(formatDateTime(deadline.dueDateTime))}</span></div>
    ${countdown(deadline)}
    <div class="progress-row"><span>${deadline.progress}% complete</span><span class="priority priority-${deadline.priority}">${deadline.priority}</span></div>
    <div class="progress-track" aria-label="${deadline.progress}% complete"><span style="width:${deadline.progress}%"></span></div>
    <div class="card-actions">
      <a class="text-link" href="#/deadlines/${encodeURIComponent(deadline.id)}">View details <span aria-hidden="true">→</span></a>
      ${deadline.completionState === "incomplete" ? `<button class="quick-complete" data-action="complete" data-id="${escapeHtml(deadline.id)}" type="button">Mark complete</button>` : ""}
    </div>
  </article>`;
}

function emptyState(title, message, action = true) {
  return `<div class="empty-state"><span class="empty-symbol" aria-hidden="true">◷</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p>${action ? '<a class="button button-primary" href="#/deadlines/add">Add your first deadline</a>' : ""}</div>`;
}

function dashboardPage(items) {
  if (!items.length) return `<section class="welcome-panel"><p class="eyebrow">A calmer way to stay ahead</p><h2>Every important moment, in sight.</h2><p>Capture what matters, watch time move, and keep working even when your connection disappears.</p><a class="button button-accent" href="#/deadlines/add">Create a deadline <span aria-hidden="true">→</span></a></section>${emptyState("Nothing on your horizon", "Add a deadline and your live overview will appear here.")}`;

  const now = new Date();
  const active = items.filter((item) => item.completionState === "incomplete").sort((a, b) => Date.parse(a.dueDateTime) - Date.parse(b.dueDateTime));
  const nearest = active[0];
  const groups = Object.fromEntries(Object.keys(STATUS_META).map((status) => [status, items.filter((item) => calculateStatus(item, now) === status)]));
  const completed = [...groups["completed-on-time"], ...groups["completed-late"]].sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt));
  const stats = [
    [items.length, "Total", "all"], [groups["due-today"].length, "Due today", "today"],
    [groups.overdue.length, "Overdue", "overdue"], [completed.length, "Completed", "complete"]
  ];

  return `<section class="dashboard-grid">
    <div class="hero-deadline ${nearest ? "" : "hero-complete"}">
      <div class="hero-top"><p class="eyebrow">${nearest ? "Next on your horizon" : "Horizon clear"}</p>${nearest ? statusBadge(nearest) : ""}</div>
      ${nearest ? `<h2>${escapeHtml(nearest.title)}</h2><p class="hero-due">Due ${escapeHtml(formatDateTime(nearest.dueDateTime))}</p>${countdown(nearest, { large: true })}<div class="hero-actions"><a class="button button-light" href="#/deadlines/${encodeURIComponent(nearest.id)}">Open deadline</a><button class="button button-ghost-light" data-action="complete" data-id="${escapeHtml(nearest.id)}">Mark complete</button></div>` : `<h2>Everything is handled.</h2><p>Add something new when you're ready.</p>`}
    </div>
    <div class="summary-grid">${stats.map(([value, label, tone]) => `<article class="summary-card tone-${tone}"><span>${label}</span><strong>${value}</strong><small>${value === 1 ? "deadline" : "deadlines"}</small></article>`).join("")}</div>
  </section>
  <section class="section-block"><div class="section-heading"><div><p class="eyebrow">Needs attention</p><h2>Today & overdue</h2></div><a class="text-link" href="#/deadlines">See all <span aria-hidden="true">→</span></a></div>
    <div class="card-grid attention-grid">${[...groups.overdue, ...groups["due-today"]].slice(0, 4).map(deadlineCard).join("") || '<p class="quiet-state">Nothing urgent. You have room to focus.</p>'}</div>
  </section>
  <section class="section-block"><div class="section-heading"><div><p class="eyebrow">Coming up</p><h2>Your next deadlines</h2></div></div>
    <div class="card-grid">${active.filter((item) => item.id !== nearest?.id).slice(0, 4).map(deadlineCard).join("") || '<p class="quiet-state">No other active deadlines.</p>'}</div>
  </section>`;
}

function deadlineListPage(items) {
  const query = filters.query.toLowerCase();
  let result = items.filter((item) => {
    const matchesQuery = !query || [item.title, item.description, item.category].some((value) => value.toLowerCase().includes(query));
    const matchesStatus = filters.status === "all" || calculateStatus(item) === filters.status;
    const matchesPriority = filters.priority === "all" || item.priority === filters.priority;
    return matchesQuery && matchesStatus && matchesPriority;
  });
  result = sortDeadlines(result, filters.sort);
  return `<section class="list-toolbar" aria-label="Deadline search and filters">
    <label class="search-field"><span class="sr-only">Search deadlines</span><span aria-hidden="true">⌕</span><input id="deadline-search" type="search" placeholder="Search deadlines" value="${escapeHtml(filters.query)}" /></label>
    <div class="filter-row">
      <label><span>Status</span><select id="status-filter"><option value="all">All statuses</option>${Object.entries(STATUS_META).map(([value, meta]) => `<option value="${value}" ${filters.status === value ? "selected" : ""}>${meta.label}</option>`).join("")}</select></label>
      <label><span>Priority</span><select id="priority-filter"><option value="all">All priorities</option>${["high", "medium", "low"].map((value) => `<option value="${value}" ${filters.priority === value ? "selected" : ""}>${value[0].toUpperCase() + value.slice(1)}</option>`).join("")}</select></label>
      <label><span>Sort</span><select id="sort-filter">${[["nearest", "Nearest first"], ["latest", "Latest first"], ["priority", "Highest priority"], ["created", "Recently created"], ["progress", "Most progress"]].map(([value, label]) => `<option value="${value}" ${filters.sort === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
    </div>
  </section>
  <div class="results-heading"><p><strong>${result.length}</strong> ${result.length === 1 ? "deadline" : "deadlines"}</p>${filters.query || filters.status !== "all" || filters.priority !== "all" ? '<button class="text-button" data-action="clear-filters">Clear filters</button>' : ""}</div>
  ${result.length ? `<section class="card-grid deadline-list">${result.map(deadlineCard).join("")}</section>` : emptyState("No deadlines found", "Try clearing a filter or create a new deadline.", false)}`;
}

function inputField({ id, label, type = "text", value = "", required = false, error = "", placeholder = "", min, max }) {
  return `<label class="field ${error ? "field-error" : ""}" for="${id}"><span>${label}${required ? " *" : ""}</span><input id="${id}" name="${id}" type="${type}" value="${escapeHtml(value)}" ${placeholder ? `placeholder="${escapeHtml(placeholder)}"` : ""} ${required ? "required" : ""} ${min !== undefined ? `min="${min}"` : ""} ${max !== undefined ? `max="${max}"` : ""} aria-describedby="${id}-error" /><small id="${id}-error">${escapeHtml(error)}</small></label>`;
}

function toLocalInput(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function formPage(deadline = null, errors = {}) {
  const editing = Boolean(deadline);
  const values = deadline ?? { title: "", description: "", category: "", dueDateTime: "", priority: "medium", progress: 0, notes: "" };
  return `<section class="form-layout"><div class="form-intro"><p class="eyebrow">${editing ? "Keep it accurate" : "Put it on the horizon"}</p><h2>${editing ? "Update this deadline" : "What needs your attention?"}</h2><p>Add the essentials now. You can always return to update progress or notes.</p></div>
    <form id="deadline-form" class="deadline-form" data-id="${editing ? escapeHtml(deadline.id) : ""}" novalidate>
      ${inputField({ id: "title", label: "Title", value: values.title, required: true, error: errors.title, placeholder: "e.g. Submit research proposal" })}
      <label class="field field-wide" for="description"><span>Description</span><textarea id="description" name="description" rows="4" placeholder="What needs to be delivered?">${escapeHtml(values.description)}</textarea><small></small></label>
      ${inputField({ id: "category", label: "Category", value: values.category, placeholder: "Education, Work, Personal…" })}
      ${inputField({ id: "dueDateTime", label: "Due date & time", type: "datetime-local", value: toLocalInput(values.dueDateTime), required: true, error: errors.dueDateTime })}
      <label class="field" for="priority"><span>Priority</span><select id="priority" name="priority"><option value="high" ${values.priority === "high" ? "selected" : ""}>High</option><option value="medium" ${values.priority === "medium" ? "selected" : ""}>Medium</option><option value="low" ${values.priority === "low" ? "selected" : ""}>Low</option></select><small>${escapeHtml(errors.priority)}</small></label>
      <label class="field progress-field" for="progress"><span>Progress <output id="progress-output">${values.progress}%</output></span><input id="progress" name="progress" type="range" min="0" max="100" step="1" value="${values.progress}" /><small>${escapeHtml(errors.progress)}</small></label>
      <label class="field field-wide" for="notes"><span>Notes</span><textarea id="notes" name="notes" rows="4" placeholder="Links, reminders, or anything useful…">${escapeHtml(values.notes)}</textarea><small></small></label>
      <div class="form-actions"><a class="button button-secondary" href="${editing ? `#/deadlines/${encodeURIComponent(deadline.id)}` : "#/deadlines"}">Cancel</a><button class="button button-primary" type="submit">${editing ? "Save changes" : "Create deadline"}</button></div>
    </form>
  </section>`;
}

function detailPage(deadline) {
  if (!deadline) return emptyState("Deadline not found", "It may have been removed on another device.", false);
  const status = calculateStatus(deadline);
  return `<article class="detail-layout">
    <section class="detail-primary status-edge-${STATUS_META[status].tone}">
      <div class="detail-heading"><div><p class="card-kicker">${escapeHtml(deadline.category || "Uncategorized")}</p><h2>${escapeHtml(deadline.title)}</h2></div>${statusBadge(deadline)}</div>
      <p class="detail-description">${escapeHtml(deadline.description || "No description added.")}</p>
      <div class="detail-countdown"><p>${status === "overdue" ? "Overdue by" : "Time remaining"}</p>${countdown(deadline, { large: true })}</div>
      <div class="detail-actions">
        ${deadline.completionState === "incomplete" ? `<button class="button button-accent" data-action="complete" data-id="${escapeHtml(deadline.id)}">Mark complete</button><button class="button button-secondary" data-action="cancel" data-id="${escapeHtml(deadline.id)}">Cancel deadline</button>` : ""}
        <a class="button button-secondary" href="#/deadlines/${encodeURIComponent(deadline.id)}/edit">Edit</a>
        <button class="button button-danger-quiet" data-action="delete" data-id="${escapeHtml(deadline.id)}">Delete</button>
      </div>
    </section>
    <aside class="detail-meta">
      <h3>Deadline details</h3>
      ${metaRow("Due", formatDateTime(deadline.dueDateTime))}
      ${metaRow("Priority", deadline.priority[0].toUpperCase() + deadline.priority.slice(1))}
      ${metaRow("Progress", `${deadline.progress}%`)}
      ${metaRow("Created", formatDateTime(deadline.createdAt))}
      ${metaRow("Updated", formatDateTime(deadline.updatedAt))}
      ${deadline.completedAt ? metaRow("Completed", formatDateTime(deadline.completedAt)) : ""}
      <div class="meta-notes"><span>Notes</span><p>${escapeHtml(deadline.notes || "No notes added.")}</p></div>
    </aside>
  </article>`;
}

function metaRow(label, value) {
  return `<div class="meta-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function render({ preserveFocus = false } = {}) {
  const activeId = preserveFocus ? document.activeElement?.id : null;
  const route = currentRoute();
  const items = getDeadlines();
  let title;
  let content;
  if (route.page === "dashboard") { title = "Dashboard"; content = dashboardPage(items); }
  else if (route.page === "deadlines") { title = "All deadlines"; content = deadlineListPage(items); }
  else if (route.page === "add") { title = "Add deadline"; content = formPage(); }
  else if (route.page === "edit") {
    const deadline = getDeadline(route.id);
    title = deadline ? "Edit deadline" : "Deadline not found";
    content = deadline ? formPage(deadline) : emptyState("Deadline not found", "It may have been removed on another device.", false);
  }
  else if (route.page === "detail") { title = "Deadline details"; content = detailPage(getDeadline(route.id)); }
  else { title = "Page not found"; content = emptyState("This page is off the clock", "Return to your dashboard to keep moving.", false); }
  app.innerHTML = shell(content, route, title);
  if (activeId) document.getElementById(activeId)?.focus();
  updateCountdowns();
  if (pendingToast) {
    const toast = pendingToast;
    pendingToast = null;
    queueMicrotask(() => showToast(toast.message, toast.tone));
  }
}

function showToast(message, tone = "default") {
  const region = document.querySelector("#toast-region");
  if (!region) return;
  clearTimeout(toastTimer);
  region.innerHTML = `<div class="toast toast-${tone}">${escapeHtml(message)}</div>`;
  toastTimer = setTimeout(() => { if (region) region.innerHTML = ""; }, 3500);
}

function navigateWithToast(hash, message, tone = "default") {
  pendingToast = { message, tone };
  if (location.hash === hash) render();
  else location.hash = hash;
}

function updateCountdowns() {
  document.querySelectorAll("[data-countdown]").forEach((element) => {
    const deadline = getDeadline(element.dataset.countdown);
    if (!deadline) return;
    const parts = remainingParts(deadline);
    element.setAttribute("aria-label", `${parts.expired ? "Overdue by" : "Time remaining"}: ${parts.days} days, ${parts.hours} hours, ${parts.minutes} minutes`);
    const values = [parts.days, parts.hours, parts.minutes, parts.seconds];
    element.querySelectorAll(".count-part strong").forEach((node, index) => { node.textContent = String(values[index]).padStart(2, "0"); });
  });
}

function completeDeadline(id) {
  const deadline = getDeadline(id);
  if (!deadline) return;
  const updated = { ...deadline, completionState: "completed", completedAt: new Date().toISOString(), progress: 100, updatedAt: new Date().toISOString() };
  saveDeadline(updated); queueUpdate(updated); render(); showToast("Deadline marked complete.", "success"); synchronize();
}

function cancelDeadline(id) {
  const deadline = getDeadline(id);
  if (!deadline) return;
  const updated = { ...deadline, completionState: "cancelled", completedAt: null, updatedAt: new Date().toISOString() };
  saveDeadline(updated); queueUpdate(updated); render(); showToast("Deadline cancelled."); synchronize();
}

function openDeleteDialog(id) {
  const deadline = getDeadline(id);
  if (!deadline) return;
  const root = document.querySelector("#dialog-root");
  root.innerHTML = `<div class="dialog-backdrop" data-action="close-dialog"><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabindex="-1"><span class="dialog-symbol" aria-hidden="true">!</span><h2 id="dialog-title">Delete “${escapeHtml(deadline.title)}”?</h2><p>This removes the deadline from this device and the server when you are online.</p><div class="dialog-actions"><button class="button button-secondary" data-action="close-dialog" autofocus>Keep deadline</button><button class="button button-danger" data-action="confirm-delete" data-id="${escapeHtml(id)}">Delete permanently</button></div></div></div>`;
  root.querySelector(".dialog").focus();
}

function closeDialog() {
  const root = document.querySelector("#dialog-root");
  if (root) root.innerHTML = "";
}

function handleSubmit(form) {
  const values = Object.fromEntries(new FormData(form));
  values.progress = Number(values.progress);
  const errors = validateDeadline(values);
  if (Object.keys(errors).length) {
    const existing = form.dataset.id ? { ...getDeadline(form.dataset.id), ...values } : values;
    const route = currentRoute();
    app.innerHTML = shell(formPage(form.dataset.id ? existing : null, errors), route, route.page === "edit" ? "Edit deadline" : "Add deadline");
    document.querySelector(".field-error input")?.focus();
    return;
  }

  if (form.dataset.id) {
    const current = getDeadline(form.dataset.id);
    const updated = { ...current, ...values, dueDateTime: new Date(values.dueDateTime).toISOString(), updatedAt: new Date().toISOString() };
    saveDeadline(updated); queueUpdate(updated); navigateWithToast(`#/deadlines/${encodeURIComponent(updated.id)}`, "Changes saved.", "success");
  } else {
    const deadline = createDeadline(values);
    saveDeadline(deadline); queueCreate(deadline); navigateWithToast(`#/deadlines/${encodeURIComponent(deadline.id)}`, "Deadline created.", "success");
  }
  synchronize();
}

app.addEventListener("submit", (event) => {
  if (event.target.matches("#deadline-form")) { event.preventDefault(); handleSubmit(event.target); }
});

app.addEventListener("input", (event) => {
  if (event.target.id === "progress") document.querySelector("#progress-output").textContent = `${event.target.value}%`;
  if (event.target.id === "deadline-search") {
    filters.query = event.target.value;
    const selection = event.target.selectionStart;
    render({ preserveFocus: true });
    const input = document.querySelector("#deadline-search");
    input?.setSelectionRange(selection, selection);
  }
});

app.addEventListener("change", (event) => {
  if (event.target.id === "status-filter") filters.status = event.target.value;
  else if (event.target.id === "priority-filter") filters.priority = event.target.value;
  else if (event.target.id === "sort-filter") filters.sort = event.target.value;
  else return;
  render();
});

app.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const { action, id } = target.dataset;
  if (action === "complete") completeDeadline(id);
  if (action === "cancel") cancelDeadline(id);
  if (action === "delete") openDeleteDialog(id);
  if (action === "close-dialog") { if (event.target === target || target.matches("button")) closeDialog(); }
  if (action === "confirm-delete") {
    removeDeadline(id); queueDelete(id); closeDialog(); navigateWithToast("#/deadlines", "Deadline deleted."); synchronize();
  }
  if (action === "clear-filters") { filters = { query: "", status: "all", priority: "all", sort: "nearest" }; render(); }
  if (action === "sync") { syncing = true; render(); await synchronize(); syncing = false; render(); showToast(getOutbox().length ? "Changes are still waiting to sync." : "Everything is up to date.", getOutbox().length ? "default" : "success"); }
});

window.addEventListener("hashchange", () => { render(); window.scrollTo({ top: 0, behavior: "instant" }); });
window.addEventListener("online", async () => { render(); await synchronize(); render(); showToast("Back online. Changes synchronized.", "success"); });
window.addEventListener("offline", () => { render(); showToast("You’re offline. Changes will stay safely on this device."); });
window.addEventListener("deadline-store-change", () => { if (!document.querySelector("#deadline-form")) render(); });
window.addEventListener("deadline-sync-start", () => { syncing = true; render(); });
window.addEventListener("deadline-sync-complete", (event) => { syncing = false; render(); if (!event.detail.synced && navigator.onLine) showToast("Couldn’t reach the server. Your changes are safe locally."); });

document.addEventListener("visibilitychange", () => { if (!document.hidden) { updateCountdowns(); render(); } });
setInterval(() => { if (!document.hidden) updateCountdowns(); }, 1000);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/service-worker.js").catch(() => {});
}

render();
synchronize();
