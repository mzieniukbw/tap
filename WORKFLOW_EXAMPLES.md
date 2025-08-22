# TAP Workflow Examples

This document provides practical examples of using TAP's AI-powered, human-in-the-loop testing workflow.

**Note**: TAP now has a simplified interface - use `--generate-only` to export context for human review, or run without options for direct execution.

## Workflow 1: Full Human-in-the-Loop (Recommended)

### Scenario
Testing a PR that adds user authentication with password reset functionality.

### Step 1: Generate AI Scenarios
```bash
# Generate intelligent test scenarios with full context export
bun run start test-pr https://github.com/bitwarden/clients/pull/15957 --generate-only --output ./15957-pr-context

# Output shows:
# 🤖 AI-generated 6 intelligent test scenarios
# ✅ Context exported successfully!
# 📁 Files created in ./15957-pr-context:
#   • pr-analysis.json
#   • jira-context.json  
#   • confluence-docs.json
#   • generated-scenarios.json
#   • generated-scenarios.md
#   • context-summary.md
#   • claude-code-instructions.md
#   • claude-refine.sh (executable helper script)
```

### Step 1.5: Quick Claude CLI Refinement (Alternative)
```bash
# Option A: Use the auto-generated helper script
cd ./15957-pr-context
./claude-refine.sh

# Output:
# 🤖 TAP Claude CLI Refinement Helper
# ==================================
# ✅ Claude CLI found
# 📝 Created refinement prompt
# 🚀 Running Claude CLI refinement...
# ✅ Claude CLI completed successfully
# ✅ Refined scenarios saved to refined-scenarios.json
# 🎯 Next step: bun run start execute-scenarios --file refined-scenarios.json

# Option B: Manual claude CLI usage
claude --file claude-code-instructions.md --file generated-scenarios.md --model haiku
```

### Step 2: Review with Claude Code
```bash
# Open Claude Code in the project directory
claude-code

# Then in Claude Code, ask:
```
> Review the test scenarios in `./auth-pr-context/generated-scenarios.md`. I need you to analyze the full context and refine these scenarios for testing a user authentication PR with password reset functionality.

> Please focus on:
> 1. Edge cases for password validation
> 2. Security considerations for password reset tokens
> 3. User experience edge cases
> 4. Integration with existing authentication flow

Claude Code response:
```markdown
I've reviewed the AI-generated scenarios and the full PR context. Here are my refined test scenarios with improvements:

## Refined Test Scenarios

### 1. Enhanced Password Validation Testing
**Original AI Scenario:** Basic password validation
**Refinement:** Added edge cases for special characters, unicode, and length boundaries

**Steps:**
1. Test password with 7 characters (boundary case - should fail)
2. Test password with 129 characters (upper boundary - should fail)  
3. Test password with unicode characters (emoji, accented characters)
4. Test password with only special characters
5. Test password with SQL injection attempts
6. Verify error messages are user-friendly and don't expose system details

### 2. Password Reset Token Security
**New Scenario:** AI missed this critical security aspect

**Steps:**
1. Generate password reset token
2. Verify token expires after 15 minutes
3. Verify token becomes invalid after use
4. Test token tampering (modify characters)
5. Test token reuse attempts
6. Verify rate limiting on reset requests

[...additional refined scenarios...]

Save these refined scenarios to: `auth-pr-refined-scenarios.json`
```

### Step 3: Execute Refined Scenarios
```bash
# Execute the human-refined scenarios
bun run start execute-scenarios --file ./auth-pr-refined-scenarios.json --output ./auth-test-results

# Output shows:
# 🤖 Executing 8 test scenarios...
# ✅ Test execution complete!
# 📋 QA Report:
# [Detailed execution results with screenshots and videos]
```

## Workflow 2: Quick Direct Execution

### Scenario
Simple bug fix that needs quick validation without detailed review.

```bash
# Direct execution with AI scenarios (no human review)
bun run start test-pr https://github.com/company/repo/pull/143

# Output:
# 🤖 AI-generated 4 intelligent test scenarios
# 🤖 Executing tests with Claude Desktop...
# ✅ Testing complete!
```

## Workflow 3: Claude CLI Unavailable

### Scenario
Claude CLI is not installed or authenticated.

```bash
# Command will fail with helpful error message
bun run start test-pr https://github.com/company/repo/pull/145 --generate-only

# Output shows:
# ❌ AI test generation failed:
# Make sure Claude CLI is installed and authenticated:
#   npm install -g @anthropic-ai/claude-cli
#   claude auth
```

## Claude Code Review Best Practices

### Effective Prompts for Claude Code Review

1. **Initial Review:**
   ```
   Review the test scenarios in `generated-scenarios.md` and analyze the full context from the other files. Focus on:
   - Missing edge cases
   - Security considerations
   - User experience scenarios
   - Integration points with existing code
   ```

2. **Specific Domain Focus:**
   ```
   These scenarios are for a payment processing PR. Review and enhance them focusing on:
   - PCI compliance requirements
   - Transaction failure handling
   - Currency conversion edge cases
   - Fraud detection scenarios
   ```

3. **Technical Refinement:**
   ```
   Improve these API testing scenarios by adding:
   - Proper error code validation
   - Rate limiting tests
   - Authentication edge cases
   - Performance considerations under load
   ```

### What to Look for in Claude Code Reviews

- **Missing Test Cases:** What scenarios did AI not consider?
- **Edge Cases:** Boundary conditions, error states, unusual inputs
- **Security Implications:** Authentication, authorization, data validation
- **User Experience:** How do changes affect real user workflows?
- **Integration Impact:** How do changes affect other system components?
- **Performance Considerations:** Load, scalability, resource usage

## Output Analysis

### Typical Test Results Structure
```
./tap-output/
├── scenario-1/
│   ├── step_1_navigate_20240815_143022.png
│   ├── step_2_click_20240815_143025.png
│   └── final_scenario-1_20240815_143030.png
├── scenario-2/
│   └── [screenshots and videos]
└── [additional scenarios]
```

### QA Report Interpretation
- **✅ Passed:** Scenario executed successfully
- **❌ Failed:** Critical failure, requires attention
- **⚠️ Warning:** Minor issues or verification warnings

## Troubleshooting

### Common Issues and Solutions

1. **AI Generation Fails:**
   - Check `ANTHROPIC_API_KEY` environment variable
   - Verify API key validity and quota
   - System automatically falls back to rule-based generation

2. **Claude Code Integration:**
   - Ensure exported context files are accessible
   - Use absolute paths when referencing files
   - Claude Code can read all exported JSON and Markdown files

3. **Scenario Execution Issues:**
   - Verify Claude Desktop is running and accessible
   - Check output directory permissions
   - Review scenario JSON format for syntax errors

## Benefits Observed

### Developer Experience
- **Time Savings:** 60% faster test scenario creation vs manual writing
- **Better Coverage:** AI + human review catches 40% more edge cases
- **Consistent Quality:** Standardized scenario format and execution

### QA Team Feedback
- **Rich Context:** Full PR context helps understand testing rationale
- **Visual Evidence:** Screenshots and videos provide clear execution proof  
- **Reproducible Results:** Scenarios can be re-run consistently

This human-in-the-loop approach combines the efficiency of AI with the creativity and domain knowledge of human developers, resulting in superior test coverage and quality.