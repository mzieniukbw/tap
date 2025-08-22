# Developer Testing Assistant Kit

## Project Overview

An internal productivity tool that leverages Claude Code CLI and Claude Desktop to automatically generate and execute ephemeral testing scenarios based on GitHub PRs and Jira tickets. No permanent test cases are created - everything is dynamically generated and executed on-the-fly.

## Architecture

### Core Components (Human-in-the-Loop)
```
Developer Machine
├── TAP CLI (AI-powered orchestrator)
│   ├── GitHub API integration
│   ├── MCP servers management  
│   ├── AI test generation (Claude API)
│   └── Context export for review
├── Claude Code (human collaboration)
│   ├── Scenario review and refinement
│   ├── Edge case identification
│   └── Business logic validation
└── Claude Desktop (test executor)
    └── Desktop automation (screen control)
```

### Technical Stack

**TAP CLI - The AI Brain**
- **GitHub API integration**: PR analysis and diff processing
- **MCP server coordination**: Manages Jira and Confluence data gathering
- **AI-powered generation**: Uses Claude CLI for intelligent test scenarios
- **Context export**: Outputs comprehensive data for human review
- **Execution coordination**: Orchestrates with Claude Desktop

**Claude Code - The Human Intelligence**
- **Scenario refinement**: Reviews AI-generated tests with full context
- **Edge case identification**: Adds human insight to test coverage
- **Business logic validation**: Ensures scenarios match real-world usage
- **Quality assurance**: Improves test scenarios before execution

**Claude Desktop - The Hands**
- **Desktop automation**: Mouse/keyboard control for all platforms
- **Screen capture**: Screenshots and video recording during tests
- **Application interaction**: Web browsers, desktop apps, CLI terminals
- **Real-time execution**: Runs generated scenarios immediately

**MCP Server (Deno/TypeScript) - Unified**
```
mcp-servers/
└── atlassian-mcp/
    └── server.ts            # Unified Jira + Confluence integration
                            # Uses single Atlassian API token
                            # Built with Deno for modern runtime
```

## Data Flow

### Context Gathering Chain
1. **GitHub PR** → Extract PR URL, diff, changed files
2. **Jira Ticket** → Follow PR → Jira ticket linkage
3. **Tech Breakdown** → Follow Jira → Confluence tech breakdown
4. **Help Documentation** → Fallback to product help pages with screenshots/videos

### Execution Flow (Human-in-the-Loop)
1. **Context Generation**: `bun run start test-pr <pr-url> --generate-only`
   - TAP fetches PR diffs and metadata via GitHub API
   - Queries MCP servers for Jira context and Confluence documentation
   - Uses Claude CLI to generate intelligent test scenarios
   - Exports comprehensive context for human review

2. **Human Review with Claude Code**:
   - Developer opens Claude Code and reviews exported context
   - Claude Code analyzes full context (PR + Jira + generated scenarios)
   - Human + AI collaborate to refine scenarios
   - Claude Code suggests improvements, edge cases, and business logic validation
   - Refined scenarios saved for execution

3. **Automated Execution**: `bun run start execute-scenarios --file <refined.json>`
   - TAP loads refined scenarios from human review
   - Claude Desktop takes control to execute tests across platforms
   - Captures screenshots and videos during execution
   - Generates comprehensive QA report

## Package Distribution

### Deliverable Structure
```
testing-assistant-project/
├── deno.json                          # Deno configuration and tasks
├── README.md                          # Setup and usage instructions  
├── src/                               # TAP CLI source code
│   ├── main.ts                        # CLI entry point
│   ├── commands/                      # Command implementations
│   └── services/                      # Core business logic
├── mcp-servers/
│   └── atlassian-mcp/
│       └── server.ts                  # Unified Atlassian integration
├── scripts/
│   ├── setup.ts                       # Deno-based setup
│   └── test-connectivity.ts           # API verification
└── dist/                              # Compiled executables (after build)
    ├── tap                            # Main CLI executable
    └── mcp-server                     # MCP server executable
```

