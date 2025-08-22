# Testing Assistant Project (TAP)

A Bun-based CLI tool that uses AI-powered test generation and human-in-the-loop workflow to create and execute ephemeral testing scenarios from GitHub PRs and Jira tickets. TAP combines Claude CLI for intelligent test generation, Claude Code for human refinement, and Claude Desktop for test execution with screen automation.

## Quick Setup

```bash
cd tap
bun install
bun run start setup

# Install Claude CLI for AI test generation
npm install -g @anthropic-ai/claude-cli
claude auth
```

## Usage

### Human-in-the-Loop Workflow (Recommended)
```bash
# Step 1: Generate AI scenarios and export context for review
bun run start test-pr <pr-url> --generate-only --output ./tap-context

# Step 2: Review and refine scenarios
# Option A: Use the auto-generated helper script
cd ./tap-context && ./claude-refine.sh
# Option B: Use Claude Code to manually review the exported files
# Option C: Use claude CLI directly with the exported context

# Step 3: Execute refined scenarios
bun run start execute-scenarios --file ./refined-scenarios.json
```

### Direct Execution
```bash
# Execute immediately with AI-generated scenarios (no human review)
bun run start test-pr <pr-url>

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
- `--generate-only` - Generate scenarios and export context for Claude Code review
- `--output <path>` - Output directory for test artifacts (default: `./tap-output`)
- `--verbose` - Enable detailed logging with timing information

### execute-scenarios
- `--file <path>` - Path to JSON file containing test scenarios (required)
- `--output <path>` - Output directory for test artifacts (default: `./tap-output`)
- `--verbose` - Enable detailed logging

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

### 3. Claude CLI Setup
```bash
# Install Claude CLI for AI test generation
npm install -g @anthropic-ai/claude-cli
claude auth
claude --version  # Verify installation
```

The system automatically tests API connectivity before running commands.

## Data Flow

### Human-in-the-Loop Mode (--generate-only)
1. **Context Gathering** → GitHub PR analysis + Jira tickets + Confluence docs  
2. **AI Generation** → Claude CLI creates intelligent scenarios from full context
3. **Context Export** → Comprehensive data files + helper scripts for human review
4. **Human Refinement** → Manual review using Claude Code or automated with helper script
5. **Execution** → `execute-scenarios` command runs refined scenarios with Claude Desktop
6. **QA Reporting** → Structured output with test results and artifacts

### Direct Execution Mode
1. **Context Gathering** → GitHub PR analysis + Jira tickets + Confluence docs
2. **AI Generation** → Claude CLI creates intelligent scenarios from full context  
3. **Immediate Execution** → Claude Desktop runs AI scenarios directly
4. **QA Reporting** → Structured output with test results and artifacts

## Output Structure

### Context Export (--generate-only mode)
When using `--generate-only`, TAP exports comprehensive context files:
- `pr-analysis.json` - Complete PR analysis with diffs and metadata
- `jira-context.json` - Business context from Jira ticket (if available)
- `confluence-docs.json` - Related documentation (if found)
- `generated-scenarios.json` - Machine-readable AI-generated scenarios
- `generated-scenarios.md` - Human-readable scenario descriptions
- `context-summary.md` - Executive summary of the PR and context
- `claude-code-instructions.md` - Instructions for Claude Code review
- `claude-refine.sh` - Auto-generated helper script for Claude CLI refinement

### Test Execution Artifacts
Generated in `tap-output/` (or custom `--output` directory):
- Screenshots: `*.png` 
- Videos: `*.mp4`
- QA reports: Structured console output with AI insights and recommendations

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
- `src/commands/` - Command implementations (test-pr, execute-scenarios, setup)
- `src/services/` - Business logic services
- `mcp-servers/atlassian-mcp/server.ts` - Unified Atlassian MCP server

### Key Services
- `GitHubService` - PR analysis and diff processing
- `AtlassianService` - Jira ticket and Confluence page integration
- `AITestScenarioGenerator` - AI-powered intelligent test scenario creation using Claude CLI
- `ContextExporter` - Comprehensive data export for Claude Code review
- `ClaudeDesktopOrchestrator` - Test execution coordination
- `QAReportGenerator` - Comprehensive test reporting with AI insights