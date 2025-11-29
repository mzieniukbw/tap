# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TAP (Testing Assistant Project) is a Bun-based CLI tool that uses AI-powered test generation and human-in-the-loop workflow to create and execute ephemeral testing scenarios from GitHub PRs and Jira tickets. It combines Claude API for intelligent test generation, Claude Code for human refinement, and CUA (Computer Use Agent) for automated test execution with Docker-based containerized testing.

## Development Commands

### Primary Tasks

```bash
# Human-in-the-loop workflow (recommended)
bun run start generate-tests <pr-url>              # Generate AI scenarios + export context
bun run start execute-scenarios --file <refined>   # Execute refined scenarios

# Direct execution (combines generation + execution)
# Note: Use generate-tests + execute-scenarios for recommended human-in-the-loop workflow

# Development and setup
bun run dev                                        # Development with file watching
bun run start setup                               # Setup and configuration (interactive, required)

# Setup options for test execution
bun run start generate-tests <pr-url> --setup     # Add PR-specific setup instructions
# For direct execution, chain the commands:
# bun run start generate-tests <pr-url> && bun run start execute-scenarios --file ./test-pr-*/generated-scenarios.json
bun run start execute-scenarios --file <refined> --setup  # Add session-specific setup
```

### Build Commands

```bash
# Build main TAP executable
bun run build

# Build for multiple platforms
bun run build:cross

# Platform-specific builds
bun run build:linux
bun run build:windows
bun run build:macos

# Clean build artifacts
bun run clean

# Code formatting and linting
bun run format
bun run lint
```

## Code Architecture

### Core Structure

- `src/main.ts` - CLI entry point using Commander.js framework
- `src/commands/` - Command implementations (generate-tests, execute-scenarios, setup)
- `src/services/` - Business logic services

### Key Services

- `GitHubService` - PR analysis and diff processing
- `AtlassianService` - Jira ticket and Confluence page integration
- `ContextGatheringService` - Comprehensive context collection from multiple sources
- `OnyxContextService` - Enhanced product context from Onyx AI (optional)
- `TestExecutionService` - Test execution coordination and management
- `ConfigService` - Configuration management for API credentials

### Data Flow (Human-in-the-Loop)

1. **Context Gathering** → GitHub PR analysis + Jira tickets + Confluence docs
2. **AI Generation** → Claude API creates intelligent scenarios from full context
3. **Context Export** → Comprehensive data export for human review
4. **Human Refinement** → Claude Code assists with scenario review and improvement
5. **Execution** → CUA (Computer Use Agent) runs refined scenarios with Docker-based computer control
6. **QA Reporting** → Structured output with AI insights and execution artifacts

## Configuration

TAP requires configuration before use:

### 1. Interactive Setup (Required)

```bash
bun run start setup
```

Creates `~/.tap/config.json` with your API credentials and **required app setup instructions**.

### 2. Environment Variables (Alternative)

