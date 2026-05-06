import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  findD1PrismaConfig,
  loadD1PrismaConfig,
  getD1PrismaConfig,
  resolveConfigValue,
} from "../../src/utils/config.js";

describe("D1Prisma Configuration", () => {
  let tempDir: string;
  const originalCwd = process.cwd();

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "d1-prisma-test-"));
    process.chdir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test("findD1PrismaConfig finds d1-prisma.config.json", async () => {
    await fs.writeFile(path.join(tempDir, "d1-prisma.config.json"), "{}");
    const result = await findD1PrismaConfig();
    expect(result).toBe("d1-prisma.config.json");
  });

  test("loadD1PrismaConfig loads json config", async () => {
    const config = {
      wranglerConfig: "custom-wrangler.toml",
      database: "my-db",
    };
    await fs.writeFile(
      path.join(tempDir, "d1-prisma.config.json"),
      JSON.stringify(config)
    );

    const loaded = await loadD1PrismaConfig();
    expect(loaded).toEqual(config);
  });

  test("getD1PrismaConfig caches the config", async () => {
    const config = { database: "cached-db" };
    await fs.writeFile(
      path.join(tempDir, "d1-prisma.config.json"),
      JSON.stringify(config)
    );

    const firstLoad = await getD1PrismaConfig();
    expect(firstLoad.database).toBe("cached-db");

    // Change file on disk
    await fs.writeFile(
      path.join(tempDir, "d1-prisma.config.json"),
      JSON.stringify({ database: "new-db" })
    );

    const secondLoad = await getD1PrismaConfig();
    expect(secondLoad.database).toBe("cached-db"); // Should be cached
  });

  test("resolveConfigValue prioritizes CLI over Config", () => {
    const cliValue = "cli-db";
    const configValue = "config-db";
    const defaultValue = "default-db";

    const result = resolveConfigValue(
      cliValue,
      "DB_ENV",
      configValue,
      defaultValue
    );
    expect(result).toBe("cli-db");
  });

  test("resolveConfigValue prioritizes Env over Config", () => {
    process.env.DB_ENV = "env-db";
    const configValue = "config-db";
    const defaultValue = "default-db";

    const result = resolveConfigValue(
      undefined,
      "DB_ENV",
      configValue,
      defaultValue
    );
    expect(result).toBe("env-db");

    delete process.env.DB_ENV;
  });

  test("resolveConfigValue uses Config value when CLI and Env are missing", () => {
    const configValue = "config-db";
    const defaultValue = "default-db";

    const result = resolveConfigValue(
      undefined,
      "DB_ENV",
      configValue,
      defaultValue
    );
    expect(result).toBe("config-db");
  });

  test("resolveConfigValue uses default value as last resort", () => {
    const result = resolveConfigValue(
      undefined,
      "DB_ENV",
      undefined,
      "default-db"
    );
    expect(result).toBe("default-db");
  });
});
