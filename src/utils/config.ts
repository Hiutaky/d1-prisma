import fs from "node:fs/promises";
import { parse as parseJsonc } from "jsonc-parse";
import * as toml from "smol-toml";

export async function getD1Databases() {
  let config: any;
  try {
    if (await fileExists("wrangler.jsonc")) {
      const content = await fs.readFile("wrangler.jsonc", "utf-8");
      config = parseJsonc(content);
    } else if (await fileExists("wrangler.toml")) {
      const content = await fs.readFile("wrangler.toml", "utf-8");
      config = toml.parse(content);
    } else {
      throw new Error("No wrangler.jsonc or wrangler.toml found.");
    }

    return config.d1_databases?.map((db: any) => ({
      value: db.database_name,
      label: db.database_name,
    })) || [];
  } catch (e) {
    return [];
  }
}

async function fileExists(path: string) {
  return fs.access(path).then(() => true).catch(() => false);
}