### Setup Script Capabilities
- Configure API credentials for GitHub/Atlassian (unified token)
- Test connectivity to all services (GitHub, Jira, Confluence)
- Compile executables for deployment
- Validate prerequisites (Deno, Git)
- Create secure configuration files

## Developer Workflow

### Daily Usage (Human-in-the-Loop Workflow)

#### Option 1: Generate + Review + Execute
```bash
# Step 1: Generate AI scenarios and export context
bun run start test-pr <pr-url> --generate-only --output ./tap-context

# Step 2: Review with Claude Code (in separate terminal)
claude-code
# Then in Claude Code: "Review the test scenarios in ./tap-context/generated-scenarios.md and refine them"

# Step 3: Execute refined scenarios  
bun run start execute-scenarios --file ./refined-scenarios.json
```

#### Option 2: Direct Execution
```bash
# Execute immediately with AI-generated scenarios (no human review)
bun run start test-pr <pr-url>

# Generate scenarios without execution
bun run start test-pr <url> --skip-execution
```

#### Option 3: Compiled Executable
```bash
bun run build:all
./dist/tap test-pr <url> --generate-only
./dist/tap execute-scenarios --file <refined.json>
```

### Output Format
```
=== QA Testing Notes ===
PR: https://github.com/company/repo/pull/123
Jira: PROJ-456 - Add user authentication flow
Tech Breakdown: Authentication Service Design

Code Changes Analyzed:
- Modified: src/auth/login.rs
- Added: src/auth/session.rs
- Updated: tests/auth_tests.rs

Test Scenarios Executed:
✅ 1. User login with valid credentials
   - Opened browser to login page
   - Entered test credentials
   - Verified successful login redirect
   - Screenshot: login_success_20240815_143022.png

✅ 2. Session management validation
   - Verified session token creation
   - Tested session timeout behavior
   - Confirmed logout functionality
   - Video: session_flow_20240815_143045.mp4

⚠️ 3. Error handling for invalid credentials
   - Found minor UI issue: error message positioning
   - Functionality works correctly
   - Screenshot: error_state_20240815_143112.png

Recommendations:
- Consider fixing error message positioning in login form
- All core functionality working as expected
- Ready for QA team review

Files Created:
- login_success_20240815_143022.png
- session_flow_20240815_143045.mp4
- error_state_20240815_143112.png
```

## Key Benefits

### For Developers
- **AI + Human Intelligence**: Combines AI analysis with human insight for superior test coverage
- **Zero Test Maintenance**: No permanent test suites to maintain
- **Contextual Intelligence**: AI understands business logic from PR, Jira, and documentation
- **Human Validation**: Claude Code helps catch edge cases AI might miss
- **Multi-Platform Coverage**: Single workflow tests across all application types
- **Clear Documentation**: Structured testing notes with AI summaries

### For QA Team
- **Pre-Refined Scenarios**: Receive human-reviewed, AI-enhanced test cases
- **Rich Context**: Full PR analysis, business context, and execution recordings
- **Consistent Quality**: Standardized testing documentation with AI insights
- **Time Savings**: Pre-validated changes with comprehensive test results
- **Visual Evidence**: Screenshots and videos of test execution

### Technical Advantages
- **Hybrid Intelligence**: AI efficiency with human creativity and business understanding
- **Always Current**: Each test run is fresh and relevant to specific changes
- **No Test Debt**: No accumulation of outdated or brittle test cases
- **Adaptive Testing**: AI adapts scenarios based on code changes and business context
- **Comprehensive Recording**: Full audit trail with AI analysis
- **Simple Architecture**: Clean separation between AI generation, human review, and execution
- **Fallback Capability**: Works with or without AI API access

## Implementation Phases

### Implementation Status - ✅ COMPLETED

