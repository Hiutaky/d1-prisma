import fs from "node:fs/promises";
import { parse as parseJsonc } from "jsonc-parse";
import * as toml from "smol-toml";

export interface D1Database {
  value: string;
  label: string;
  binding: string;
  databaseId: string;
}

export interface WranglerConfig {
  d1_databases?: Array<{
    binding: string;
    database_name: string;
    database_id: string;
  }>;
}

export interface D1PrismaConfig {
  $schema?: string;
  wranglerConfig?: string;
  database?: string;
  schema?: string;
  migrationsDir?: string;
  wranglerDataDir?: string;
}

let cachedConfig: D1PrismaConfig | null = null;

export async function findD1PrismaConfig(): Promise<string | null> {
  const candidates = ["d1-prisma.config.json"];
  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }
  return null;
}

export async function loadD1PrismaConfig(): Promise<D1PrismaConfig | null> {
  const configPath = await findD1PrismaConfig();
  if (!configPath) {
    return null;
  }

  try {
    const content = await fs.readFile(configPath, "utf-8");
    return JSON.parse(content) as D1PrismaConfig;
  } catch {
    return null;
  }
}

export async function getD1PrismaConfig(): Promise<D1PrismaConfig> {
  if (cachedConfig === null) {
    cachedConfig = (await loadD1PrismaConfig()) || {};
  }
  return cachedConfig;
}

export function resolveConfigValue<T>(
  cliValue: T | undefined,
  envKey: string,
  configValue: T | undefined,
  defaultValue: T
): T {
  if (cliValue !== undefined) {
    return cliValue;
  }
  const envValue = process.env[envKey];
  if (envValue !== undefined) {
    return envValue as T;
  }
  if (configValue !== undefined) {
    return configValue;
  }
  return defaultValue;
}

export async function getD1Databases(
  customConfigPath?: string
): Promise<D1Database[]> {
  try {
    const configPath = customConfigPath || (await findWranglerConfig());
    if (!configPath) {
      return [];
    }

    const content = await fs.readFile(configPath, "utf-8");
    const config = parseWranglerConfig(content, configPath);

    return (
      config.d1_databases?.map((db) => ({
        value: db.database_name,
        label: db.database_name,
        binding: db.binding,
        databaseId: db.database_id,
      })) || []
    );
  } catch {
    return [];
  }
}

export async function findWranglerConfig(): Promise<string | null> {
  const candidates = ["wrangler.jsonc", "wrangler.json", "wrangler.toml"];
  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }
  return null;
}

export async function getPrismaConfigPath(): Promise<string | null> {
  const candidates = ["prisma.config.ts", "prisma/prisma.config.ts"];
  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }
  return null;
}

function parseWranglerConfig(
  content: string,
  filePath: string
): WranglerConfig {
  if (filePath.endsWith(".toml")) {
    return toml.parse(content) as WranglerConfig;
  }
  return parseJsonc(content) as WranglerConfig;
}

async function fileExists(path: string): Promise<boolean> {
  return fs
    .access(path)
    .then(() => true)
    .catch(() => false);
}
