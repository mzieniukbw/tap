# Testing Assistant Project (TAP)

A Bun-based CLI tool that uses AI-powered test generation and human-in-the-loop workflow to create and execute ephemeral testing scenarios from GitHub PRs and Jira tickets. TAP combines Claude CLI for intelligent test generation, Claude Code for human refinement, and Open Interpreter for automated test execution with screen automation.

📖 **[View the complete documentation and guides in our wiki](https://github.com/mzieniukbw/tap/wiki)**

## Installation

### Homebrew (macOS - Recommended)

```bash
brew install --formula https://raw.githubusercontent.com/mzieniuk/tap/main/Formula/tap.rb
```

### Quick Install Script (Linux/macOS)

```bash
curl -fsSL https://raw.githubusercontent.com/mzieniuk/tap/main/install.sh | bash
```

### Manual Installation

1. Download the appropriate binary for your platform from [releases](https://github.com/mzieniuk/tap/releases)
2. Make it executable: `chmod +x tap-*`
3. Move to PATH: `sudo mv tap-* /usr/local/bin/tap`

### Development Setup

Install bun https://bun.sh

```bash
# Install Claude CLI for AI test generation
bun install -g @anthropic-ai/claude-cli
claude auth

# Install Open Interpreter with OS capabilities (requires Python 3.11 only)
git clone https://github.com/openinterpreter/open-interpreter.git
cd open-interpreter
poetry env use 3.11
eval $(poetry env activate)
poetry install --extras "os"
cd ..
# save the OPEN_INTERPRETER_PATH environment variable (find it with `which interpreter`)

git clone https://github.com/mzieniukbw/tap.git
cd tap
bun install
bun run start setup
```

## Usage

### Human-in-the-Loop Workflow (Recommended)

```bash
# Step 1: Generate AI scenarios and export context for review
bun run start generate-tests <pr-url>             # Creates ./{PR-number}-{commit-sha}/ directory

# Step 2: Review and refine scenarios
# Option A: Use the auto-generated helper script
cd ./{PR-number}-{commit-sha} && ./claude-refine.sh
# Option B: Use Claude Code to manually review the exported files

# Step 3: Execute refined scenarios
bun run start execute-scenarios --file ./refined-scenarios.json
```

### Direct Execution

```bash
# Execute immediately with AI-generated scenarios (no human review)
# Chain generate-tests + execute-scenarios commands:
bun run start generate-tests <pr-url> && bun run start execute-scenarios --file ./test-pr-*/generated-scenarios.json

# Enable detailed logging
bun run start generate-tests <url> --verbose

# Custom output directory (overrides default {PR-number}-{commit-sha} naming)
bun run start generate-tests <url> --output ./custom-output

# Or use compiled executable
bun run build
./dist/tap generate-tests <url>
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
bun run clean                 # Clean build artifacts
```

## Command Options

### generate-tests

- `<pr-url>` - GitHub PR URL (required)
- `--generate-only` - Generate scenarios and export context for Claude Code review
- `--output <path>` - Output directory for test artifacts (default: `./{PR-number}-{commit-sha}`)
- `--verbose` - Enable detailed logging with timing information

### execute-scenarios

- `--file <path>` - Path to JSON file containing test scenarios (required)
- `--output <path>` - Output directory for test artifacts (default: `./{PR-number}-{commit-sha}`)
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
- `OPEN_INTERPRETER_PATH` - Path to Open Interpreter binary (optional - auto-detected if installed via setup)

### 3. Claude CLI Setup

```bash
# Install Claude CLI for AI test generation
bun install -g @anthropic-ai/claude-cli
claude auth
claude --version  # Verify installation
```

### 4. Open Interpreter Setup

Open Interpreter with OS capabilities is required for automated test execution with screen automation.

#### Automatic Installation (Recommended)

The easiest way is to let TAP install it automatically during setup:

```bash
tap setup
# TAP will detect if Open Interpreter is missing and offer to install it
# Prerequisites: Python 3.11 and Poetry must be installed first
```

#### Manual Installation (Alternative)

```bash
# Install Open Interpreter with OS capabilities (requires Python 3.11 only)
# Note: Poetry is required as build dependency
git clone https://github.com/openinterpreter/open-interpreter.git
cd open-interpreter
poetry env use 3.11
eval $(poetry env activate)
poetry install --extras "os"

# Set the interpreter path for TAP to find it (find it with `which interpreter`
export OPEN_INTERPRETER_PATH="/path/to/open-interpreter/.venv/bin/interpreter"
# Add to shell profile for persistence (~/.bashrc, ~/.zshrc, etc.)
```

#### Prerequisites

Before installation, ensure you have:

```bash
# Python 3.11 (required)
python3.11 --version  # or python --version (if it shows 3.11.x)

# Install Python 3.11 if needed:
# macOS: brew install python@3.11
# Ubuntu: sudo apt install python3.11
# Or use pyenv: pyenv install 3.11.0 && pyenv global 3.11.0

# Poetry (required for installation)
poetry --version

# Install Poetry if needed:
curl -sSL https://install.python-poetry.org | python3 -
```

#### Configuration

```bash
# Set up Anthropic API key for Open Interpreter
export ANTHROPIC_API_KEY=your_api_key_here
# Add to shell profile for persistence (~/.bashrc, ~/.zshrc, etc.)
```

The system automatically tests API connectivity before running commands and validates Open Interpreter setup before test execution.

## Data Flow

### Human-in-the-Loop Mode (--generate-only)

1. **Context Gathering** → GitHub PR analysis + Jira tickets + Confluence docs
2. **AI Generation** → Claude CLI creates intelligent scenarios from full context
3. **Context Export** → Comprehensive data files + helper scripts for human review
4. **Human Refinement** → Manual review using Claude Code or automated with helper script
5. **Execution** → `execute-scenarios` command runs refined scenarios with Open Interpreter
6. **QA Reporting** → Structured output with test results and artifacts

### Direct Execution Mode

1. **Context Gathering** → GitHub PR analysis + Jira tickets + Confluence docs
2. **AI Generation** → Claude CLI creates intelligent scenarios from full context
3. **Immediate Execution** → Open Interpreter runs AI scenarios directly
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

Generated in `./{PR-number}-{commit-sha}/` directory by default:

- **Default naming**: `./{PR-number}-{7-char-commit-sha}/` (e.g., `./123-abc1234/`)
- **Custom output**: Use `--output <path>` to override default naming
- **Artifacts**: Screenshots (`*.png`), Videos (`*.mp4`), QA reports
- **Context files**: All exported context and refinement files

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
- No permanent test cases - all scenarios are dynamically generated
- Unified Atlassian authentication uses single API token for both Jira and Confluence

## Architecture

### Core Structure

- `src/main.ts` - CLI entry point using Commander.js framework
- `src/commands/` - Command implementations (generate-tests, execute-scenarios, setup)
- `src/services/` - Business logic services

### Key Services

- `GitHubService` - PR analysis and diff processing
- `AtlassianService` - Jira ticket and Confluence page integration
- `AITestScenarioGenerator` - AI-powered intelligent test scenario creation using Claude CLI
- `ContextExporter` - Comprehensive data export for Claude Code review
- `OpenInterpreterExecutor` - Test execution coordination using Open Interpreter
- `QAReportGenerator` - Comprehensive test reporting with AI insights