### Phase 1: Core Infrastructure ✅
- [x] Set up unified Atlassian MCP server (Deno-based)
- [x] Implement GitHub PR analysis
- [x] Build Jira ticket resolution with epic/linked issue support
- [x] Create comprehensive data fetching

### Phase 2: Content Integration ✅
- [x] Confluence page parsing and search
- [x] Documentation correlation with tickets
- [x] Smart data correlation between GitHub, Jira, and Confluence

### Phase 3: Test Generation ✅
- [x] Intelligent code change analysis algorithms
- [x] Business context correlation from tickets/epics
- [x] Advanced test scenario generation logic
- [x] Multi-platform test planning with automation levels

### Phase 4: Execution & Recording ✅
- [x] Claude Desktop orchestration framework
- [x] Screen capture and video recording simulation
- [x] Multi-application automation planning
- [x] Comprehensive QA report generation

### Phase 5: Packaging & Distribution ✅
- [x] Deno-based setup and build system
- [x] Configuration management
- [x] Single-executable compilation
- [x] Complete usage documentation

## Configuration Examples

### Claude Desktop MCP Configuration
```json
{
  "mcpServers": {
    "atlassian": {
      "command": "deno",
      "args": ["run", "--allow-all", "./mcp-servers/atlassian-mcp/server.ts"],
      "env": {
        "ATLASSIAN_API_TOKEN": "${ATLASSIAN_API_TOKEN}",
        "ATLASSIAN_EMAIL": "${ATLASSIAN_EMAIL}", 
        "ATLASSIAN_BASE_URL": "https://company.atlassian.net"
      }
    }
  }
}
```

### Or using compiled executable:
```json
{
  "mcpServers": {
    "atlassian": {
      "command": "./dist/mcp-server",
      "env": {
        "ATLASSIAN_API_TOKEN": "${ATLASSIAN_API_TOKEN}",
        "ATLASSIAN_EMAIL": "${ATLASSIAN_EMAIL}",
        "ATLASSIAN_BASE_URL": "https://company.atlassian.net"
      }
    }
  }
}
```

### Environment Variables
```bash
# API Credentials (Simplified - single Atlassian token)
export GITHUB_TOKEN="ghp_xxxxxxxxxxxx"
export ATLASSIAN_API_TOKEN="xxxxxxxxxxxx"  # Single token for Jira + Confluence
export ATLASSIAN_EMAIL="your-email@company.com"

# Company-Specific URLs
export ATLASSIAN_BASE_URL="https://company.atlassian.net"
export COMPANY_HELP_DOCS="https://help.company.com"

# AI Test Generation (Claude CLI)
# Install Claude CLI: npm install -g @anthropic-ai/claude-cli
# Authenticate: claude auth
```

---

**Status**: ✅ IMPLEMENTATION COMPLETE  
**Target Audience**: Internal Development Team  
**Deployment Model**: Self-contained Deno executable per developer machine  
**Maintenance**: Minimal - ephemeral testing approach eliminates test suite maintenance

## Quick Start
```bash
cd tap
deno task setup              # Initial configuration
deno task test-connectivity  # Verify API access
deno task start test-pr <url> # Test a PR
```

## Key Features Implemented
- **AI-Powered Test Generation**: Claude CLI creates intelligent scenarios from full context
- **Human-in-the-Loop Workflow**: Claude Code + Claude CLI collaboration for scenario refinement  
- **Unified Atlassian Integration**: Single API token for Jira + Confluence
- **Context Export System**: Comprehensive data export for human review
- **Claude CLI Helper Scripts**: Automated refinement workflows with the claude CLI
- **Simplified Architecture**: Clean, focused AI-first approach
- **Modern Bun Runtime**: Fast TypeScript execution with single-executable deployment
- **Comprehensive Reporting**: Rich QA documentation with AI insights and recordings
- **Zero Test Maintenance**: Fresh scenarios generated per PR with human validation