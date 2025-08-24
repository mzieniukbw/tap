# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TAP (Testing Assistant Project) is a Bun-based CLI tool that uses AI-powered test generation and human-in-the-loop workflow to create and execute ephemeral testing scenarios from GitHub PRs and Jira tickets. It combines Claude API for intelligent test generation, Claude Code for human refinement, and Open Interpreter for automated test execution with screen automation.

## Development Commands

### Primary Tasks

```bash
# Human-in-the-loop workflow (recommended)
bun run start test-pr <pr-url> --generate-only    # Generate AI scenarios + export context
bun run start execute-scenarios --file <refined>   # Execute refined scenarios

# Direct execution
bun run start test-pr <pr-url>                     # Full execution without review

# Development and setup
bun run dev                                        # Development with file watching
bun run start setup                               # Setup and configuration (interactive)
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
- `src/commands/` - Command implementations (test-pr, execute-scenarios, setup)
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
5. **Execution** → Open Interpreter runs refined scenarios with automated screen control
6. **QA Reporting** → Structured output with AI insights and execution artifacts

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

### 4. Open Interpreter for Test Execution (Required)

TAP requires Open Interpreter for automated test execution. Install and configure:

```bash
# Install Open Interpreter for test execution (requires Python 3.10 or 3.11)
pip install open-interpreter

# Set up Anthropic API key for Open Interpreter
export ANTHROPIC_API_KEY=your_api_key_here

# Verify installation
interpreter --version
```

The system automatically tests API connectivity and validates Open Interpreter setup before running commands.

## Usage Patterns

### Testing PRs (Human-in-the-Loop Workflow)

```bash
# Step 1: Generate AI scenarios and export context for review
bun run start test-pr <pr-url> --generate-only    # Creates ./test-pr-{PR-number}-{commit-sha}/ directory

# Step 2: Use Claude Code to refine scenarios interactively
# Run the generated interactive helper script:
./test-pr-{PR-number}-{commit-sha}/claude-refine.sh

# Step 3: Execute refined scenarios
bun run start execute-scenarios --file ./test-pr-{PR-number}-{commit-sha}/refined-scenarios.json

# Alternative: Direct execution (no human review)
bun run start test-pr <pr-url>                    # Full execution with AI scenarios

# Custom output directory (overrides default naming)
bun run start test-pr <pr-url> --generate-only --output ./custom-dir
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
