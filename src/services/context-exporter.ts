import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { PRAnalysis } from "./github";
import { TicketContext, ConfluencePage } from "./atlassian";
import { TestScenario } from "./ai-test-generator";
import { OnyxContext } from "./onyx-context";

export interface ContextExportData {
  prAnalysis: PRAnalysis;
  jiraContext?: TicketContext | null;
  confluencePages: ConfluencePage[];
  onyxContext?: OnyxContext | null;
  generatedScenarios: TestScenario[];
  aiSummary: string;
  metadata: {
    exportedAt: string;
    tapVersion: string;
    totalScenarios: number;
  };
}

export class ContextExporter {
  async exportFullContext(
    data: ContextExportData,
    outputDir: string = "./tap-context"
  ): Promise<string[]> {
    // Ensure output directory exists
    if (!existsSync(outputDir)) {
      await mkdir(outputDir, { recursive: true });
    }

    const exportedFiles: string[] = [];

    // 1. Export PR Analysis
    const prAnalysisPath = join(outputDir, "pr-analysis.json");
    await this.writeJsonFile(prAnalysisPath, data.prAnalysis);
    exportedFiles.push(prAnalysisPath);

    // 2. Export Jira Context
    if (data.jiraContext) {
      const jiraContextPath = join(outputDir, "jira-context.json");
      await this.writeJsonFile(jiraContextPath, data.jiraContext);
      exportedFiles.push(jiraContextPath);
    }

    // 3. Export Confluence Documentation
    if (data.confluencePages.length > 0) {
      const confluenceDocsPath = join(outputDir, "confluence-docs.json");
      await this.writeJsonFile(confluenceDocsPath, data.confluencePages);
      exportedFiles.push(confluenceDocsPath);
    }

    // 3.5. Export Onyx AI Product Context
    if (data.onyxContext) {
      const onyxContextPath = join(outputDir, "onyx-product-context.json");
      await this.writeJsonFile(onyxContextPath, data.onyxContext);
      exportedFiles.push(onyxContextPath);
    }

    // 4. Export Generated Scenarios as JSON
    const scenariosJsonPath = join(outputDir, "generated-scenarios.json");
    await this.writeJsonFile(scenariosJsonPath, data.generatedScenarios);
    exportedFiles.push(scenariosJsonPath);

    // 5. Export Generated Scenarios as Human-Readable Markdown
    const scenariosMdPath = join(outputDir, "generated-scenarios.md");
    const scenariosMarkdown = await this.generateScenariosMarkdown(data);
    await this.writeTextFile(scenariosMdPath, scenariosMarkdown);
    exportedFiles.push(scenariosMdPath);

    // 6. Export Context Summary for Claude Code
    const contextSummaryPath = join(outputDir, "context-summary.md");
    const contextSummary = await this.generateContextSummary(data);
    await this.writeTextFile(contextSummaryPath, contextSummary);
    exportedFiles.push(contextSummaryPath);

    // 7. Export Claude Code Instructions
    const instructionsPath = join(outputDir, "claude-code-instructions.md");
    const instructions = this.generateClaudeCodeInstructions(data);
    await this.writeTextFile(instructionsPath, instructions);
    exportedFiles.push(instructionsPath);

    // 8. Export Claude CLI Helper Script
    const helperScriptPath = join(outputDir, "claude-refine.sh");
    const helperScript = this.generateClaudeCLIHelper(data);
    await this.writeTextFile(helperScriptPath, helperScript);
    exportedFiles.push(helperScriptPath);

    // Make the helper script executable
    try {
      await import("fs/promises").then((fs) => fs.chmod(helperScriptPath, "755"));
    } catch (error) {
      console.warn(`Could not make ${helperScriptPath} executable:`, error);
    }

    return exportedFiles;
  }

