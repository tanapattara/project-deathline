import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDeadlineServer } from "./api/app.js";
import { SqliteDeadlineRepository } from "./storage/sqlite-deadline-repository.js";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const databasePath = process.env.DATABASE_PATH ?? resolve(projectRoot, "data/deadlines.db");
const allowedOrigin = process.env.ALLOWED_ORIGIN ?? "*";
const staticRoot = resolve(projectRoot, "public");

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

const repository = new SqliteDeadlineRepository(databasePath);
const server = createDeadlineServer({ repository, allowedOrigin, staticRoot });

server.listen(port, () => {
  console.log(`Deadline API listening at http://localhost:${port}`);
  console.log(`SQLite database: ${databasePath}`);
});

function shutdown(signal) {
  console.log(`${signal} received; shutting down`);
  server.close(() => {
    repository.close();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
