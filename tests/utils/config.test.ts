import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  findWranglerConfig,
  getD1Databases,
  getPrismaConfigPath,
} from "../../src/utils/config.js";

describe("findWranglerConfig", () => {
  let tempDir: string;
  const originalCwd = process.cwd();

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "d1-prisma-config-"));
    process.chdir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test("finds wrangler.jsonc", async () => {
    await fs.writeFile(
      path.join(tempDir, "wrangler.jsonc"),
      JSON.stringify({ name: "test" })
    );
    const result = await findWranglerConfig();
    expect(result).toBe("wrangler.jsonc");
  });

  test("finds wrangler.json", async () => {
    await fs.writeFile(
      path.join(tempDir, "wrangler.json"),
      JSON.stringify({ name: "test" })
    );
    const result = await findWranglerConfig();
    expect(result).toBe("wrangler.json");
  });

  test("finds wrangler.toml", async () => {
    await fs.writeFile(
      path.join(tempDir, "wrangler.toml"),
      'name = "test"'
    );
    const result = await findWranglerConfig();
    expect(result).toBe("wrangler.toml");
  });

  test("prefers wrangler.jsonc over wrangler.json", async () => {
    await fs.writeFile(
      path.join(tempDir, "wrangler.jsonc"),
      JSON.stringify({ name: "test" })
    );
    await fs.writeFile(
      path.join(tempDir, "wrangler.json"),
      JSON.stringify({ name: "test" })
    );
    const result = await findWranglerConfig();
    expect(result).toBe("wrangler.jsonc");
  });

  test("returns null when no config exists", async () => {
    const result = await findWranglerConfig();
    expect(result).toBeNull();
  });
});

describe("getD1Databases", () => {
  let tempDir: string;
  const originalCwd = process.cwd();

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "d1-prisma-d1-"));
    process.chdir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test("parses D1 databases from wrangler.jsonc", async () => {
    const configContent = `{
      "name": "test-worker",
      "d1_databases": [
        {
          "binding": "DB",
          "database_name": "test-db",
          "database_id": "test-db-id-123"
        }
      ]
    }`;
    await fs.writeFile(path.join(tempDir, "wrangler.jsonc"), configContent);
    const databases = await getD1Databases();
    expect(databases).toHaveLength(1);
    expect(databases[0]).toEqual({
      value: "test-db",
      label: "test-db",
      binding: "DB",
      databaseId: "test-db-id-123",
    });
  });

  test("parses D1 databases from wrangler.toml", async () => {
    const configContent = `name = "test-worker"

[[d1_databases]]
binding = "DB"
database_name = "test-db"
database_id = "test-db-id-123"
`;
    await fs.writeFile(path.join(tempDir, "wrangler.toml"), configContent);
    const databases = await getD1Databases();
    expect(databases).toHaveLength(1);
    expect(databases[0]).toEqual({
      value: "test-db",
      label: "test-db",
      binding: "DB",
      databaseId: "test-db-id-123",
    });
  });

  test("parses multiple D1 databases", async () => {
    const configContent = `{
      "name": "test-worker",
      "d1_databases": [
        {
          "binding": "DB",
          "database_name": "test-db",
          "database_id": "test-db-id-123"
        },
        {
          "binding": "DB2",
          "database_name": "test-db-2",
          "database_id": "test-db-id-456"
        }
      ]
    }`;
    await fs.writeFile(path.join(tempDir, "wrangler.jsonc"), configContent);
    const databases = await getD1Databases();
    expect(databases).toHaveLength(2);
    expect(databases[1].value).toBe("test-db-2");
  });

  test("returns empty array when no d1_databases configured", async () => {
    const configContent = `{
      "name": "test-worker",
      "main": "src/index.ts"
    }`;
    await fs.writeFile(path.join(tempDir, "wrangler.jsonc"), configContent);
    const databases = await getD1Databases();
    expect(databases).toHaveLength(0);
  });

  test("returns empty array when no config exists", async () => {
    const databases = await getD1Databases();
    expect(databases).toHaveLength(0);
  });

  test("uses custom config path", async () => {
    const customDir = path.join(tempDir, "custom");
    await fs.mkdir(customDir, { recursive: true });
    const configContent = `{
      "name": "test-worker",
      "d1_databases": [
        {
          "binding": "DB",
          "database_name": "custom-db",
          "database_id": "custom-db-id"
        }
      ]
    }`;
    const customPath = path.join(customDir, "custom-wrangler.jsonc");
    await fs.writeFile(customPath, configContent);
    const databases = await getD1Databases(customPath);
    expect(databases).toHaveLength(1);
    expect(databases[0].value).toBe("custom-db");
  });
});

describe("getPrismaConfigPath", () => {
  let tempDir: string;
  const originalCwd = process.cwd();

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "d1-prisma-prisma-"));
    process.chdir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test("finds prisma.config.ts in root", async () => {
    await fs.writeFile(path.join(tempDir, "prisma.config.ts"), "");
    const result = await getPrismaConfigPath();
    expect(result).toBe("prisma.config.ts");
  });

  test("finds prisma.config.ts in prisma/ subdirectory", async () => {
    const prismaDir = path.join(tempDir, "prisma");
    await fs.mkdir(prismaDir, { recursive: true });
    await fs.writeFile(path.join(prismaDir, "prisma.config.ts"), "");
    const result = await getPrismaConfigPath();
    expect(result).toBe("prisma/prisma.config.ts");
  });

  test("prefers root prisma.config.ts over prisma/", async () => {
    await fs.writeFile(path.join(tempDir, "prisma.config.ts"), "");
    const prismaDir = path.join(tempDir, "prisma");
    await fs.mkdir(prismaDir, { recursive: true });
    await fs.writeFile(path.join(prismaDir, "prisma.config.ts"), "");
    const result = await getPrismaConfigPath();
    expect(result).toBe("prisma.config.ts");
  });

  test("returns null when no config exists", async () => {
    const result = await getPrismaConfigPath();
    expect(result).toBeNull();
  });
});
