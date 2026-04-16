# d1-prisma

A Bridge CLI to manage Cloudflare D1 migrations with Prisma 7

## Installation

```bash
npm install -g d1-prisma
# or
yarn global add d1-prisma
# or
pnpm add -g d1-prisma
# or
bun add -g d1-prisma
```

## Building from Source

To install dependencies:

```bash
bun install
```

To build:

```bash
bun run build
```

To run from source:

```bash
bun run src/index.ts
```

## Features

- **Prisma 7 Compatible**: Works with Prisma 7's `prisma.config.ts` configuration
- **Seamless Integration**: Bridges Cloudflare D1 and Prisma migrations for a smooth development workflow
- **Migration Creation**: Generates SQL migration files based on Prisma schema changes using `prisma migrate diff`
- **Migration Application**: Applies migrations to local or remote D1 databases
- **Migration Status**: View applied and pending migrations
- **Baseline Support**: Create baseline migrations for existing databases
- **Dry Run**: Preview SQL diffs without writing files
- **CI/CD Mode**: Non-interactive mode for automated pipelines
- **Cross-Platform**: Works on Windows, macOS, and Linux
- **Multiple Package Managers**: Compatible with npm, yarn, pnpm, and bun

## Prerequisites

- Node.js (v20 or higher)
- Wrangler CLI (v3.39.0 or higher)
- Prisma CLI (v7 or higher)
- A configured Cloudflare D1 database

## Setup

### 1. Configure Wrangler

Ensure you have a `wrangler.jsonc` or `wrangler.toml` file with your D1 database configuration:

```jsonc
// wrangler.jsonc
{
  "name": "my-worker",
  "main": "src/index.ts",
  "compatibility_date": "2025-08-05",
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "my-database",
      "database_id": "<unique-ID-for-your-database>"
    }
  ]
}
```

### 2. Configure Prisma

Create a `prisma.config.ts` file in your project root:

```typescript
// prisma.config.ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"), // "file:./prisma/db.sqlite"
  },
});
```

And set up your Prisma schema:

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
  runtime  = "cloudflare"
}

datasource db {
  provider = "sqlite"
}

model User {
  id    Int     @id @default(autoincrement())
  email String  @unique
  name  String?
}
```

### 3. Set up environment variables

```
# .env
DATABASE_URL="file:./prisma/db.sqlite"
```

## Usage

### Creating Migrations

To create a new migration:

```bash
d1-prisma create --name "add-users-table"
```

The CLI will:
1. Validate your Prisma schema
2. Read the migrations directory from `prisma.config.ts`
3. Determine if this is an initial migration or a schema change
4. Generate the SQL diff using `prisma migrate diff`
5. Write the migration file

For subsequent migrations, the tool uses `--from-local-d1` to compare against your local D1 database state. If you have pending migrations not yet applied locally, you'll be warned to apply them first.

### Applying Migrations

To apply migrations locally:

```bash
d1-prisma apply
```

To apply migrations to remote database:

```bash
d1-prisma apply --remote
```

After applying, the CLI automatically regenerates your Prisma client.

### Checking Migration Status

```bash
d1-prisma status
```

Shows applied and pending migrations.

### Baseline Migration (Existing Databases)

For existing D1 databases, create a baseline migration:

```bash
d1-prisma create --name "baseline" --baseline
```

This creates a migration representing the current database state and marks it as applied.

### Dry Run

Preview the SQL diff without writing:

```bash
d1-prisma create --name "add-users-table" --dry-run
```

## Options

### Global Options

| Option | Description |
|--------|-------------|
| `-d, --database <name>` | D1 database name (required in non-interactive mode) |
| `--wrangler-config <path>` | Custom wrangler config path |
| `--non-interactive` | Skip prompts (CI/CD mode) |

### Create Command

| Option | Description |
|--------|-------------|
| `--name, -n <name>` | Migration name (required in non-interactive mode) |
| `--schema <path>` | Custom Prisma schema path (default: `./prisma/schema.prisma`) |
| `--migrations-dir <path>` | Custom migrations directory (overrides `prisma.config.ts`) |
| `--baseline` | Mark migration as applied in local state |
| `--dry-run` | Preview SQL without writing |
| `--verbose` | Show detailed output |

### Apply Command

| Option | Description |
|--------|-------------|
| `--local` | Apply to local D1 (default) |
| `--remote` | Apply to remote D1 |

## Configuration

The tool automatically detects your configuration files:

- `wrangler.jsonc`, `wrangler.json`, or `wrangler.toml` for D1 database configuration
- `prisma.config.ts` for migrations directory path

If multiple D1 databases are configured, you'll be prompted to select one.

## CI/CD Usage

For automated pipelines, use the `--non-interactive` flag:

```bash
d1-prisma create --name "add-users" --database my-database --non-interactive
d1-prisma apply --database my-database --non-interactive
d1-prisma apply --database my-database --remote --non-interactive
d1-prisma status --database my-database --non-interactive
```

## Development

### Scripts

- `build`: Build the project to `dist/` directory
- `dev`: Watch mode for development
- `start`: Run the built CLI

### Architecture

The project consists of:

- `src/index.ts`: Main CLI entry point
- `src/utils/config.ts`: Wrangler configuration file parsing
- `src/utils/shell.ts`: Shell command utilities
- `src/utils/migrations.ts`: Migration file management utilities

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is open source and available under the [MIT License](LICENSE).

## Acknowledgments

- [Cloudflare D1](https://developers.cloudflare.com/d1/) - Serverless database
- [Prisma](https://prisma.io) - Database toolkit
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) - Cloudflare CLI tool
- Inspired by [Alex Anderson Migrator CLI](https://gist.github.com/alexanderson1993/0852a8162ebac591b62a79883a81e1a8)

## Support

If you encounter any issues or have questions, please open an issue on GitHub.

## Changelog

### v1.0.0

- Prisma 7 compatibility
- `prisma.config.ts` support
- Migration status command
- Baseline migration support
- Dry run mode
- Non-interactive/CI mode
- Improved error handling
- Local D1 sync detection

### v0.1.0

- Initial release
- Basic migration creation and application
- Support for local and remote databases
