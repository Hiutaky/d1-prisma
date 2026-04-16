import fs from "node:fs/promises";
import path from "node:path";

export interface MigrationState {
  applied: string[];
  lastSync?: string;
}

export async function getNextVersion(migrationsDir: string): Promise<string> {
  const files = await listMigrationFiles(migrationsDir);
  const nextNum = files.length + 1;
  return String(nextNum).padStart(4, "0");
}

export async function getAppliedMigrations(stateFile: string): Promise<MigrationState> {
  try {
    const content = await fs.readFile(stateFile, "utf-8");
    return JSON.parse(content) as MigrationState;
  } catch {
    return { applied: [] };
  }
}

export async function markMigrationApplied(
  stateFile: string,
  version: string,
  name: string
): Promise<void> {
  const state = await getAppliedMigrations(stateFile);
  const migrationKey = `${version}_${name}`;
  if (!state.applied.includes(migrationKey)) {
    state.applied.push(migrationKey);
  }
  state.lastSync = new Date().toISOString();
  await fs.writeFile(stateFile, JSON.stringify(state, null, 2));
}

export async function isInitialMigration(migrationsDir: string): Promise<boolean> {
  const files = await listMigrationFiles(migrationsDir);
  return files.length === 0;
}

export async function getMigrationsDirFromConfig(
  prismaConfigPath: string
): Promise<string> {
  const defaultPath = "prisma/migrations"
  try {
    const content = await fs.readFile(prismaConfigPath, "utf-8");
    const match = content.match(/path:\s*["']([^"']+)["']/);
    if (match) 
      return match[1] ?? defaultPath;
  } catch (e) {
    throw new Error(
      `Failed to read prisma.config.ts: ${e instanceof Error ? e.message : String(e)}`
    );
  }
  return defaultPath;
}

export async function getPendingMigrations(
  migrationsDir: string,
  stateFile: string
): Promise<string[]> {
  const files = await listMigrationFiles(migrationsDir);
  const state = await getAppliedMigrations(stateFile);
  return files.filter((f) => !state.applied.includes(f.replace(".sql", "")));
}

export async function getMigrationFiles(migrationsDir: string): Promise<string[]> {
  return listMigrationFiles(migrationsDir);
}

async function listMigrationFiles(migrationsDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(migrationsDir);
    return entries
      .filter((f) => f.endsWith(".sql") && /^\d{4}_/.test(f))
      .sort();
  } catch {
    return [];
  }
}

export async function ensureMigrationsDir(migrationsDir: string): Promise<void> {
  try {
    await fs.mkdir(migrationsDir, { recursive: true });
  } catch {
    // Directory already exists
  }
}

export function getStateFilePath(migrationsDir: string): string {
  return path.join(migrationsDir, ".d1-prisma-state.json");
}
