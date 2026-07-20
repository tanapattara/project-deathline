import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import {
  ValidationError,
  applyDeadlineChanges,
  buildDeadline,
  calculateDeadlineStatus,
  serializeDeadline
} from "../domain/deadline.js";

const MAX_BODY_BYTES = 1024 * 1024;
const DEADLINE_PATH = /^\/api\/deadlines\/([^/]+)$/;
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

function sendJson(response, statusCode, value, headers = {}) {
  const body = JSON.stringify(value);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    ...headers
  });
  response.end(body);
}

function sendNoContent(response) {
  response.writeHead(204);
  response.end();
}

function serveStatic(response, pathname, staticRoot) {
  if (!staticRoot) return false;
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const safePath = normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  let filename = join(staticRoot, safePath);
  if (!existsSync(filename) || statSync(filename).isDirectory()) filename = join(staticRoot, "index.html");

  const extension = extname(filename);
  response.writeHead(200, {
    "content-type": MIME_TYPES[extension] ?? "application/octet-stream",
    "cache-control": extension === ".html" ? "no-cache" : "public, max-age=3600"
  });
  createReadStream(filename).pipe(response);
  return true;
}

async function readJson(request) {
  const contentType = request.headers["content-type"] ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    const error = new Error("Content-Type must be application/json");
    error.statusCode = 415;
    throw error;
  }

  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error("Request body exceeds 1 MB");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Request body must contain valid JSON");
    error.statusCode = 400;
    throw error;
  }
}

function filterAndSort(deadlines, searchParams, now) {
  let result = deadlines;
  const query = searchParams.get("q")?.trim().toLowerCase();
  const status = searchParams.get("status")?.trim().toLowerCase();
  const priority = searchParams.get("priority")?.trim().toLowerCase();
  const category = searchParams.get("category")?.trim().toLowerCase();

  if (query) {
    result = result.filter((deadline) =>
      [deadline.title, deadline.description, deadline.category]
        .some((value) => value.toLowerCase().includes(query))
    );
  }
  if (status) result = result.filter((deadline) => calculateDeadlineStatus(deadline, now) === status);
  if (priority) result = result.filter((deadline) => deadline.priority === priority);
  if (category) result = result.filter((deadline) => deadline.category.toLowerCase() === category);

  const sort = searchParams.get("sort") ?? "nearest";
  return [...result].sort((a, b) => {
    if (sort === "latest") return Date.parse(b.dueDateTime) - Date.parse(a.dueDateTime);
    if (sort === "recently-created") return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    if (sort === "progress") return b.progress - a.progress;
    if (sort === "priority") {
      const rank = { high: 0, medium: 1, low: 2 };
      return rank[a.priority] - rank[b.priority] || Date.parse(a.dueDateTime) - Date.parse(b.dueDateTime);
    }
    return Date.parse(a.dueDateTime) - Date.parse(b.dueDateTime);
  });
}

export function createDeadlineServer({ repository, now = () => new Date(), allowedOrigin = "*", staticRoot = null }) {
  return createServer(async (request, response) => {
    response.setHeader("access-control-allow-origin", allowedOrigin);
    response.setHeader("access-control-allow-methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    response.setHeader("access-control-allow-headers", "content-type");

    if (request.method === "OPTIONS") return sendNoContent(response);

    try {
      const url = new URL(request.url, "http://localhost");

      if (url.pathname === "/api/health" && request.method === "GET") {
        return sendJson(response, 200, { status: "ok" });
      }

      if (url.pathname === "/api/deadlines") {
        if (request.method === "GET") {
          const currentTime = now();
          const items = filterAndSort(repository.list(), url.searchParams, currentTime)
            .map((deadline) => serializeDeadline(deadline, currentTime));
          return sendJson(response, 200, { items, total: items.length });
        }

        if (request.method === "POST") {
          const deadline = buildDeadline(await readJson(request), now());
          if (repository.findById(deadline.id)) {
            return sendJson(response, 409, { error: "Deadline ID already exists" });
          }
          const created = repository.create(deadline);
          return sendJson(response, 201, serializeDeadline(created, now()), {
            location: `/api/deadlines/${encodeURIComponent(created.id)}`
          });
        }
      }

      const match = url.pathname.match(DEADLINE_PATH);
      if (match) {
        const id = decodeURIComponent(match[1]);
        const existing = repository.findById(id);
        if (!existing) return sendJson(response, 404, { error: "Deadline not found" });

        if (request.method === "GET") {
          return sendJson(response, 200, serializeDeadline(existing, now()));
        }

        if (request.method === "PATCH" || request.method === "PUT") {
          const updated = applyDeadlineChanges(existing, await readJson(request), now(), {
            replace: request.method === "PUT"
          });
          return sendJson(response, 200, serializeDeadline(repository.update(updated), now()));
        }

        if (request.method === "DELETE") {
          repository.delete(id);
          return sendNoContent(response);
        }
      }

      if (request.method === "GET" && !url.pathname.startsWith("/api/")) {
        if (serveStatic(response, url.pathname, staticRoot)) return;
      }

      return sendJson(response, 404, { error: "Route not found" });
    } catch (error) {
      if (error instanceof ValidationError) {
        return sendJson(response, 422, { error: error.message, details: error.errors });
      }
      if (error.statusCode) return sendJson(response, error.statusCode, { error: error.message });

      console.error(error);
      return sendJson(response, 500, { error: "Internal server error" });
    }
  });
}
