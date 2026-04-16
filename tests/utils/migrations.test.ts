import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  getNextVersion,
  getAppliedMigrations,
  markMigrationApplied,
  isInitialMigration,
  getPendingMigrations,
  getMigrationFiles,
  ensureMigrationsDir,
  getStateFilePath,
  getMigrationsDirFromConfig,
} from "../../src/utils/migrations.js";

describe("getNextVersion", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "d1-prisma-version-"));
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test("returns 0001 when no migration files exist", async () => {
    const version = await getNextVersion(tempDir);
    expect(version).toBe("0001");
  });

  test("returns 0002 when one migration file exists", async () => {
    await fs.writeFile(path.join(tempDir, "0001_init.sql"), "");
    const version = await getNextVersion(tempDir);
    expect(version).toBe("0002");
  });

  test("returns 0010 when 9 migration files exist", async () => {
    for (let i = 1; i <= 9; i++) {
      await fs.writeFile(
        path.join(tempDir, `${String(i).padStart(4, "0")}_migration${i}.sql`),
        ""
      );
    }
    const version = await getNextVersion(tempDir);
    expect(version).toBe("0010");
  });

  test("ignores non-sql files", async () => {
    await fs.writeFile(path.join(tempDir, "0001_init.sql"), "");
    await fs.writeFile(path.join(tempDir, "readme.md"), "");
    await fs.writeFile(path.join(tempDir, ".gitkeep"), "");
    const version = await getNextVersion(tempDir);
    expect(version).toBe("0002");
  });
});

describe("getAppliedMigrations", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "d1-prisma-applied-"));
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test("returns empty applied array when state file does not exist", async () => {
    const stateFile = path.join(tempDir, ".d1-prisma-state.json");
    const state = await getAppliedMigrations(stateFile);
    expect(state).toEqual({ applied: [] });
  });

  test("reads applied migrations from state file", async () => {
    const stateFile = path.join(tempDir, ".d1-prisma-state.json");
    const stateContent = {
      applied: ["0001_init", "0002_add-users"],
      lastSync: "2024-01-01T00:00:00.000Z",
    };
    await fs.writeFile(stateFile, JSON.stringify(stateContent));
    const state = await getAppliedMigrations(stateFile);
    expect(state.applied).toEqual(["0001_init", "0002_add-users"]);
    expect(state.lastSync).toBe("2024-01-01T00:00:00.000Z");
  });
});

describe("markMigrationApplied", () => {
  let tempDir: string;
  let stateFile: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "d1-prisma-mark-"));
    await fs.mkdir(tempDir, { recursive: true });
    stateFile = path.join(tempDir, ".d1-prisma-state.json");
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test("adds migration to applied list", async () => {
    await markMigrationApplied(stateFile, "0001", "init");
    const state = await getAppliedMigrations(stateFile);
    expect(state.applied).toContain("0001_init");
    expect(state.lastSync).toBeDefined();
  });

  test("deduplicates migrations", async () => {
    await markMigrationApplied(stateFile, "0001", "init");
    await markMigrationApplied(stateFile, "0001", "init");
    const state = await getAppliedMigrations(stateFile);
    const count = state.applied.filter((m) => m === "0001_init").length;
    expect(count).toBe(1);
  });

  test("appends to existing applied list", async () => {
    await fs.writeFile(
      stateFile,
      JSON.stringify({ applied: ["0001_init"], lastSync: "2024-01-01T00:00:00.000Z" })
    );
    await markMigrationApplied(stateFile, "0002", "add-users");
    const state = await getAppliedMigrations(stateFile);
    expect(state.applied).toContain("0001_init");
    expect(state.applied).toContain("0002_add-users");
  });
});

describe("isInitialMigration", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "d1-prisma-initial-"));
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test("returns true when no migration files exist", async () => {
    const result = await isInitialMigration(tempDir);
    expect(result).toBe(true);
  });

  test("returns false when migration files exist", async () => {
    await fs.writeFile(path.join(tempDir, "0001_init.sql"), "");
    const result = await isInitialMigration(tempDir);
    expect(result).toBe(false);
  });

  test("ignores non-sql files", async () => {
    await fs.writeFile(path.join(tempDir, ".gitkeep"), "");
    await fs.writeFile(path.join(tempDir, "readme.md"), "");
    const result = await isInitialMigration(tempDir);
    expect(result).toBe(true);
  });
});

describe("getPendingMigrations", () => {
  let tempDir: string;
  let stateFile: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "d1-prisma-pending-"));
    await fs.mkdir(tempDir, { recursive: true });
    stateFile = path.join(tempDir, ".d1-prisma-state.json");
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test("returns all migrations as pending when state is empty", async () => {
    await fs.writeFile(path.join(tempDir, "0001_init.sql"), "");
    await fs.writeFile(path.join(tempDir, "0002_add-users.sql"), "");
    const pending = await getPendingMigrations(tempDir, stateFile);
    expect(pending).toEqual(["0001_init.sql", "0002_add-users.sql"]);
  });

  test("returns only unapplied migrations", async () => {
    await fs.writeFile(path.join(tempDir, "0001_init.sql"), "");
    await fs.writeFile(path.join(tempDir, "0002_add-users.sql"), "");
    await fs.writeFile(
      stateFile,
      JSON.stringify({ applied: ["0001_init"] })
    );
    const pending = await getPendingMigrations(tempDir, stateFile);
    expect(pending).toEqual(["0002_add-users.sql"]);
  });

  test("returns empty array when all migrations applied", async () => {
    await fs.writeFile(path.join(tempDir, "0001_init.sql"), "");
    await fs.writeFile(
      stateFile,
      JSON.stringify({ applied: ["0001_init"] })
    );
    const pending = await getPendingMigrations(tempDir, stateFile);
    expect(pending).toEqual([]);
  });
});

