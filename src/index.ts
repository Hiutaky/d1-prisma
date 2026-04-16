#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import {
  intro,
  outro,
  log,
  select,
  text,
  spinner,
  isCancel,
  confirm,
} from "@clack/prompts";
import parseArgv from "tiny-parse-argv";
import { asyncExecSimple } from "./utils/shell.js";
import { getD1Databases, getPrismaConfigPath } from "./utils/config.js";
import { findLocalD1DatabaseByName } from "./utils/d1.js";
import {
  getNextVersion,
  getAppliedMigrations,
  markMigrationApplied,
  isInitialMigration,
  getMigrationsDirFromConfig,
  getPendingMigrations,
  getMigrationFiles,
  ensureMigrationsDir,
  getStateFilePath,
} from "./utils/migrations.js";

const args = parseArgv(process.argv.slice(2));
const command = args._[0];

async function main() {
  intro("D1 Prisma Migrate CLI");

  const wranglerConfig =
    args["wrangler-config"] || args.wranglerConfig || undefined;
  const databases = await getD1Databases(wranglerConfig);
  if (databases.length === 0) {
    log.error("No D1 databases configured in wrangler.");
    process.exit(1);
  }

  const nonInteractive =
    args["non-interactive"] || args.nonInteractive || false;
  const selectedDb =
    args.d ||
    args.database ||
    (nonInteractive
      ? (log.error("--database flag required in non-interactive mode"),
        process.exit(1))
      : await select({
          message: "Select the D1 database:",
          options: databases,
        }));

  if (isCancel(selectedDb)) process.exit(0);

  if (command === "create") {
    await handleCreate(selectedDb as string, nonInteractive as boolean);
  } else if (command === "apply") {
    await handleApply(selectedDb as string, nonInteractive as boolean);
  } else if (command === "status") {
    await handleStatus(selectedDb as string, nonInteractive as boolean);
  } else {
    log.info("Usage: d1-prisma [create|apply|status] [options]");
    log.info("Commands:");
    log.info("  create   Create a new migration");
    log.info("  apply    Apply pending migrations");
    log.info("  status   Show migration status");
    log.info("");
    log.info("Options:");
    log.info("  -d, --database <name>     D1 database name");
    log.info("  --wrangler-config <path>  Custom wrangler config path");
    log.info("  --schema <path>           Custom Prisma schema path");
    log.info("  --migrations-dir <path>   Custom migrations directory");
    log.info("  --name, -n <name>         Migration name (create)");
    log.info("  --baseline                Mark as applied (create)");
    log.info("  --dry-run                 Preview SQL without writing");
    log.info("  --local                   Apply to local D1");
    log.info("  --remote                  Apply to remote D1");
    log.info("  --non-interactive         Skip prompts (CI/CD)");
    process.exit(0);
  }
}

