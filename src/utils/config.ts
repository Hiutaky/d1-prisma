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
