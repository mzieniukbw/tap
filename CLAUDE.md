# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TAP (Testing Assistant Project) is a Bun-based CLI tool that automatically generates and executes ephemeral testing scenarios from GitHub PRs and Jira tickets. It leverages Claude Code for orchestration and Claude Desktop for test execution with screen automation.

## Development Commands

### Primary Tasks
```bash
# Start the application
bun run start <command>

# Development with file watching
bun run dev

# Setup and configuration (interactive)
bun run start setup
```

### Build Commands
```bash
# Build main TAP executable
bun run build

# Build MCP server executable
bun run build:mcp

# Build both executables
bun run build:all

# Clean build artifacts
bun run clean
```

### MCP Development
```bash
# Run MCP server in development mode
bun run dev:mcp
```

## Code Architecture

### Core Structure
- `src/main.ts` - CLI entry point using Commander.js framework
- `src/commands/` - Command implementations (test-pr, test-current-pr, setup)
- `src/services/` - Business logic services
- `src/mcp-servers/atlassian-mcp/server.ts` - Unified Atlassian MCP server

### Key Services
- `GitHubService` - PR analysis and diff processing
- `AtlassianService` - Jira ticket and Confluence page integration
- `TestScenarioGenerator` - Dynamic test scenario creation
- `ClaudeDesktopOrchestrator` - Test execution coordination
- `QAReportGenerator` - Comprehensive test reporting

### Data Flow
1. GitHub PR analysis → Extract diffs, metadata, Jira ticket keys
2. Jira context gathering → Ticket details, epics, linked issues
3. Confluence documentation → Related technical documentation
4. Test generation → Context-aware scenarios
5. Claude Desktop execution → Automated testing with screen capture
6. QA report generation → Structured output with artifacts

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

## Usage Patterns

### Testing PRs
```bash
# Test specific PR
bun run start test-pr https://github.com/company/repo/pull/123

# Test current branch PR (auto-detect)
bun run start test-current-pr

# Test with focus areas
bun run start test-pr <url> --focus="authentication,payment-flow"

# Generate scenarios without execution
bun run start test-pr <url> --skip-execution
```

### MCP Server Integration
The Atlassian MCP server provides:
- Jira ticket retrieval and search
- Confluence page content access
- Ticket context with epics and linked issues
- Related documentation discovery

## TypeScript Configuration

- Strict mode enabled
- Node.js standard library imports
- Commander.js library for CLI framework
- Modern ES modules with top-level await

## Code Formatting

Prettier configuration:
- 2-space indentation
- 100 character line width
- Semicolons required
- Double quotes preferred
- Includes: src/
- Excludes: dist/, node_modules/

## Output Structure

Test artifacts are generated in `tap-output/` (or custom `--output` directory):
- Screenshots: `*.png`
- Videos: `*.mp4` 
- QA reports: Structured console output with recommendations

## Development Notes

- This is a Bun project with Node.js compatibility - use Node.js APIs and npm packages
- All external dependencies are managed via package.json and npm registry
- MCP server uses @modelcontextprotocol/sdk for Model Context Protocol integration
- No permanent test cases - all scenarios are dynamically generated
- Unified Atlassian authentication uses single API token for both Jira and Confluence