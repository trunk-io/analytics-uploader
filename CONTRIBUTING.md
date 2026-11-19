# Contributing to analytics-uploader

## Getting Started

### Prerequisites

- **Node.js** (version 22 or higher)
- **pnpm** (version 10.23.0 or higher) - This is the package manager we use for this project

### Installation

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd analytics-uploader
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

## Development Tools

This project uses the following tools:

- **pnpm** - Package manager for Node.js dependencies
- **TypeScript** - Type-safe JavaScript development
- **Jest** - Testing framework
- **@vercel/ncc** - Bundles TypeScript code into a single JavaScript file
- **Trunk** - Code quality and linting tool (configured in `.trunk/trunk.yaml`)
- **ESLint** - Code linting
- **Prettier** - Code formatting

## Build Process

This project must be built before it can run. The source code is written in TypeScript and located in `src/`, but the actual GitHub Action runs the bundled JavaScript file from `dist/index.js`.

### Building the Project

To build the project, run:

```bash
pnpm build
```

This command uses `@vercel/ncc` to bundle `src/index.ts` into `dist/index.js`, which is what gets executed when the GitHub Action runs (as specified in `action.yaml`).

### Pre-commit Hook

**Important**: The code is automatically built before each commit via a pre-commit git hook. This is configured in `.trunk/trunk.yaml` and runs `pnpm build && git add dist/index.js` automatically. This ensures that:

1. The built code is always up-to-date with your changes
2. Tests can run against the built code (tests import from the built `dist/` directory)
3. The committed code is ready to run in GitHub Actions

You don't need to manually build before committing, but you may want to build manually to test your changes locally.

## How It Works

### Architecture Overview

