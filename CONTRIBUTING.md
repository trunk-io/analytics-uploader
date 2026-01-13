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

The analytics-uploader is a **wrapper around the `trunk-io/analytics-cli`** tool. It provides a GitHub Actions interface for uploading test results to Trunk Analytics.

### Key Components

1. **CLI Download and Caching**
   - The action downloads the `trunk-analytics-cli` binary from GitHub releases (`trunk-io/analytics-cli`)
   - The binary is downloaded based on the platform and architecture (Linux x64/ARM64, macOS x64/ARM64, Windows x64)
   - When `use-cache` is enabled, the binary is cached using GitHub Actions cache to reduce download times
   - The CLI version can be specified via the `cli-version` input (defaults to `latest`)

2. **Flag Parsing and Forwarding**
   - GitHub Actions inputs are parsed from `action.yaml` and `core.getInput()`
   - Flags are converted from GitHub Actions input format to CLI flag format
   - Boolean inputs are converted to flags like `--flag=true` or `--flag=false`
   - All flags are passed to the underlying `trunk-analytics-cli` binary via command-line arguments
   - The command is constructed in `src/lib.ts` in the `main()` function

3. **Telemetry Integration**
   - The action integrates with internal telemetry services to report failures
   - Failure reasons are captured and reported when the CLI execution fails
   - Telemetry failures are non-blocking and won't affect the action's execution

### Flag Flow

Here's how flags flow through the system:

1. **GitHub Actions Input** → Defined in `action.yaml` (e.g., `junit-paths`, `org-slug`, `verbose`)
2. **Input Parsing** → `getInputs()` function in `src/lib.ts` reads inputs via `core.getInput()`
3. **Flag Conversion** → Boolean inputs are converted using `parseBoolIntoFlag()`, other inputs are formatted as CLI arguments
4. **Command Construction** → Flags are assembled into a command string in the `main()` function
5. **CLI Execution** → The command is executed via `execSync()`, passing all flags to the downloaded `trunk-analytics-cli` binary

Example: The GitHub Actions input `verbose: true` becomes the CLI flag `-v` in the command.

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

Tests use mocks for GitHub Actions modules (`@actions/core`, `@actions/github`) and `global.fetch` to avoid making real API calls during testing. The test fixtures are located in `__fixtures__/`.

## Running Locally

Utilizing [`@github/local-action`](https://github.com/github/local-action), this action can be run locally. To do so copy and update `.env.example` to `.env` and then run `pnpm run local-action`. At a minimum, `INPUT_ORG-SLUG` and `INPUT_TOKEN` need to be updated with your own values to complete an upload.

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
3. Create a new tag (e.g., `v2.0.0`) and generate release notes
4. Publish the release

### Updating Major Version Tags

After creating a new release and verifying it works correctly, update the major version tag (e.g., `v2`) to point to the latest release using the **Update release version** workflow:

1. Go to the **Actions** tab on GitHub
2. Select the **Update release version** workflow
3. Click **Run workflow**
4. Provide the following inputs:
   - **target**: The tag of the release you just created (e.g., `v1.2.3`)
   - **major_version**: The major version tag to update (`v1` or `v2`)
5. Run the workflow

This will move the major version tag (e.g., `v2`) to point to the specified release tag, allowing users to reference the action with a major version that automatically points to the latest release in that version line.

## Project Structure

- `src/` - TypeScript source code
  - `index.ts` - Entry point
  - `lib.ts` - Main logic, CLI download, flag parsing, telemetry
- `dist/` - Built JavaScript (generated, do not edit directly)
- `__tests__/` - Test files
- `__fixtures__/` - Test mocks and fixtures
- `action.yaml` - GitHub Actions action definition

## Questions?

If you have questions or need help, please:

- Check the [README.md](README.md) for usage information
- Open an issue on GitHub
- Contact the maintainers
