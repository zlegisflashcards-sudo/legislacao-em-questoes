import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");
const guardUrl = new URL("./offline-network-guard.mjs", import.meta.url).href;
const inheritedNodeOptions = process.env.NODE_OPTIONS?.trim();
const nodeOptions = [inheritedNodeOptions, `--import=${guardUrl}`]
  .filter(Boolean)
  .join(" ");

const offlineEnvironment = {
  ...process.env,
  BUILD_OFFLINE: "true",
  NEXT_TELEMETRY_DISABLED: "1",
  NODE_OPTIONS: nodeOptions,
  GOOGLE_SHEETS_CSV_URL: "",
  NEXT_PUBLIC_RANKING_SHEET_ID: "",
  NEXT_PUBLIC_SUPABASE_URL: "https://offline.invalid",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "offline-build-placeholder",
  SUPABASE_SERVICE_ROLE_KEY: "offline-build-placeholder",
  OPENAI_API_KEY: "",
  RESEND_API_KEY: "",
  RESEND_FROM_EMAIL: "",
  HOTMART_HOTTOK: "",
  NEXT_PUBLIC_SITE_URL: "",
  VERCEL_URL: "",
  VERCEL_PROJECT_PRODUCTION_URL: "",
};

console.log("[build:offline] Offline mode active; external network is blocked.");

const build = spawn(process.execPath, [nextBin, "build"], {
  cwd: process.cwd(),
  env: offlineEnvironment,
  stdio: "inherit",
});

build.once("error", (error) => {
  console.error(`[build:offline] Could not start Next.js: ${error.message}`);
  process.exitCode = 1;
});

build.once("exit", (code, signal) => {
  if (signal) {
    console.error(`[build:offline] Next.js stopped by signal ${signal}.`);
    process.exitCode = 1;
    return;
  }

  process.exitCode = code ?? 1;
});
