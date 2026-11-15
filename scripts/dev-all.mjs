#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const isWindows = process.platform === "win32";
const pythonExe = isWindows
  ? join("services", "api", ".venv", "Scripts", "python.exe")
  : join("services", "api", ".venv", "bin", "python");

if (!existsSync(pythonExe)) {
  console.error(`Python venv interpreter not found at ${pythonExe}`);
  console.error("Please run: uv venv services/api/.venv && uv pip install -r services/api/requirements.txt --python services/api/.venv");
  process.exit(1);
}

console.log("[dev:all] Starting FastAPI server on http://127.0.0.1:8000...");
const apiProcess = spawn(pythonExe, ["-m", "uvicorn", "services.api.main:app", "--host", "127.0.0.1", "--port", "8000", "--reload"], {
  stdio: "inherit",
  shell: isWindows,
  env: {
    ...process.env,
    PYTHONPATH: ".",
    HANOS_ENV: process.env.HANOS_ENV || "development", // API docs and local CORS on; production is the default elsewhere
  },
});

console.log("[dev:all] Starting Next.js dev server on http://localhost:3000...");
const nextProcess = spawn(isWindows ? "npm.cmd" : "npm", ["run", "dev"], {
  stdio: "inherit",
  shell: isWindows,
  env: {
    ...process.env,
    API_BASE_URL: process.env.API_BASE_URL || "http://127.0.0.1:8000",
  },
});

function cleanup() {
  console.log("\n[dev:all] Shutting down servers...");
  apiProcess.kill();
  nextProcess.kill();
  process.exit(0);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