v3 of the analytics-uploader is a **wrapper around the trunk CLI** (`trunk flakytests`), which downloads and runs [`trunk-io/analytics-cli`](https://github.com/trunk-io/analytics-cli). It provides a GitHub Actions interface for uploading test results to Trunk Flaky Tests. v2 ran `trunk-analytics-cli` 0.x directly.

### Key Components

1. **Version Resolution** (`src/release.ts`)
   - `trunk-cli-version: latest` resolves from `trunk.io/releases/trunk-cli/prod/channel.json`.
   - `cli-version: latest` resolves from `trunk.io/releases/analytics-cli/prod/channel-1.json`, never `channel.json`: the trunk CLI hands a 0.x analytics-cli no credential. If `channel-1.json` is unavailable, the action fails; there is no 0.x fallback. The result is passed to the trunk CLI as `TRUNK_ANALYTICS_CLI_VERSION`.

2. **Trunk CLI Install and Caching** (`src/lib.ts`, `src/cache.ts`)
   - The action downloads `trunk-<version>-<platform>.tar.gz` (`.zip` on `windows-x64`) and checks its sha256 against the version's `manifest.json`.
   - Everything lives under `$RUNNER_TEMP/trunk-analytics-uploader`: the trunk CLI, the trunk CLI's cache (`TRUNK_CACHE`, where it keeps analytics-cli), and a credential store per step (`TRUNK_CREDENTIALS_FILE`), removed when the step ends.
   - With `use-cache`, the trunk CLI and the analytics-cli binary are cached separately, each keyed on platform and version.
   - `TRUNK_NO_AUTO_UPDATE=1` keeps the trunk CLI from updating itself.

3. **Credentials**
   - With `token`, the action runs `trunk auth api-key set` with the key in `TRUNK_ORG_API_KEY` and masks it. The trunk CLI checks the key with Trunk and stores it; `trunk flakytests` then hands analytics-cli a credential on `TRUNK_API_TOKEN`.
   - The key never goes on a command line. The action drops any inherited `TRUNK_API_TOKEN`, so `token` is the only credential.
   - On a fork pull request (`allow-forked-pr-uploads`, no `token`), the action passes `--allow-forked-pr-uploads` and the job's `GITHUB_TOKEN`.

4. **Flag Forwarding** (`src/args.ts`)
   - Inputs become an argv array for `trunk flakytests upload|test`, run with `execFileSync` and no shell. String values are passed as `--flag=value`.
   - `run` is wrapped as `-- /bin/sh -c "<run>"` (`cmd.exe /d /s /c` on Windows), the shell v2's `execSync` used, so shell syntax keeps working.

5. **Failures** (`src/lib.ts`)
   - analytics-cli exits 70 when it fails on its own; any other exit code is the test run's, passed through by the trunk CLI.
   - On a failed run, `trunk flakytests github-annotations` words the failure from the summary file; the action falls back to its own message.

The action sends no telemetry of its own.

### Flag Flow

1. **GitHub Actions Input** → Defined in `action.yaml` (e.g., `junit-paths`, `org-slug`, `verbose`)
2. **Input Parsing** → `getInputs()` in `src/inputs.ts` reads inputs via `core.getInput()`
3. **Argument Construction** → `getArgs()` in `src/args.ts` turns inputs into an argv array
4. **CLI Execution** → `main()` in `src/lib.ts` runs `trunk flakytests <args>` with `execFileSync()`

Example: The GitHub Actions input `quarantine: false` becomes the CLI flag `--disable-quarantining`.

## Testing

### Running Tests

Tests are located in the `__tests__/` directory and use Jest. To run tests:

```bash
pnpm test
```

**Note**: Tests import from the built code in `dist/`, so you need to build the project before running tests:

```bash
pnpm build
pnpm test
```

The pre-commit hook ensures the build is up-to-date, but for local development, you may need to build manually.

### Test Structure

Tests use mocks for the GitHub Actions modules (`@actions/core`, `@actions/cache`), `node:fs` and `node:child_process`, and [msw](https://mswjs.io/) for every request to trunk.io; an unhandled request fails the test. The test fixtures are located in `__fixtures__/`.

## Running Locally

Utilizing [`@github/local-action`](https://github.com/github/local-action), this action can be run locally. To do so copy and update `.env.example` to `.env` and then run `pnpm run local-action`. At a minimum, `INPUT_ORG-SLUG`, `INPUT_TEST-COLLECTION-ID` and `INPUT_TOKEN` (a v2 API key) need to be updated with your own values to complete an upload.

In `.env` inputs for the action can be specified with `INPUT_<UPPERCASE-OF-INPUT-NAME>` e.x. `INPUT_REPO-ROOT` or `INPUT_CLI-VERSION`. See `action.yaml` for the full list of inputs.

## Development Workflow

1. **Make your changes** in `src/`
2. **Build the project**: `pnpm build` (or let the pre-commit hook do it)
3. **Run tests**: `pnpm test`
4. **Check code quality**: Trunk will run automatically on pre-commit, or you can run `trunk check` manually
5. **Commit**: The pre-commit hook will automatically build and stage `dist/index.js`

## Releases

### Creating a Release

Releases are manually created via the **Releases** tab on GitHub:

1. Go to the repository's Releases page on GitHub
2. Click "Draft a new release"
3. Create a new tag (e.g., `v3.0.0`) and generate release notes
4. Publish the release

### Updating Major Version Tags

After creating a new release and verifying it works correctly, update the major version tag (e.g., `v3`) to point to the latest release using the **Update release version** workflow:

1. Go to the **Actions** tab on GitHub
2. Select the **Update release version** workflow
3. Click **Run workflow**
4. Provide the following inputs:
   - **target**: The tag of the release you just created (e.g., `v1.2.3`)
   - **major_version**: The major version tag to update (`v1`, `v2` or `v3`)
5. Run the workflow

This will move the major version tag (e.g., `v3`) to point to the specified release tag, allowing users to reference the action with a major version that automatically points to the latest release in that version line.

## Project Structure

- `src/` - TypeScript source code
  - `index.ts` - Entry point
  - `lib.ts` - Main logic: trunk CLI install, credentials, running `trunk flakytests`, failures
  - `release.ts` - Version resolution and the trunk CLI download
  - `args.ts` - Inputs to argv and environment
- `dist/` - Built JavaScript (generated, do not edit directly)
- `__tests__/` - Test files
- `__fixtures__/` - Test mocks and fixtures
- `action.yaml` - GitHub Actions action definition

## Questions?

If you have questions or need help, please:

- Check the [README.md](README.md) for usage information
- Open an issue on GitHub
- Contact the maintainers
