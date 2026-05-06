import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const cliPath = path.join(process.cwd(), "dist/index.js");

// Resolve bun binary: try PATH first, then common install locations
function resolveBunPath(): string {
  const candidates = [
    process.env.BUN_RUNTIME,
    "/usr/local/bin/bun",
    "/usr/bin/bun",
    path.join(os.homedir(), ".bun", "bin", "bun"),
    "bun", // fallback — will work if in PATH
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      Bun.spawn([candidate, "--version"]);
      return candidate;
    } catch {
      // not found or not executable, try next
    }
  }
  return "bun";
}

const BUN = resolveBunPath();

// ── Helpers ──────────────────────────────────────────────────────────────────

async function runCli(args: string[], cwd?: string) {
  const proc = Bun.spawn([BUN, cliPath, ...args], {
    cwd: cwd || process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
    env: { ...processEnv(), FORCE_COLOR: "0" },
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  await proc.exited;

  if (proc.exitCode !== 0) {
    console.log("CLI FAILED:", args.join(" "));
    console.log("STDOUT:", stdout);
    console.log("STDERR:", stderr);
  }

  return { stdout, stderr, exitCode: proc.exitCode };
}

function processEnv(): Record<string, string> {
  const env: Record<string, string> = { ...process.env };
  // Ensure node_modules paths are resolvable for prisma/wrangler
  if (!env.NODE_PATH) {
    env.NODE_PATH = path.join(process.cwd(), "node_modules");
  }
  return env;
}

async function setupWranglerConfig(
  tempDir: string,
  dbName: string = "test-db",
  format: "jsonc" | "toml" = "jsonc"
) {
  if (format === "toml") {
    await fs.writeFile(
      path.join(tempDir, "wrangler.toml"),
      `[d1_databases]
binding = "DB"
database_name = "${dbName}"
database_id = "${dbName}-id"`
    );
  } else {
    await fs.writeFile(
      path.join(tempDir, "wrangler.jsonc"),
      JSON.stringify({
        name: "test-worker",
        d1_databases: [
          {
            binding: "DB",
            database_name: dbName,
            database_id: `${dbName}-id`,
          },
        ],
      })
    );
  }
}

/**
 * Create a prisma.config.ts with datasource URL.
 * Prisma 7 requires datasource URL in prisma.config.ts, NOT in schema.prisma.
 */
async function setupPrismaConfig(
  tempDir: string,
  migrationsDir?: string
): Promise<string> {
  const migDir = migrationsDir || path.join(tempDir, "prisma", "migrations");
  await fs.mkdir(migDir, { recursive: true });

  // prisma.config.ts must include datasource URL for Prisma 7
  const configContent = `import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "${migDir.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}",
  },
  datasource: {
    url: "file:${path.join(tempDir, "prisma", "dev.db").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}",
  },
});
`;
  await fs.writeFile(path.join(tempDir, "prisma.config.ts"), configContent);
  return migDir;
}

async function setupPrismaSchema(tempDir: string, schemaContent?: string) {
  const prismaDir = path.join(tempDir, "prisma");
  await fs.mkdir(prismaDir, { recursive: true });
  const defaultSchema = `generator client {
  provider = "prisma-client"
  output   = "../generated/prisma"
  runtime  = "cloudflare"
}

datasource db {
  provider = "sqlite"
}

model User {
  id    Int     @id @default(autoincrement())
  email String  @unique
  name  String?
}`;
  await fs.writeFile(
    path.join(prismaDir, "schema.prisma"),
    schemaContent || defaultSchema
  );
}

async function setupSchemaWithNewModel(
  tempDir: string,
  modelName: string,
  fields: string
) {
  const schema = `generator client {
  provider = "prisma-client"
  output   = "../generated/prisma"
  runtime  = "cloudflare"
}

datasource db {
  provider = "sqlite"
}

model User {
  id    Int     @id @default(autoincrement())
  email String  @unique
  name  String?
}

model ${modelName} {
  id    Int     @id @default(autoincrement())
  ${fields}
}`;
  await fs.writeFile(path.join(tempDir, "prisma", "schema.prisma"), schema);
}

async function readMigrationFiles(migrationsDir: string): Promise<string[]> {
  const entries = await fs.readdir(migrationsDir);
  return entries.filter((f) => f.endsWith(".sql") && /^\d{4}_/.test(f)).sort();
}

async function readStateFile(migrationsDir: string): Promise<{
  applied: string[];
  lastSync?: string;
}> {
  const statePath = path.join(migrationsDir, ".d1-prisma-state.json");
  const content = await fs.readFile(statePath, "utf-8");
  return JSON.parse(content);
}

// ── Test Suite ───────────────────────────────────────────────────────────────

describe("Integration: Migration Create + Apply", () => {
  let tempDir: string;
  let migrationsDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "d1-prisma-integration-")
    );
    migrationsDir = path.join(tempDir, "prisma", "migrations");
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // ── 1. Initial migration (baseline) ─────────────────────────────────────

  test("creates initial migration file with --baseline", async () => {
    await setupWranglerConfig(tempDir);
    await setupPrismaConfig(tempDir);
    await setupPrismaSchema(tempDir);

    const { exitCode } = await runCli(
      [
        "create",
        "--non-interactive",
        "--database",
        "test-db",
        "--name",
        "init",
        "--baseline",
      ],
      tempDir
    );

    expect(exitCode).toBe(0);

    // Verify migration file was created
    const files = await readMigrationFiles(migrationsDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^0001_init\.sql$/);

    // Verify migration file contains valid SQL
    const sql = await fs.readFile(path.join(migrationsDir, files[0]), "utf-8");
    expect(sql.length).toBeGreaterThan(0);
    // Should contain CREATE TABLE for User model
    expect(sql.toLowerCase()).toContain("create table");
    expect(sql.toLowerCase()).toContain("user");

    // Verify state file marks migration as applied
    const state = await readStateFile(migrationsDir);
    expect(state.applied).toContain("0001_init");
    expect(state.lastSync).toBeDefined();
  });

  test("creates initial migration without --baseline (not applied yet)", async () => {
    await setupWranglerConfig(tempDir);
    await setupPrismaConfig(tempDir);
    await setupPrismaSchema(tempDir);

    const { exitCode } = await runCli(
      [
        "create",
        "--non-interactive",
        "--database",
        "test-db",
        "--name",
        "init",
      ],
      tempDir
    );

    expect(exitCode).toBe(0);

    const files = await readMigrationFiles(migrationsDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^0001_init\.sql$/);

    // State file should NOT mark it as applied (no --baseline)
    const statePath = path.join(migrationsDir, ".d1-prisma-state.json");
    const stateExists = await fs
      .access(statePath)
      .then(() => true)
      .catch(() => false);
    // State file may not exist if no migrations were previously applied
    if (stateExists) {
      const state = await readStateFile(migrationsDir);
      expect(state.applied).not.toContain("0001_init");
    }
  });

  // ── 2. Schema change migration ──────────────────────────────────────────

  test("creates incremental migration after schema change", async () => {
    await setupWranglerConfig(tempDir);
    await setupPrismaConfig(tempDir);
    await setupPrismaSchema(tempDir);

    // Create baseline first
    await runCli(
      [
        "create",
        "--non-interactive",
        "--database",
        "test-db",
        "--name",
        "init",
        "--baseline",
      ],
      tempDir
    );

    // Now add a new model to the schema
    await setupSchemaWithNewModel(
      tempDir,
      "Post",
      "title  String\nbody   String?\nuserId Int"
    );

    const { exitCode } = await runCli(
      [
        "create",
        "--non-interactive",
        "--database",
        "test-db",
        "--name",
        "add-posts",
      ],
      tempDir
    );

    expect(exitCode).toBe(0);

    const files = await readMigrationFiles(migrationsDir);
    expect(files).toHaveLength(2);
    expect(files[1]).toMatch(/^0002_add-posts\.sql$/);

    // Verify the new migration contains CREATE TABLE for Post
    const sql = await fs.readFile(path.join(migrationsDir, files[1]), "utf-8");
    expect(sql.toLowerCase()).toContain("create table");
    expect(sql.toLowerCase()).toContain("post");
  });

  // ── 3. Apply migrations to local D1 ─────────────────────────────────────

  test("applies pending migrations to local D1 database", async () => {
    await setupWranglerConfig(tempDir);
    await setupPrismaConfig(tempDir);
    await setupPrismaSchema(tempDir);

    // Create baseline (not applied yet)
    await runCli(
      [
        "create",
        "--non-interactive",
        "--database",
        "test-db",
        "--name",
        "init",
      ],
      tempDir
    );

    // Apply migrations
    const { exitCode: applyExitCode, stdout: applyStdout } = await runCli(
      ["apply", "--non-interactive", "--database", "test-db"],
      tempDir
    );

    expect(applyExitCode).toBe(0);
    expect(applyStdout).toContain("successfully");
  });

  // ── 4. Status command ───────────────────────────────────────────────────

  test("status shows correct pending/applied migrations", async () => {
    await setupWranglerConfig(tempDir);
    await setupPrismaConfig(tempDir);
    await setupPrismaSchema(tempDir);

    // Create baseline without applying
    await runCli(
      [
        "create",
        "--non-interactive",
        "--database",
        "test-db",
        "--name",
        "init",
        "--baseline",
      ],
      tempDir
    );

    // Add another migration
    await setupSchemaWithNewModel(tempDir, "Post", "title  String\nuserId Int");

    await runCli(
      [
        "create",
        "--non-interactive",
        "--database",
        "test-db",
        "--name",
        "add-posts",
      ],
      tempDir
    );

    // Check status
    const { stdout, exitCode } = await runCli(
      ["status", "--non-interactive", "--database", "test-db"],
      tempDir
    );

    expect(exitCode).toBe(0);

    const jsonMatch = stdout.match(/\{[\s\S]*"database"[\s\S]*\}/);
    expect(jsonMatch).not.toBeNull();

    const parsed = JSON.parse(jsonMatch![0]);
    expect(parsed.database).toBe("test-db");
    expect(parsed.total).toBe(2);
    expect(parsed.applied).toContain("0001_init");
    expect(parsed.pending).toContain("0002_add-posts");
  });

  // ── 5. d1-prisma.config.json support ──────────────────────────────────────

  async function setupD1PrismaConfig(tempDir: string) {
    await fs.writeFile(
      path.join(tempDir, "d1-prisma.config.json"),
      JSON.stringify({
        database: "test-db",
      })
    );
  }

  test("reads config from d1-prisma.config.json", async () => {
    await setupWranglerConfig(tempDir);
    await setupD1PrismaConfig(tempDir);
    await setupPrismaConfig(tempDir);
    await setupPrismaSchema(tempDir);

    const { exitCode } = await runCli(
      ["create", "--non-interactive", "--name", "init", "--baseline"],
      tempDir
    );

    expect(exitCode).toBe(0);
  });

  // ── 7. TOML wrangler config support ─────────────────────────────────────

  test("works with wrangler.toml format", async () => {
    await setupWranglerConfig(tempDir, "test-db", "toml");
    await setupPrismaConfig(tempDir);
    await setupPrismaSchema(tempDir);

    const { exitCode } = await runCli(
      [
        "create",
        "--non-interactive",
        "--database",
        "test-db",
        "--name",
        "init",
        "--baseline",
      ],
      tempDir
    );

    expect(exitCode).toBe(0);

    const files = await readMigrationFiles(migrationsDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^0001_init\.sql$/);
  });

  // ── 8. Migration file naming convention ─────────────────────────────────

  test("generates sequential versioned migration files", async () => {
    await setupWranglerConfig(tempDir);
    await setupPrismaConfig(tempDir);
    await setupPrismaSchema(tempDir);

    // Create 3 migrations
    for (const name of ["init", "add-users", "add-posts"]) {
      await runCli(
        [
          "create",
          "--non-interactive",
          "--database",
          "test-db",
          "--name",
          name,
          "--baseline",
        ],
        tempDir
      );
    }

    const files = await readMigrationFiles(migrationsDir);
    expect(files).toHaveLength(3);
    expect(files[0]).toBe("0001_init.sql");
    expect(files[1]).toBe("0002_add-users.sql");
    expect(files[2]).toBe("0003_add-posts.sql");
  });

  // ── 9. State file persistence ───────────────────────────────────────────

  test("state file persists across multiple operations", async () => {
    await setupWranglerConfig(tempDir);
    await setupPrismaConfig(tempDir);
    await setupPrismaSchema(tempDir);

    // Create first baseline
    await runCli(
      [
        "create",
        "--non-interactive",
        "--database",
        "test-db",
        "--name",
        "init",
        "--baseline",
      ],
      tempDir
    );

    let state = await readStateFile(migrationsDir);
    expect(state.applied).toContain("0001_init");

    // Create second migration (not baseline - should be pending)
    await setupSchemaWithNewModel(tempDir, "Post", "title  String\nuserId Int");

    await runCli(
      [
        "create",
        "--non-interactive",
        "--database",
        "test-db",
        "--name",
        "add-posts",
      ],
      tempDir
    );

    // State should still only have the first migration
    state = await readStateFile(migrationsDir);
    expect(state.applied).toContain("0001_init");
    expect(state.applied).not.toContain("0002_add-posts");

    // Apply migrations
    await runCli(
      ["apply", "--non-interactive", "--database", "test-db"],
      tempDir
    );

    // After apply, both should be marked
    state = await readStateFile(migrationsDir);
    expect(state.applied).toContain("0001_init");
    expect(state.applied).toContain("0002_add-posts");
    expect(state.lastSync).toBeDefined();
  });

  // ── 10. Custom migrations directory ─────────────────────────────────────

  test("respects custom migrations directory via --migrations-dir", async () => {
    await setupWranglerConfig(tempDir);
    await setupPrismaSchema(tempDir);

    const customMigrationsDir = path.join(tempDir, "custom-migrations");

    const { exitCode } = await runCli(
      [
        "create",
        "--non-interactive",
        "--database",
        "test-db",
        "--name",
        "init",
        "--baseline",
        "--migrations-dir",
        customMigrationsDir,
      ],
      tempDir
    );

    expect(exitCode).toBe(0);

    // Migration should be in custom directory, not default
    const customFiles = await readMigrationFiles(customMigrationsDir);
    expect(customFiles).toHaveLength(1);
    expect(customFiles[0]).toMatch(/^0001_init\.sql$/);

    // Default directory should not exist
    const defaultDir = path.join(tempDir, "prisma", "migrations");
    const defaultExists = await fs
      .access(defaultDir)
      .then(() => true)
      .catch(() => false);
    expect(defaultExists).toBe(false);
  });

  // ── 11. Dry-run does not write files ────────────────────────────────────

  test("dry-run generates SQL without writing file", async () => {
    await setupWranglerConfig(tempDir);
    await setupPrismaConfig(tempDir);
    await setupPrismaSchema(tempDir);

    const { exitCode, stdout } = await runCli(
      [
        "create",
        "--non-interactive",
        "--database",
        "test-db",
        "--name",
        "init",
        "--dry-run",
      ],
      tempDir
    );

    // dry-run should succeed (exit 0) and print SQL to stdout
    expect(exitCode).toBe(0);
    expect(stdout.length).toBeGreaterThan(0);
    expect(stdout.toLowerCase()).toContain("create table");

    // No migration file should be created
    const files = await readMigrationFiles(migrationsDir);
    expect(files).toHaveLength(0);
  });

  // ── 12. Error: no D1 databases configured ──────────────────────────────

  test("exits 1 when no D1 databases configured", async () => {
    await setupPrismaConfig(tempDir);
    await setupPrismaSchema(tempDir);
    // No wrangler config

    const { exitCode } = await runCli(
      [
        "create",
        "--non-interactive",
        "--database",
        "test-db",
        "--name",
        "init",
      ],
      tempDir
    );

    expect(exitCode).toBe(1);
  });

  // ── 13. Full lifecycle: create → apply → status → schema change → create → apply ──

  test("full migration lifecycle", async () => {
    await setupWranglerConfig(tempDir);
    await setupPrismaConfig(tempDir);
    await setupPrismaSchema(tempDir);

    // Step 1: Create baseline
    let result = await runCli(
      [
        "create",
        "--non-interactive",
        "--database",
        "test-db",
        "--name",
        "init",
        "--baseline",
      ],
      tempDir
    );
    expect(result.exitCode).toBe(0);

    let files = await readMigrationFiles(migrationsDir);
    expect(files).toHaveLength(1);

    // Step 2: Check status - nothing pending
    result = await runCli(
      ["status", "--non-interactive", "--database", "test-db"],
      tempDir
    );
    expect(result.exitCode).toBe(0);
    const jsonMatch1 = result.stdout.match(/\{[\s\S]*\}/);
    const status1 = JSON.parse(jsonMatch1![0]);
    expect(status1.pending).toHaveLength(0);

    // Step 3: Add new model
    await setupSchemaWithNewModel(
      tempDir,
      "Post",
      "title  String\nbody   String?\nuserId Int"
    );

    // Step 4: Create migration for schema change
    result = await runCli(
      [
        "create",
        "--non-interactive",
        "--database",
        "test-db",
        "--name",
        "add-posts",
      ],
      tempDir
    );
    expect(result.exitCode).toBe(0);

    files = await readMigrationFiles(migrationsDir);
    expect(files).toHaveLength(2);
    expect(files[1]).toMatch(/^0002_add-posts\.sql$/);

    // Step 5: Check status - one pending
    result = await runCli(
      ["status", "--non-interactive", "--database", "test-db"],
      tempDir
    );
    expect(result.exitCode).toBe(0);
    const jsonMatch2 = result.stdout.match(/\{[\s\S]*\}/);
    const status2 = JSON.parse(jsonMatch2![0]);
    expect(status2.pending).toHaveLength(1);
    expect(status2.pending[0]).toContain("0002_add-posts");

    // Step 6: Apply pending migrations
    result = await runCli(
      ["apply", "--non-interactive", "--database", "test-db"],
      tempDir
    );
    expect(result.exitCode).toBe(0);

    // Step 7: Verify state after apply
    const state = await readStateFile(migrationsDir);
    expect(state.applied).toContain("0001_init");
    expect(state.applied).toContain("0002_add-posts");

    // Step 8: Status should show nothing pending
    result = await runCli(
      ["status", "--non-interactive", "--database", "test-db"],
      tempDir
    );
    const jsonMatch3 = result.stdout.match(/\{[\s\S]*\}/);
    const status3 = JSON.parse(jsonMatch3![0]);
    expect(status3.pending).toHaveLength(0);
    expect(status3.applied).toHaveLength(2);
  });
});
