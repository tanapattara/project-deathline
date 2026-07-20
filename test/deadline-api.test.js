import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createDeadlineServer } from "../src/api/app.js";
import { SqliteDeadlineRepository } from "../src/storage/sqlite-deadline-repository.js";
import { fileURLToPath } from "node:url";

const fixedNow = new Date("2026-07-20T10:00:00.000Z");
const repository = new SqliteDeadlineRepository(":memory:");
const staticRoot = fileURLToPath(new URL("../public", import.meta.url));
const server = createDeadlineServer({ repository, now: () => new Date(fixedNow), staticRoot });
let baseUrl;

before(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  repository.close();
});

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  return {
    response,
    body: text ? JSON.parse(text) : null
  };
}

test("health endpoint reports that the API is available", async () => {
  const { response, body } = await request("/api/health");
  assert.equal(response.status, 200);
  assert.deepEqual(body, { status: "ok" });
});

test("server delivers the frontend application and PWA manifest", async () => {
  const home = await fetch(`${baseUrl}/`);
  assert.equal(home.status, 200);
  assert.match(home.headers.get("content-type"), /text\/html/);
  assert.match(await home.text(), /<title>Deadline<\/title>/);

  const manifest = await fetch(`${baseUrl}/manifest.webmanifest`);
  assert.equal(manifest.status, 200);
  assert.match(manifest.headers.get("content-type"), /application\/manifest\+json/);
  assert.equal((await manifest.json()).display, "standalone");
});

test("deadline CRUD lifecycle persists and returns calculated status", async () => {
  const createdResult = await request("/api/deadlines", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "Submit Mini Project",
      description: "Submit source code and demonstration video",
      category: "Education",
      dueDateTime: "2026-07-21T10:00:00.000Z",
      priority: "HIGH",
      progress: 60
    })
  });

  assert.equal(createdResult.response.status, 201);
  assert.match(createdResult.body.id, /^deadline-/);
  assert.equal(createdResult.body.priority, "high");
  assert.equal(createdResult.body.status, "due-soon");
  assert.equal(createdResult.response.headers.get("location"), `/api/deadlines/${createdResult.body.id}`);

  const id = createdResult.body.id;
  const readResult = await request(`/api/deadlines/${id}`);
  assert.equal(readResult.response.status, 200);
  assert.equal(readResult.body.title, "Submit Mini Project");

  const patchResult = await request(`/api/deadlines/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ completionState: "completed", progress: 100 })
  });
  assert.equal(patchResult.response.status, 200);
  assert.equal(patchResult.body.completionState, "completed");
  assert.equal(patchResult.body.completedAt, fixedNow.toISOString());
  assert.equal(patchResult.body.status, "completed-on-time");

  const deleteResult = await request(`/api/deadlines/${id}`, { method: "DELETE" });
  assert.equal(deleteResult.response.status, 204);
  assert.equal(deleteResult.body, null);

  const missingResult = await request(`/api/deadlines/${id}`);
  assert.equal(missingResult.response.status, 404);
  assert.equal(missingResult.body.error, "Deadline not found");
});

test("invalid deadline input returns field-level validation errors", async () => {
  const { response, body } = await request("/api/deadlines", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "", priority: "urgent", progress: 101 })
  });

  assert.equal(response.status, 422);
  assert.equal(body.error, "Deadline validation failed");
  assert.equal(body.details.title, "is required");
  assert.equal(body.details.dueDateTime, "is required");
  assert.match(body.details.priority, /high, medium, low/);
  assert.match(body.details.progress, /between 0 and 100/);
});

test("create accepts an offline client ID and prevents duplicate replay", async () => {
  const id = "deadline-123e4567-e89b-42d3-a456-426614174000";
  const payload = {
    id,
    title: "Created offline",
    dueDateTime: "2026-07-23T10:00:00.000Z"
  };

  const created = await request("/api/deadlines", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.id, id);

  const replayed = await request("/api/deadlines", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  assert.equal(replayed.response.status, 409);
  assert.equal(replayed.body.error, "Deadline ID already exists");

  const updateWithId = await request(`/api/deadlines/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id })
  });
  assert.equal(updateWithId.response.status, 422);
});

test("list endpoint supports search, status filtering, and priority sorting", async () => {
  const records = [
    {
      title: "Prepare lecture",
      description: "Create database slides",
      category: "Teaching",
      dueDateTime: "2026-07-25T10:00:00.000Z",
      priority: "medium"
    },
    {
      title: "Pay electricity bill",
      description: "Monthly payment",
      category: "Personal",
      dueDateTime: "2026-07-20T18:00:00.000Z",
      priority: "high"
    },
    {
      title: "Old assignment",
      category: "Education",
      dueDateTime: "2026-07-19T10:00:00.000Z",
      priority: "low"
    }
  ];

  for (const record of records) {
    const result = await request("/api/deadlines", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(record)
    });
    assert.equal(result.response.status, 201);
  }

  const searchResult = await request("/api/deadlines?q=database");
  assert.equal(searchResult.body.total, 1);
  assert.equal(searchResult.body.items[0].title, "Prepare lecture");

  const overdueResult = await request("/api/deadlines?status=overdue");
  assert.equal(overdueResult.body.total, 1);
  assert.equal(overdueResult.body.items[0].title, "Old assignment");

  const sortedResult = await request("/api/deadlines?sort=priority");
  assert.equal(sortedResult.body.items[0].priority, "high");
});

test("PUT replaces editable fields while retaining server-owned identity fields", async () => {
  const created = await request("/api/deadlines", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "Original",
      notes: "Remove this on replacement",
      dueDateTime: "2026-08-01T12:00:00.000Z",
      priority: "high"
    })
  });

  const replaced = await request(`/api/deadlines/${created.body.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "Replacement",
      dueDateTime: "2026-08-02T12:00:00.000Z"
    })
  });

  assert.equal(replaced.response.status, 200);
  assert.equal(replaced.body.id, created.body.id);
  assert.equal(replaced.body.createdAt, created.body.createdAt);
  assert.equal(replaced.body.notes, "");
  assert.equal(replaced.body.priority, "medium");
});
