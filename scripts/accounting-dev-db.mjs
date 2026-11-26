import { readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

const root = resolve(import.meta.dirname, "..");
const mode = process.argv[2];
if (!["dry-run", "apply", "test", "test-foundation", "test-credit", "test-stock", "test-asset", "test-opening", "advisors", "validate"].includes(mode))
  throw new Error("Use dry-run, apply, test, test-foundation, test-credit, test-stock, test-asset, test-opening, advisors, or validate.");

function config(path) {
  return Object.fromEntries(readFileSync(path, "utf8").split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));
}

const env = config(resolve(root, ".env.accounting-dev.local"));
const linked = JSON.parse(readFileSync(resolve(root, "supabase/.temp/linked-project.json"), "utf8"));
if (!env.SUPABASE_DEV_PROJECT_REF || !env.SUPABASE_DB_PASSWORD
  || env.SUPABASE_DEV_PROJECT_REF === linked.ref
  || env.NEXT_PUBLIC_SUPABASE_URL !== `https://${env.SUPABASE_DEV_PROJECT_REF}.supabase.co`) {
  throw new Error("Development database target is missing or points to production.");
}

const validationPath = resolve(tmpdir(), `accounting-validation-${randomUUID()}.sql`);
if (mode === "validate") {
  const filename = process.argv[3] ?? "20261126044857_accounting_credit_corrections.sql";
  if (!/^\d{14}_[a-z0-9_]+\.sql$/.test(filename)) throw new Error("Invalid migration filename.");
  const migration = readFileSync(resolve(root, "supabase/migrations", filename), "utf8");
  writeFileSync(validationPath, `begin;\n${migration}\nrollback;\nselect 'passed' as migration_validation;\n`, { mode: 0o600 });
}

const args = ["test", "test-foundation", "test-credit", "test-stock", "test-asset", "test-opening"].includes(mode)
  ? ["supabase", "db", "query", "--linked", "--project-ref", env.SUPABASE_DEV_PROJECT_REF,
    "--file", resolve(root, mode === "test" ? "tests/accounting_period_smoke.sql"
      : mode === "test-foundation" ? "tests/accounting_database_smoke.sql"
      : mode === "test-credit" ? "tests/accounting_credit_correction_smoke.sql"
      : mode === "test-stock" ? "tests/accounting_inventory_correction_smoke.sql"
        : mode === "test-opening" ? "tests/accounting_opening_credit_smoke.sql"
          : "tests/accounting_asset_correction_smoke.sql")]
  : mode === "validate"
    ? ["supabase", "db", "query", "--linked", "--project-ref", env.SUPABASE_DEV_PROJECT_REF,
      "--file", validationPath]
  : mode === "advisors"
    ? ["supabase", "db", "advisors", "--linked", "--project-ref", env.SUPABASE_DEV_PROJECT_REF,
      "--type", "security", "--level", "warn", "--fail-on", "error"]
    : ["supabase", "db", "push", "--project-ref", env.SUPABASE_DEV_PROJECT_REF,
      "--password", env.SUPABASE_DB_PASSWORD, "--skip-vault",
      mode === "dry-run" ? "--dry-run" : "--yes"];
const child = spawn("npx", args, { cwd: root, stdio: "inherit" });
child.on("exit", (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
