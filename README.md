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

## Quick Start

### 1. Setup (Required)

```bash
tap setup  # Interactive configuration for API credentials and app setup
```

### 2. Human-in-the-Loop Workflow

```bash
# Step 1: Generate AI scenarios and export context for review
tap generate-tests <pr-url>

# Step 2: Review and refine scenarios with Claude Code
cd ./test-pr-{PR-number}-{commit-sha}
./claude-refine.sh  # Or manually review exported files

# Step 3: Execute refined scenarios  
tap execute-scenarios --file ./refined-scenarios.json
```

## Requirements

- **Claude CLI**: `npm install -g @anthropic-ai/claude-cli && claude auth`
- **Open Interpreter**: Auto-installed during setup (requires Python 3.11)

## Configuration

TAP requires API credentials and app setup instructions.

### Interactive

Run `tap setup` for interactive configuration.

### Manual

Or use environment variables:

- `GITHUB_TOKEN` - GitHub Personal Access Token
- `ATLASSIAN_API_TOKEN` - Unified token for Jira and Confluence  
- `ATLASSIAN_EMAIL` - Atlassian account email
- `ATLASSIAN_BASE_URL` - Atlassian instance URL
- `TAP_APP_SETUP_INSTRUCTIONS` - Natural language app setup instructions
- `ANTHROPIC_API_KEY` - Required for Open Interpreter

## Documentation

- 📖 [Complete guides and workflows](https://github.com/mzieniukbw/tap/wiki)
- 💡 [Usage examples and configuration](EXAMPLES.md)
- 🏗️ [Development and build instructions](BUILD.md)

## Output

TAP creates `./test-pr-{PR-number}-{commit-sha}/` directories with:

- **Context Export**: PR analysis, Jira tickets, Confluence docs
- **AI Scenarios**: Machine and human-readable test scenarios  
- **Refinement Tools**: Claude Code instructions and helper scripts
- **Execution Results**: Screenshots, videos, QA reports

Use `--verbose` for detailed logging and `--output <path>` for custom directories.