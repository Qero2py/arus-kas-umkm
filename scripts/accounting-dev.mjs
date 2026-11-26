import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

function readSimpleEnv(path) {
  return Object.fromEntries(readFileSync(path, "utf8").split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const separator = line.indexOf("=");
      if (separator < 1) throw new Error("Format konfigurasi development tidak valid.");
      return [line.slice(0, separator), line.slice(separator + 1)];
    }));
}

try {
  const config = readSimpleEnv(resolve(root, ".env.accounting-dev.local"));
  const production = JSON.parse(readFileSync(resolve(root, "supabase/.temp/linked-project.json"), "utf8"));
  const ref = config.SUPABASE_DEV_PROJECT_REF;
  if (!ref || ref === production.ref || config.NEXT_PUBLIC_SUPABASE_URL !== `https://${ref}.supabase.co`
    || !config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.startsWith("sb_publishable_")) {
    throw new Error("Konfigurasi Supabase development tidak cocok atau mengarah ke production.");
  }

  const task = process.argv.includes("--build") ? "build" : "dev";
  const command = task === "build" && process.argv.includes("--webpack")
    ? ["run", "build", "--", "--webpack"] : ["run", task];
  const child = spawn("npm", command, {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: config.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      NEXT_PUBLIC_SITE_URL: config.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
      VERCEL_OIDC_TOKEN: "",
    },
  });
  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));
  child.on("exit", (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
} catch (error) {
  console.error(error instanceof Error ? error.message : "Konfigurasi development gagal dibaca.");
  process.exitCode = 1;
}
