import fs from "node:fs/promises";
import path from "node:path";

export async function getLocalD1Databases(): Promise<string[]> {
  try {
    const { listLocalDatabases } = await import("@prisma/adapter-d1");
    return listLocalDatabases();
  } catch {
    return scanD1StateDir();
  }
}

async function scanD1StateDir(): Promise<string[]> {
  const d1StateDir = path.join(process.cwd(), ".wrangler", "state", "v3", "d1");
  try {
    const entries = await fs.readdir(d1StateDir);
    const paths: string[] = [];

    for (const entry of entries) {
      const dbPath = path.join(d1StateDir, entry, "db.sqlite");
      try {
        await fs.access(dbPath);
        paths.push(dbPath);
      } catch {
        continue;
      }
    }

    return paths;
  } catch {
    return [];
  }
}

export async function findLocalD1DatabaseByName(
  databaseName: string
): Promise<string | null> {
  const databases = await getLocalD1Databases();

  const match = databases.find(
    (dbPath) =>
      dbPath.includes(databaseName) || dbPath.includes(`/${databaseName}/`)
  );

  return match ?? null;
}