async function handleCreate(db: string, nonInteractive: boolean) {
  const schemaPath = args.schema || "./prisma/schema.prisma";
  const migrationsDirOverride =
    args["migrations-dir"] || args.migrationsDir;
  const baseline = args.baseline || false;
  const dryRun = args["dry-run"] || args.dryRun || false;
  const verbose = args.verbose || false;

  const s = spinner();

  try {
    s.start("Validating Prisma schema...");
    try {
      await asyncExecSimple(`prisma validate --schema ${schemaPath}`);
    } catch (e) {
      s.stop("Schema validation failed.");
      log.error(
        e instanceof Error ? e.message : "Unknown validation error"
      );
      process.exit(1);
    }

    s.message("Reading Prisma config...");
    const prismaConfigPath = await getPrismaConfigPath();
    if (!prismaConfigPath) {
      s.stop("prisma.config.ts not found.");
      log.error(
        "Create a prisma.config.ts file in your project root. See docs for examples."
      );
      process.exit(1);
    }

    const migrationsDir = migrationsDirOverride
      ? (migrationsDirOverride as string)
      : await getMigrationsDirFromConfig(prismaConfigPath);

    await ensureMigrationsDir(migrationsDir);

    const initial = await isInitialMigration(migrationsDir);
    const pendingMigrations = await getPendingMigrations(
      migrationsDir,
      getStateFilePath(migrationsDir)
    );

    if (!initial && pendingMigrations.length > 0 && !baseline) {
      s.stop("Pending migrations detected.");
      log.warn(
        `You have ${pendingMigrations.length} pending migration(s) that should be applied first.`
      );
      log.info(
        `Run: d1-prisma apply --database ${db} --local`
      );

      if (!nonInteractive) {
        const proceed = await confirm({
          message: "Continue anyway?",
          initialValue: false,
        });
        if (isCancel(proceed) || !proceed) {
          process.exit(0);
        }
      } else {
        log.error("Aborting in non-interactive mode.");
        process.exit(1);
      }
    }

    const name =
      args.name ||
      args.n ||
      (nonInteractive
        ? (log.error("--name flag required in non-interactive mode"),
          process.exit(1))
        : await text({ message: "Migration name?" }));

    if (isCancel(name)) return;

    const version = await getNextVersion(migrationsDir);
    const migrationFile = path.join(
      migrationsDir,
      `${version}_${name}.sql`
    );

    s.message("Generating SQL diff...");

    let diffCommand: string;
    let diffEnv: Record<string, string> | undefined;

    if (initial || baseline) {
      diffCommand = `prisma migrate diff --from-empty --to-schema ${schemaPath} --script`;
    } else {
      const localDbPath = await findLocalD1DatabaseByName(db);
      if (!localDbPath) {
        s.stop("No local D1 database found.");
        log.error(
          `Could not find local D1 database for "${db}". ` +
            `Run \`wrangler d1 migrations apply ${db} --local\` first to create the local database.`
        );
        process.exit(1);
      }

      diffCommand = `prisma migrate diff --from-config-datasource --to-schema ${schemaPath} --script`;
      diffEnv = { DATABASE_URL: `file:${localDbPath}` };

      if (verbose) {
        log.info(`Local D1 database: ${localDbPath}`);
      }
    }

    if (verbose) {
      log.info(`Running: ${diffCommand}`);
    }

    let diffOutput: string;
    try {
      diffOutput = await asyncExecSimple(diffCommand, { env: diffEnv });
    } catch (e) {
      s.stop("Failed to generate diff.");
      log.error(
        e instanceof Error ? e.message : "Unknown error generating diff"
      );
      process.exit(1);
    }

    if (dryRun) {
      s.stop("Dry run - SQL diff:");
      console.log(diffOutput);
      outro("Done.");
      return;
    }

    await fs.writeFile(migrationFile, diffOutput);

    if (baseline) {
      await markMigrationApplied(
        getStateFilePath(migrationsDir),
        version,
        name as string
      );
      s.stop(`Baseline migration created: ${path.basename(migrationFile)}`);
      log.info("Marked as applied in local state (--baseline).");
    } else {
      s.stop(`Migration created: ${path.basename(migrationFile)}`);
    }

    if (verbose) {
      log.info(`Migrations directory: ${migrationsDir}`);
      log.info(`Version: ${version}`);
      log.info(`Initial: ${initial}`);
      log.info(`Baseline: ${baseline}`);
    }

    outro("Done.");
  } catch (e) {
    s.stop("Failed.");
    log.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

async function handleApply(db: string, nonInteractive: boolean) {
  const local = args.local !== false;
  const remote = args.remote || false;
  const location = remote ? "--remote" : "--local";

  const s = spinner();

  try {
    s.start(`Applying migrations ${location}...`);
    try {
      await asyncExecSimple(
        `wrangler d1 migrations apply ${db} ${location}`
      );
    } catch (e) {
      s.stop("Failed to apply migrations.");
      log.error(
        e instanceof Error ? e.message : "Unknown error applying migrations"
      );
      process.exit(1);
    }

    s.message("Updating local migration state...");
    const prismaConfigPath = await getPrismaConfigPath();
    if (prismaConfigPath) {
      const migrationsDir = await getMigrationsDirFromConfig(
        prismaConfigPath
      );
      const stateFile = getStateFilePath(migrationsDir);
      const migrationFiles = await getMigrationFiles(migrationsDir);

      for (const file of migrationFiles) {
        const match = file.match(/^(\d{4})_(.+)\.sql$/);
        if (match) {
          const [, version, name] = match;
          await markMigrationApplied(stateFile, version!, name!);
        }
      }
    }

    s.message("Regenerating Prisma Client...");
    try {
      await asyncExecSimple("prisma generate");
    } catch {
      log.warn("prisma generate failed (non-critical).");
    }

    s.stop("Database updated successfully!");
    outro("Done.");
  } catch (e) {
    s.stop("Failed.");
    log.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

async function handleStatus(db: string, nonInteractive: boolean) {
  const s = spinner();

  try {
    s.start("Reading migration status...");

    const prismaConfigPath = await getPrismaConfigPath();
    if (!prismaConfigPath) {
      s.stop("prisma.config.ts not found.");
      log.error("Create a prisma.config.ts file in your project root.");
      process.exit(1);
    }

    const migrationsDir = await getMigrationsDirFromConfig(
      prismaConfigPath
    );
    const stateFile = getStateFilePath(migrationsDir);

    const allMigrations = await getMigrationFiles(migrationsDir);
    const appliedState = await getAppliedMigrations(stateFile);
    const pending = await getPendingMigrations(migrationsDir, stateFile);
    const applied = allMigrations.filter(
      (f) => !pending.includes(f)
    );

    s.stop("Migration status:");

    if (nonInteractive) {
      console.log(
        JSON.stringify(
          {
            database: db,
            migrationsDir,
            total: allMigrations.length,
            applied: applied,
            pending: pending,
          },
          null,
          2
        )
      );
    } else {
      log.info(`Database: ${db}`);
      log.info(`Migrations directory: ${migrationsDir}`);
      log.info(`Total migrations: ${allMigrations.length}`);
      log.info("");

      if (applied.length > 0) {
        log.success(`Applied (${applied.length}):`);
        for (const m of applied) {
          log.info(`  ✓ ${m}`);
        }
      } else {
        log.info("No applied migrations.");
      }

      log.info("");

      if (pending.length > 0) {
        log.warn(`Pending (${pending.length}):`);
        for (const m of pending) {
          log.info(`  ○ ${m}`);
        }
      } else {
        log.success("No pending migrations.");
      }
    }

    outro("Done.");
  } catch (e) {
    s.stop("Failed.");
    log.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

main().catch(console.error);
