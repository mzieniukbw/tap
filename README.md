# Testing Assistant Project (TAP)

A Bun-based CLI tool that automatically generates and executes ephemeral testing scenarios from GitHub PRs and Jira tickets. TAP leverages Claude Code for orchestration and Claude Desktop for test execution with screen automation.

## Quick Setup

```bash
cd tap
bun install
bun run start setup
```

## Usage

```bash
# Test a specific PR
bun run start test-pr https://github.com/company/repo/pull/123

# Test current branch PR (auto-detect)
bun run start test-current-pr

# Test with specific focus areas
bun run start test-pr <url> --focus="authentication,payment-flow"

# Generate scenarios without execution
bun run start test-pr <url> --skip-execution

# Enable detailed logging
bun run start test-pr <url> --verbose

# Custom output directory
bun run start test-pr <url> --output ./custom-output

# Or use compiled executable
bun run build
./dist/tap test-pr <url>
```

## Available Commands

### Primary Tasks
```bash
bun run start <command>       # Run TAP commands
bun run dev                   # Development with file watching
bun run start setup           # Setup and configuration (interactive)
```

### Build Commands
```bash
bun run build                 # Build main TAP executable
bun run build:mcp             # Build MCP server executable
bun run build:all             # Build both executables
bun run clean                 # Clean build artifacts
```

### MCP Development
```bash
bun run dev:mcp               # Run MCP server in development mode
```

## Command Options

### test-pr
- `<pr-url>` - GitHub PR URL (required)
- `--focus <areas>` - Focus testing on specific areas (comma-separated)
- `--skip-execution` - Generate scenarios but don't execute tests
- `--output <path>` - Output directory for test artifacts (default: `./tap-output`)
- `--verbose` - Enable detailed logging with timing information

### test-current-pr
- `--focus <areas>` - Focus testing on specific areas (comma-separated)
- `--skip-execution` - Generate scenarios but don't execute tests
- `--output <path>` - Output directory for test artifacts (default: `./tap-output`)
- `--verbose` - Enable detailed logging with timing information

## Configuration

TAP supports two configuration methods:

### 1. Interactive Setup (Recommended)
```bash
bun run start setup
```
Creates `~/.tap/config.json` with your API credentials.

### 2. Environment Variables (Alternative)
- `GITHUB_TOKEN` - GitHub Personal Access Token
- `ATLASSIAN_API_TOKEN` - Unified token for Jira and Confluence
- `ATLASSIAN_EMAIL` - Atlassian account email
- `ATLASSIAN_BASE_URL` - Atlassian instance URL (e.g., https://company.atlassian.net)

The system automatically tests API connectivity before running commands.

## Data Flow

1. **GitHub PR analysis** → Extract diffs, metadata, Jira ticket keys
2. **Jira context gathering** → Ticket details, epics, linked issues
3. **Confluence documentation** → Related technical documentation
4. **Test generation** → Context-aware scenarios
5. **Claude Desktop execution** → Automated testing with screen capture
6. **QA report generation** → Structured output with artifacts

## Output Structure

Test artifacts are generated in `tap-output/` (or custom `--output` directory):
- Screenshots: `*.png`
- Videos: `*.mp4` 
- QA reports: Structured console output with recommendations

## Verbose Logging

Use the `--verbose` flag to enable detailed logging that includes:
- Step-by-step execution timing
- Detailed PR analysis (files, commits, labels, descriptions)
- Complete Jira ticket context (status, priority, linked issues, epics)
- Confluence page details (titles, spaces, authors, dates)
- Test scenario generation details (priorities, categories, steps)
- Test execution and QA report metrics
- Enhanced error context with stack traces

## Development Notes

- This is a Bun project with Node.js compatibility
- All external dependencies are managed via package.json and npm registry
- MCP server uses @modelcontextprotocol/sdk for Model Context Protocol integration
- No permanent test cases - all scenarios are dynamically generated
- Unified Atlassian authentication uses single API token for both Jira and Confluence

## Architecture

### Core Structure
- `src/main.ts` - CLI entry point using Commander.js framework
- `src/commands/` - Command implementations (test-pr, test-current-pr, setup)
- `src/services/` - Business logic services
- `mcp-servers/atlassian-mcp/server.ts` - Unified Atlassian MCP server

### Key Services
- `GitHubService` - PR analysis and diff processing
- `AtlassianService` - Jira ticket and Confluence page integration
- `TestScenarioGenerator` - Dynamic test scenario creation
- `ClaudeDesktopOrchestrator` - Test execution coordination
- `QAReportGenerator` - Comprehensive test reporting