- `GITHUB_TOKEN` - GitHub Personal Access Token
- `ATLASSIAN_API_TOKEN` - Unified token for Jira and Confluence
- `ATLASSIAN_EMAIL` - Atlassian account email
- `ATLASSIAN_BASE_URL` - Atlassian instance URL (e.g., https://company.atlassian.net)
- `TAP_APP_SETUP_INSTRUCTIONS` - Natural language app setup instructions (required for test execution)
- `ONYX_BASE_URL` - Onyx instance URL (optional - defaults to https://api.onyx.app)
- `ONYX_API_KEY` - Onyx AI API key (optional - for enhanced product context)

### 3. Claude CLI for AI Generation (Required)

TAP requires Claude CLI for AI-powered test scenario generation. Install and authenticate:

```bash
# Install Claude CLI for intelligent test scenario generation
npm install -g @anthropic-ai/claude-cli

# Authenticate with your Anthropic account
claude auth

# Verify installation
claude --version
```

### 4. CUA (Computer Use Agent) for Test Execution (Required)

TAP requires CUA with Docker for automated test execution with containerized computer control.

#### Prerequisites

**Required:**
- **Python 3.10+**: For running CUA agent
- **Docker**: Required for containerized test execution
  - macOS: [Docker Desktop](https://www.docker.com/products/docker-desktop)
  - Linux: `sudo apt install docker.io` (or equivalent)
  - Windows: Docker Desktop with WSL2 backend

#### Installation

```bash
bun run start setup
```

TAP will automatically detect if CUA is missing and install it during setup.

**Prerequisites:**
- Python 3.10+ must be installed first
- Docker must be installed and running

The system automatically validates CUA setup and Docker availability before running test execution commands.

## App Setup Instructions

TAP requires natural language instructions describing how to access and authenticate with your application for testing. These instructions are provided to CUA (Computer Use Agent) as part of the execution context.

### Setup Layers

TAP supports multiple layers of setup instructions to handle different testing scenarios:

#### 1. Base App Setup (Required - configured in `tap setup`)

```
Example:
1. Navigate to https://staging.myapp.com
2. If logged out, use test account: testuser@company.com / TestPass123
3. Click 'Admin Panel' in top menu to access admin features
```

#### 2. PR-Specific Setup (Optional - use `--setup` flag with generate-tests)

```
Example:
• This PR requires running: npm run build
• New feature flag: FEATURE_X=true
• Test with port 3001 instead of default 3000
• Download build artifact from GitHub Actions run #123
```

#### 3. Session-Specific Setup (Interactive - prompted during execute-scenarios)

```
Example:
• Start local development server: npm run dev
• Clear browser cache and logout first
• Use specific test data: import testdata.sql
```

### Setup Best Practices

- **Be specific**: Include exact URLs, credentials, and steps
- **Include authentication**: Provide test accounts and passwords
- **Environment details**: Specify ports, feature flags, build requirements
- **Prerequisites**: Mention any setup steps like starting servers or importing data
- **Natural language**: Write instructions as you would tell a human tester

## Usage Patterns

### Testing PRs (Human-in-the-Loop Workflow)

```bash
# Step 1: Generate AI scenarios and export context for review
bun run start generate-tests <pr-url>             # Creates ./test-pr-{PR-number}-{commit-sha}/ directory

# Step 1 with PR-specific setup (optional)
bun run start generate-tests <pr-url> --setup     # Prompts for PR-specific setup instructions

# Step 2: Use Claude Code to refine scenarios interactively
# Run the generated interactive helper script:
./test-pr-{PR-number}-{commit-sha}/claude-refine.sh

# Step 3: Execute refined scenarios
bun run start execute-scenarios --file ./test-pr-{PR-number}-{commit-sha}/refined-scenarios.json

# Step 3 with additional setup (optional)
bun run start execute-scenarios --file ./test-pr-{PR-number}-{commit-sha}/refined-scenarios.json --setup

# Alternative: Direct execution (no human review)
# Chain commands for immediate execution:
bun run start generate-tests <pr-url> && bun run start execute-scenarios --file ./test-pr-*/generated-scenarios.json

# Custom output directory (overrides default naming)
bun run start generate-tests <pr-url> --output ./custom-dir
```

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

Test artifacts are generated in `./test-pr-{PR-number}-{commit-sha}/` directory by default:

- **Default naming**: `./test-pr-{PR-number}-{7-char-commit-sha}/` (e.g., `./test-pr-123-abc1234/`)
- **Custom output**: Use `--output <path>` to override default naming
- **Artifacts**: Screenshots (`*.png`), Videos (`*.mp4`), QA reports
- **Context files**: `pr-analysis.json`, `generated-scenarios.json`, refinement guides

## Development Notes

- This is a Bun project with Node.js compatibility - use Node.js APIs and npm packages
- All external dependencies are managed via package.json and npm registry
- No permanent test cases - all scenarios are dynamically generated
- Unified Atlassian authentication uses single API token for both Jira and Confluence
- Always run `bun run format` and `bun run lint` before committing changes

## Code Standards

### TypeScript Configuration

- Strict mode enabled
- Node.js standard library imports
- Commander.js library for CLI framework
- Modern ES modules with top-level await

### Code Formatting (Prettier)

- 2-space indentation
- 100 character line width
- Semicolons required
- Double quotes preferred
- Includes: src/
- Excludes: dist/, node_modules/
