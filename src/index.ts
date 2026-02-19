#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { intro, outro, log, select, text, spinner, isCancel } from "@clack/prompts";
import parseArgv from "tiny-parse-argv";
import { asyncExec } from "./utils/shell.js";
import { getD1Databases } from "./utils/config.js";

const args = parseArgv(process.argv.slice(2));
const command = args._[0];

async function main() {
  intro("D1 Prisma Migrate CLI");

  const databases = await getD1Databases();
  if (databases.length === 0) {
    log.error("No D1 databases configured in wrangler.");
    process.exit(1);
  }

  const selectedDb = args.d || args.database ||
    (await select({
      message: "Select the D1 database:",
      options: databases,
    }));

  if (isCancel(selectedDb)) process.exit(0);

  if (command === "create") {
    await handleCreate(selectedDb as string);
  } else if (command === "apply") {
    await handleApply(selectedDb as string);
  } else {
    log.info("Usage: d1-prisma [create|apply] [--remote]");
    process.exit(0);
  }
}

async function handleCreate(db: string) {
  const name = args.name || args.n || (await text({ message: "Migration name?" }));
  if (isCancel(name)) return;

  const schemaPath = args.schema || "./prisma/schema.prisma";

  const tempSchema = `${schemaPath}.backup.${Date.now()}`;
  const s = spinner();

  try {
    // 1. Backup the desired state
    await fs.copyFile(schemaPath, tempSchema);

    s.start("Creating migration file...");
    const result = await asyncExec(`wrangler d1 migrations create ${db} ${name}`);
    const migrationFile = result.trim().split("\n").find((l) => l.endsWith(".sql"));
    const _migrationPath = migrationFile?.split('/')
    const migrationPath = _migrationPath?.slice(0, _migrationPath.length - 2).join('/');

    if (!migrationFile) throw new Error("Migration path not found");

    // 2. Synchronize schema with current DB
    s.message("Synchronizing Prisma schema with DB...");
    // await asyncExec(`prisma db pull --schema ${schemaPath}`);

    // 3. Generate diff between current DB and desired state (backup)
    s.message("Generating SQL diff...");
    await asyncExec(
      `prisma migrate diff --from-config-datasource --to-schema ${tempSchema} --script >> ${migrationFile}`
    );

    s.stop(`Migration created: ${path.basename(migrationFile)}`);
  } catch (e) {
    log.error(`Error: ${e}`);
  } finally {
    // 4. Restore schema
    await fs.copyFile(tempSchema, schemaPath);
    await fs.rm(tempSchema);
  }
}

async function handleApply(db: string) {
  const s = spinner();
  const location = args.remote ? "--remote" : "--local";

  try {
    s.start(`Applying migrations ${location}...`);
    await asyncExec(`wrangler d1 migrations apply ${db} ${location}`);

    s.message("Regenerating Prisma Client...");
    await asyncExec(`prisma generate`);

    s.stop("Database updated successfully!");
    outro("Done.");
  } catch (e) {
    s.stop("Failed.");
    log.error(`${e}`);
  }
}

main().catch(console.error);
