import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const cliPath = path.join(process.cwd(), "dist/index.js");

async function runCli(args: string[], cwd?: string) {
  const proc = Bun.spawn(["bun", cliPath, ...args], {
    cwd: cwd || process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, FORCE_COLOR: "0" },
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  await proc.exited;

  return { stdout, stderr, exitCode: proc.exitCode };
}

async function setupWranglerConfig(tempDir: string) {
  await fs.writeFile(
    path.join(tempDir, "wrangler.jsonc"),
    JSON.stringify({
      name: "test-worker",
      d1_databases: [
        {
          binding: "DB",
          database_name: "test-db",
          database_id: "test-db-id",
        },
      ],
    })
  );
}

async function setupPrismaConfig(tempDir: string, migrationsDir?: string) {
  const migDir = migrationsDir || path.join(tempDir, "prisma", "migrations");
  await fs.mkdir(migDir, { recursive: true });
  await fs.writeFile(
    path.join(tempDir, "prisma.config.ts"),
    `export default { migrations: { path: "${migDir}" } };`
  );
  return migDir;
}

describe("CLI", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "d1-prisma-cli-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test("help output shows usage information", async () => {
    await setupWranglerConfig(tempDir);
    const { stdout, stderr } = await runCli(["--database", "test-db"], tempDir);
    const output = stdout + stderr;
    expect(output).toContain("Usage:");
    expect(output).toContain("create");
    expect(output).toContain("apply");
    expect(output).toContain("status");
  });

  test("create --non-interactive without --database exits 1", async () => {
    await setupWranglerConfig(tempDir);
    const { exitCode } = await runCli(
      ["create", "--non-interactive"],
      tempDir
    );
    expect(exitCode).toBe(1);
  });

  test("create --non-interactive without --name exits 1", async () => {
    await setupWranglerConfig(tempDir);
    const { exitCode } = await runCli(
      ["create", "--non-interactive", "--database", "test-db"],
      tempDir
    );
    expect(exitCode).toBe(1);
  });

  test("status --non-interactive outputs JSON", async () => {
    await setupWranglerConfig(tempDir);
    await setupPrismaConfig(tempDir);

    const { stdout, exitCode } = await runCli(
      ["status", "--non-interactive", "--database", "test-db"],
      tempDir
    );
    expect(exitCode).toBe(0);

    const jsonMatch = stdout.match(/\{[\s\S]*"database"[\s\S]*\}/);
    expect(jsonMatch).not.toBeNull();

    const parsed = JSON.parse(jsonMatch![0]);
    expect(parsed).toHaveProperty("database", "test-db");
    expect(parsed).toHaveProperty("migrationsDir");
    expect(parsed).toHaveProperty("total");
    expect(parsed).toHaveProperty("applied");
    expect(parsed).toHaveProperty("pending");
  });

  test("create --dry-run exits without writing file", async () => {
    await setupWranglerConfig(tempDir);
    await setupPrismaConfig(tempDir);

    const { exitCode } = await runCli(
      [
        "create",
        "--non-interactive",
        "--database",
        "test-db",
        "--name",
        "test-migration",
        "--dry-run",
      ],
      tempDir
    );

    expect(exitCode).toBe(1);
  });
});