  private async writeJsonFile(filePath: string, data: any): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
  }

  private async writeTextFile(filePath: string, content: string): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf-8");
  }

  private async generateScenariosMarkdown(data: ContextExportData): Promise<string> {
    const { generatedScenarios, prAnalysis, jiraContext } = data;

    let markdown = `# AI-Generated Test Scenarios

**Generated for PR:** ${prAnalysis.title}  
**Jira Ticket:** ${jiraContext?.ticket.key || "None"} - ${jiraContext?.ticket.summary || "N/A"}  
**Generated at:** ${data.metadata.exportedAt}  
**Total Scenarios:** ${generatedScenarios.length}

## AI Summary
${data.aiSummary}

## General Testing Guidelines

**⚠️ Testing Philosophy:** These scenarios focus on testing what the PR actually changes. For basic UI interactions (button clicks, form submissions, checkbox toggles), assume they work as expected unless they're directly related to the changes being tested.

**🚫 Fail the test if:**
- Any step produces an error or unexpected behavior
- The application crashes or becomes unresponsive  
- Data is corrupted or lost
- Security boundaries are violated
- Performance degrades significantly

**✅ Skip explicit verification for:**
- Basic UI element visibility after navigation
- Standard form field acceptance of valid input
- Simple state changes (toggles, dropdowns) unless central to the test

---

## Test Scenarios

`;

    generatedScenarios.forEach((scenario, index) => {
      markdown += `### ${index + 1}. ${scenario.title}

**Priority:** ${scenario.priority.toUpperCase()} | **Category:** ${scenario.category} | **Duration:** ${scenario.estimatedDuration} min | **Automation:** ${scenario.automationLevel}

**Description:** ${scenario.description}

**Focus Areas:** ${scenario.focusAreas.join(", ")}

**Test Steps:**
${scenario.steps
  .map(
    (step, stepIndex) =>
      `${stepIndex + 1}. **${step.action.charAt(0).toUpperCase() + step.action.slice(1)}** ${step.target ? `"${step.target}"` : ""}${step.input ? ` with "${step.input}"` : ""}${step.verification ? `\n   - *Verify:* ${step.verification}` : ""}`
  )
  .join("\n")}

**Expected Outcome:** ${scenario.expectedOutcome}

---

`;
    });

    return markdown;
  }

  private async generateContextSummary(data: ContextExportData): Promise<string> {
    const { prAnalysis, jiraContext, confluencePages, onyxContext, generatedScenarios, metadata } =
      data;

    return `# TAP Testing Context Summary

## Pull Request Overview
- **Title:** ${prAnalysis.title}
- **Author:** ${prAnalysis.author}
- **Branch:** ${prAnalysis.branch} → ${prAnalysis.baseBranch}
- **Files Changed:** ${prAnalysis.changedFiles.length}
- **Lines Changed:** +${prAnalysis.changedFiles.reduce((acc, file) => acc + file.additions, 0)} / -${prAnalysis.changedFiles.reduce((acc, file) => acc + file.deletions, 0)}

### Changed Files:
${prAnalysis.changedFiles
  .map(
    (file) =>
      `- **${file.status.toUpperCase()}:** \`${file.path}\` (+${file.additions}/-${file.deletions})`
  )
  .join("\n")}

## Business Context
${
  jiraContext
    ? `
**Jira Ticket:** ${jiraContext.ticket.key} - ${jiraContext.ticket.summary}
- **Type:** ${jiraContext.ticket.issueType} | **Priority:** ${jiraContext.ticket.priority}
- **Status:** ${jiraContext.ticket.status}
- **Reporter:** ${jiraContext.ticket.reporter} | **Assignee:** ${jiraContext.ticket.assignee || "Unassigned"}

${jiraContext.epic ? `**Epic:** ${jiraContext.epic.key} - ${jiraContext.epic.summary}` : ""}

${
  jiraContext.linkedIssues.length > 0
    ? `
**Linked Issues:**
${jiraContext.linkedIssues.map((issue) => `- ${issue.key}: ${issue.summary}`).join("\n")}
`
    : ""
}
`
    : "No Jira context available"
}

## Documentation Context
${
  confluencePages.length > 0
    ? `
Found ${confluencePages.length} related documentation pages:
${confluencePages.map((page) => `- **${page.title}** (${page.space}) - ${page.author}`).join("\n")}
`
    : "No related documentation found"
}