describe("getMigrationFiles", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "d1-prisma-files-"));
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test("returns only sql files matching pattern", async () => {
    await fs.writeFile(path.join(tempDir, "0001_init.sql"), "");
    await fs.writeFile(path.join(tempDir, "0002_add-users.sql"), "");
    await fs.writeFile(path.join(tempDir, "readme.md"), "");
    await fs.writeFile(path.join(tempDir, ".gitkeep"), "");
    const files = await getMigrationFiles(tempDir);
    expect(files).toEqual(["0001_init.sql", "0002_add-users.sql"]);
  });

  test("filters out files without proper version prefix", async () => {
    await fs.writeFile(path.join(tempDir, "0001_init.sql"), "");
    await fs.writeFile(path.join(tempDir, "invalid.sql"), "");
    await fs.writeFile(path.join(tempDir, "1_init.sql"), "");
    const files = await getMigrationFiles(tempDir);
    expect(files).toEqual(["0001_init.sql"]);
  });

  test("returns files sorted", async () => {
    await fs.writeFile(path.join(tempDir, "0003_third.sql"), "");
    await fs.writeFile(path.join(tempDir, "0001_first.sql"), "");
    await fs.writeFile(path.join(tempDir, "0002_second.sql"), "");
    const files = await getMigrationFiles(tempDir);
    expect(files).toEqual([
      "0001_first.sql",
      "0002_second.sql",
      "0003_third.sql",
    ]);
  });

  test("returns empty array for empty directory", async () => {
    const files = await getMigrationFiles(tempDir);
    expect(files).toEqual([]);
  });

  test("returns empty array for nonexistent directory", async () => {
    const files = await getMigrationFiles(path.join(tempDir, "nonexistent"));
    expect(files).toEqual([]);
  });
});

describe("ensureMigrationsDir", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "d1-prisma-ensure-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test("creates directory if it does not exist", async () => {
    const newDir = path.join(tempDir, "migrations");
    await ensureMigrationsDir(newDir);
    const stat = await fs.stat(newDir);
    expect(stat.isDirectory()).toBe(true);
  });

  test("does not throw if directory already exists", async () => {
    const existingDir = path.join(tempDir, "migrations");
    await fs.mkdir(existingDir, { recursive: true });
    await ensureMigrationsDir(existingDir);
    const stat = await fs.stat(existingDir);
    expect(stat.isDirectory()).toBe(true);
  });

  test("creates nested directories", async () => {
    const nestedDir = path.join(tempDir, "prisma", "migrations", "deep");
    await ensureMigrationsDir(nestedDir);
    const stat = await fs.stat(nestedDir);
    expect(stat.isDirectory()).toBe(true);
  });
});

describe("getStateFilePath", () => {
  test("returns correct path with state filename", () => {
    const result = getStateFilePath("/path/to/migrations");
    expect(result).toBe(path.join("/path/to/migrations", ".d1-prisma-state.json"));
  });

  test("works with relative paths", () => {
    const result = getStateFilePath("prisma/migrations");
    expect(result).toBe(path.join("prisma/migrations", ".d1-prisma-state.json"));
  });
});

describe("getMigrationsDirFromConfig", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "d1-prisma-config-"));
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test("reads migrations path from prisma.config.ts", async () => {
    const configContent = `
export default {
  schema: "prisma/schema.prisma",
  migrations: {
    path: "custom/migrations",
  },
  datasource: {
    url: "file:./test.db",
  },
};
`;
    const configPath = path.join(tempDir, "prisma.config.ts");
    await fs.writeFile(configPath, configContent);
    const result = await getMigrationsDirFromConfig(configPath);
    expect(result).toBe("custom/migrations");
  });

  test("returns default path when migrations not configured", async () => {
    const configContent = `
export default {
  schema: "prisma/schema.prisma",
  datasource: {
    url: "file:./test.db",
  },
};
`;
    const configPath = path.join(tempDir, "prisma.config.ts");
    await fs.writeFile(configPath, configContent);
    const result = await getMigrationsDirFromConfig(configPath);
    expect(result).toBe("prisma/migrations");
  });

  test("throws error when config file does not exist", async () => {
    const configPath = path.join(tempDir, "nonexistent.config.ts");
    await expect(getMigrationsDirFromConfig(configPath)).rejects.toThrow(
      "Failed to read prisma.config.ts"
    );
  });

  test("returns default path on invalid config file", async () => {
    const configPath = path.join(tempDir, "prisma.config.ts");
    await fs.writeFile(configPath, "this is not valid typescript!!!");
    const result = await getMigrationsDirFromConfig(configPath);
    expect(result).toBe("prisma/migrations");
  });
});
