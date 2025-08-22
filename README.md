# Developer Testing Assistant Kit (TAP)

An internal productivity tool that leverages Claude Code CLI and Claude Desktop to automatically generate and execute ephemeral testing scenarios based on GitHub PRs and Jira tickets.

## Quick Setup

```bash
cd tap
deno task setup
```

## Usage

```bash
# Test a specific PR
deno task start test-pr https://github.com/company/repo/pull/123

# Test current branch PR (auto-detect)
deno task start test-current-pr

# Test with specific focus areas
deno task start test-pr <url> --focus="authentication,payment-flow"

# Or use compiled executable
deno task build
./dist/tap test-pr <url>
```

## Available Tasks

```bash
deno task setup           # Initial setup and configuration
deno task test-connectivity  # Test API connections
deno task build           # Compile TAP executable
deno task build:mcp       # Compile MCP server
deno task build:all       # Build both executables
deno task clean           # Clean build artifacts
deno task dev             # Development mode with watch
deno task dev:mcp         # MCP server development mode
```

## Configuration

The system uses a single Atlassian API token for both Jira and Confluence access, as per Atlassian's unified authentication model.

Required environment variables:
- `GITHUB_TOKEN` - GitHub Personal Access Token
- `ATLASSIAN_API_TOKEN` - Unified token for Jira and Confluence
- `ATLASSIAN_BASE_URL` - Your Atlassian instance URL (e.g., `https://company.atlassian.net`)