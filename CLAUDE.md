# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TAP (Testing Assistant Project) is a Deno-based CLI tool that automatically generates and executes ephemeral testing scenarios from GitHub PRs and Jira tickets. It leverages Claude Code for orchestration and Claude Desktop for test execution with screen automation.

## Development Commands

### Primary Tasks
```bash
# Start the application
deno task start <command>

# Development with file watching
deno task dev

# Setup and configuration
deno task setup

# Test API connectivity
deno task test-connectivity
```

### Build Commands
```bash
# Build main TAP executable
deno task build

# Build MCP server executable
deno task build:mcp

# Build both executables
deno task build:all

# Clean build artifacts
deno task clean
```

### MCP Development
```bash
# Run MCP server in development mode
deno task dev:mcp
```

## Code Architecture

### Core Structure
- `src/main.ts` - CLI entry point using Cliffy command framework
- `src/commands/` - Command implementations (test-pr, test-current-pr, setup)
- `src/services/` - Business logic services
- `mcp-servers/atlassian-mcp/server.ts` - Unified Atlassian MCP server

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

## Environment Configuration

Required environment variables:
- `GITHUB_TOKEN` - GitHub Personal Access Token
- `ATLASSIAN_API_TOKEN` - Unified token for Jira and Confluence
- `ATLASSIAN_EMAIL` - Atlassian account email
- `ATLASSIAN_BASE_URL` - Atlassian instance URL (e.g., https://company.atlassian.net)

## Usage Patterns

### Testing PRs
```bash
# Test specific PR
deno task start test-pr https://github.com/company/repo/pull/123

# Test current branch PR (auto-detect)
deno task start test-current-pr

# Test with focus areas
deno task start test-pr <url> --focus="authentication,payment-flow"

# Generate scenarios without execution
deno task start test-pr <url> --skip-execution
```

### MCP Server Integration
The Atlassian MCP server provides:
- Jira ticket retrieval and search
- Confluence page content access
- Ticket context with epics and linked issues
- Related documentation discovery

## TypeScript Configuration

- Strict mode enabled
- Deno standard library imports via `@std/`
- Cliffy library for CLI framework
- Modern ES modules with top-level await

## Code Formatting

Deno fmt configuration:
- 2-space indentation
- 100 character line width
- Semicolons required
- Double quotes preferred
- Includes: src/, scripts/
- Excludes: dist/, node_modules/

## Output Structure

Test artifacts are generated in `tap-output/` (or custom `--output` directory):
- Screenshots: `*.png`
- Videos: `*.mp4` 
- QA reports: Structured console output with recommendations

## Development Notes

- This is a Deno project, not Node.js - use Deno APIs and imports
- All external dependencies use URL imports from deno.land
- MCP server uses npm: imports for Model Context Protocol SDK
- No permanent test cases - all scenarios are dynamically generated
- Unified Atlassian authentication uses single API token for both Jira and Confluence