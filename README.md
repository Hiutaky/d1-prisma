# d1-prisma

A Bridge CLI to manage Cloudflare D1 migrations with Prisma

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

This project was created using `bun init` in bun v1.3.3. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

## Features

- **Seamless Integration**: Bridges Cloudflare D1 and Prisma migrations for a smooth development workflow
- **Migration Creation**: Generates SQL migration files based on Prisma schema changes
- **Migration Application**: Applies migrations to local or remote D1 databases
- **Prisma Client Generation**: Automatically regenerates Prisma client after migrations
- **Cross-Platform**: Works on Windows, macOS, and Linux
- **Multiple Package Managers**: Compatible with npm, yarn, pnpm, and bun

## Usage

### Database Configuration

First, ensure you have a `wrangler.toml` or `wrangler.jsonc` file in your project root with your D1 database configuration:

```toml
# wrangler.toml
[[d1_databases]]
binding = "DB"
database_name = "my-database"
database_id = "your-database-id"
```

### Creating Migrations

To create a new migration:

```bash
d1-prisma create --name "add-users-table"
```

Options:
- `--name`, `-n`: Migration name
- `--schema`: Path to Prisma schema (default: "./prisma/schema.prisma")
- `--database`, `-d`: Specific database to use

The CLI will:
1. Back up your current Prisma schema
2. Create a new migration file using Wrangler
3. Pull the current database schema into Prisma
4. Generate a diff between the current and desired schema
5. Append the diff to the migration file
6. Restore your original schema

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

## Prerequisites

- Node.js (v16 or higher)
- Wrangler CLI installed (`npm install -g wrangler`)
- Prisma CLI installed (`npm install -g prisma`)
- A configured Cloudflare D1 database

## Configuration

The tool automatically detects your configuration files:

- `wrangler.jsonc`
- `wrangler.toml`

If multiple D1 databases are configured, you'll be prompted to select one.

## Development

### Scripts

- `build`: Build the project to `dist/` directory
- `dev`: Watch mode for development
- `start`: Run the built CLI

### Architecture

The project consists of:

- `src/index.ts`: Main CLI entry point
- `src/utils/config.ts`: Configuration file parsing
- `src/utils/shell.ts`: Shell command utilities

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

### v0.1.0

- Initial release
- Basic migration creation and application
- Support for local and remote databases