## Onyx AI Product Knowledge
${
  onyxContext
    ? `
Gathered ${onyxContext.responses.length} AI-processed insights about product context and user workflows:
${onyxContext.responses
  .map(
    (response, i) =>
      `${i + 1}. **${response.query}**
   - *AI Insight:* ${response.answer.substring(0, 150)}${response.answer.length > 150 ? "..." : ""}`
  )
  .join("\n")}
`
    : "No Onyx AI context available (not configured)"
}

## AI-Generated Test Scenarios
- **Total Scenarios:** ${generatedScenarios.length}
- **High Priority:** ${generatedScenarios.filter((s) => s.priority === "high").length}
- **Medium Priority:** ${generatedScenarios.filter((s) => s.priority === "medium").length}
- **Low Priority:** ${generatedScenarios.filter((s) => s.priority === "low").length}
- **Fully Automated:** ${generatedScenarios.filter((s) => s.automationLevel === "automated").length}
- **Semi-Automated:** ${generatedScenarios.filter((s) => s.automationLevel === "semi-automated").length}
- **Manual:** ${generatedScenarios.filter((s) => s.automationLevel === "manual").length}

### Categories:
${Object.entries(
  generatedScenarios.reduce(
    (acc, scenario) => {
      acc[scenario.category] = (acc[scenario.category] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  )
)
  .map(([category, count]) => `- **${category}:** ${count} scenarios`)
  .join("\n")}


---

*Generated by TAP ${metadata.tapVersion} on ${metadata.exportedAt}*
`;
  }

  private generateClaudeCodeInstructions(data: ContextExportData): string {
    return `# Claude Code Review Instructions

You are reviewing AI-generated test scenarios for a GitHub PR. Use this context to refine and improve the testing approach.

## Your Task
1. **Review** the generated test scenarios in \`generated-scenarios.md\`
2. **Analyze** the full context provided in the other files
3. **Refine** the scenarios by:
   - Adding missing edge cases
   - Improving test steps clarity
   - Adjusting priorities based on risk
   - Suggesting additional scenarios if needed
   - Removing redundant or low-value tests

## Available Context Files
- \`pr-analysis.json\` - Complete PR analysis with diffs and metadata
- \`jira-context.json\` - Business context from Jira ticket${data.jiraContext ? "" : " (not available for this PR)"}
- \`confluence-docs.json\` - Related documentation${data.confluencePages.length > 0 ? "" : " (none found)"}
- \`onyx-product-context.json\` - AI-processed product knowledge and user workflows${data.onyxContext ? "" : " (not available)"}
- \`generated-scenarios.json\` - Machine-readable scenarios
- \`generated-scenarios.md\` - Human-readable scenarios
- \`context-summary.md\` - Executive summary

## Key Areas to Consider
1. **Code Changes:** Focus on the ${data.prAnalysis.changedFiles.length} changed files
2. **Business Impact:** ${data.jiraContext ? `Consider Jira ticket ${data.jiraContext.ticket.key} requirements` : "No specific business context available"}
3. **Product Knowledge:** ${data.onyxContext ? `Review Onyx AI insights about user workflows and E2E scenarios` : "No AI product context available"}
4. **Risk Assessment:** Prioritize scenarios based on potential impact
5. **Test Coverage:** Ensure all critical paths are covered

## Output Format
When you're done reviewing, create a refined test scenarios JSON file named \`refined-scenarios.json\` that follows the same structure as \`generated-scenarios.json\` but with your improvements.

## Alternative: Use Claude CLI Directly
You can also use the claude CLI to further refine scenarios:

\`\`\`bash
# Use claude CLI with stdin input
cat generated-scenarios.md | claude -p "Review and improve these test scenarios, focusing on edge cases and security considerations"
\`\`\`

## Current AI Summary
${data.aiSummary}

Focus on quality and completeness - your human insight is valuable for catching edge cases and business logic that AI might miss.
`;
  }

  private generateClaudeCLIHelper(data: ContextExportData): string {
    return `#!/bin/bash

# Claude Code CLI Interactive Helper Script for TAP Test Scenario Refinement
# This script opens Claude Code in interactive mode with all the context loaded

echo "🤖 TAP Claude Code Interactive Refinement Helper"
echo "==============================================="
echo ""

# Check if claude CLI is installed
if ! command -v claude &> /dev/null; then
    echo "❌ Claude CLI not found. Install with:"
    echo "   npm install -g @anthropic-ai/claude-cli"
    echo ""
    echo "🔧 Alternative: Use Claude Code web interface"
    echo "   1. Upload all the generated files to Claude Code"
    echo "   2. Ask Claude Code to refine the test scenarios"
    exit 1
fi

echo "✅ Claude CLI found"
echo ""

# Create an interactive prompt that loads all context
cat > interactive-prompt.txt << 'EOF'
You are a senior QA engineer helping refine AI-generated test scenarios for a GitHub PR.

## Context Overview
- **PR**: ${data.prAnalysis.title}
- **Files Changed**: ${data.prAnalysis.changedFiles.length}
- **Jira**: ${data.jiraContext?.ticket.key || "None"} - ${data.jiraContext?.ticket.summary || "N/A"}
- **Generated Scenarios**: ${data.generatedScenarios.length}

## Available Files in This Directory
- \`pr-analysis.json\` - Complete PR analysis with diffs
- \`jira-context.json\` - Business context${data.jiraContext ? "" : " (not available)"}
- \`confluence-docs.json\` - Related documentation${data.confluencePages.length > 0 ? "" : " (none found)"}
- \`onyx-product-context.json\` - AI product insights${data.onyxContext ? "" : " (not available)"}
- \`generated-scenarios.json\` - Machine-readable scenarios
- \`generated-scenarios.md\` - Human-readable scenarios
- \`context-summary.md\` - Executive summary

## Your Mission
I need you to help me refine the AI-generated test scenarios. Please:
1. First, read and understand all the available context files
2. Review the generated test scenarios thoroughly 
3. Work with me interactively to improve them by discussing:
   - Missing edge cases or security considerations
   - Test step clarity and specificity
   - Priority adjustments based on risk
   - Additional scenarios we might need
   - Scenarios we can remove or combine

## Interactive Approach
Let's work together step by step. Start by reading the context files and then we'll discuss the scenarios one by one.

When we're done refining, you'll help me create a final \`refined-scenarios.json\` file.

Ready to start? Please read the context files first and give me your initial assessment.
EOF

echo "📝 Starting interactive Claude Code session..."
echo ""
echo "💡 This will open an interactive session where you can:"
echo "   - Discuss scenarios with Claude in real-time"
echo "   - Get suggestions and ask questions"
echo "   - Refine scenarios collaboratively"
echo ""
echo "📁 All context files are available in this directory"
echo "   Claude Code can read them automatically"
echo ""

# Launch Claude CLI in interactive mode with the working directory set
echo "🚀 Launching Claude Code interactive session..."
echo "   Press Ctrl+C to exit when done"
echo "   Remember to save your refined scenarios as 'refined-scenarios.json'"
echo ""

# Use claude in interactive mode with the prompt
claude --interactive < interactive-prompt.txt

echo ""
echo "📋 Post-Session Checklist:"
echo "   □ Did you create refined-scenarios.json?"
echo "   □ Does it contain valid JSON with all required fields?"
echo "   □ Are you satisfied with the scenario improvements?"
echo ""
echo "🎯 Next step (if refined-scenarios.json exists):"
echo "   tap execute-scenarios --file refined-scenarios.json"

# Clean up prompt file
rm -f interactive-prompt.txt
`;
  }

  async exportScenariosOnly(scenarios: TestScenario[], outputPath: string): Promise<void> {
    await this.writeJsonFile(outputPath, scenarios);
  }

  async loadScenariosFromFile(filePath: string): Promise<TestScenario[]> {
    try {
      const content = await import("fs/promises").then((fs) => fs.readFile(filePath, "utf-8"));
      return JSON.parse(content);
    } catch (error) {
      throw new Error(
        `Failed to load scenarios from ${filePath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
