import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { PRAnalysis } from './github';
import { TicketContext, ConfluencePage } from './atlassian';
import { TestScenario } from './test-generator';

export interface ContextExportData {
  prAnalysis: PRAnalysis;
  jiraContext?: TicketContext | null;
  confluencePages: ConfluencePage[];
  generatedScenarios: TestScenario[];
  aiSummary: string;
  metadata: {
    exportedAt: string;
    tapVersion: string;
    totalScenarios: number;
    focusAreas: string[];
  };
}

export class ContextExporter {
  
  async exportFullContext(
    data: ContextExportData, 
    outputDir: string = './tap-context'
  ): Promise<string[]> {
    // Ensure output directory exists
    if (!existsSync(outputDir)) {
      await mkdir(outputDir, { recursive: true });
    }

    const exportedFiles: string[] = [];

    // 1. Export PR Analysis
    const prAnalysisPath = join(outputDir, 'pr-analysis.json');
    await this.writeJsonFile(prAnalysisPath, data.prAnalysis);
    exportedFiles.push(prAnalysisPath);

    // 2. Export Jira Context
    if (data.jiraContext) {
      const jiraContextPath = join(outputDir, 'jira-context.json');
      await this.writeJsonFile(jiraContextPath, data.jiraContext);
      exportedFiles.push(jiraContextPath);
    }

    // 3. Export Confluence Documentation
    if (data.confluencePages.length > 0) {
      const confluenceDocsPath = join(outputDir, 'confluence-docs.json');
      await this.writeJsonFile(confluenceDocsPath, data.confluencePages);
      exportedFiles.push(confluenceDocsPath);
    }

    // 4. Export Generated Scenarios as JSON
    const scenariosJsonPath = join(outputDir, 'generated-scenarios.json');
    await this.writeJsonFile(scenariosJsonPath, data.generatedScenarios);
    exportedFiles.push(scenariosJsonPath);

    // 5. Export Generated Scenarios as Human-Readable Markdown
    const scenariosMdPath = join(outputDir, 'generated-scenarios.md');
    const scenariosMarkdown = await this.generateScenariosMarkdown(data);
    await this.writeTextFile(scenariosMdPath, scenariosMarkdown);
    exportedFiles.push(scenariosMdPath);

    // 6. Export Context Summary for Claude Code
    const contextSummaryPath = join(outputDir, 'context-summary.md');
    const contextSummary = await this.generateContextSummary(data);
    await this.writeTextFile(contextSummaryPath, contextSummary);
    exportedFiles.push(contextSummaryPath);

    // 7. Export Claude Code Instructions
    const instructionsPath = join(outputDir, 'claude-code-instructions.md');
    const instructions = this.generateClaudeCodeInstructions(data);
    await this.writeTextFile(instructionsPath, instructions);
    exportedFiles.push(instructionsPath);

    // 8. Export Claude CLI Helper Script
    const helperScriptPath = join(outputDir, 'claude-refine.sh');
    const helperScript = this.generateClaudeCLIHelper(data);
    await this.writeTextFile(helperScriptPath, helperScript);
    exportedFiles.push(helperScriptPath);

    // Make the helper script executable
    try {
      await import('fs/promises').then(fs => fs.chmod(helperScriptPath, '755'));
    } catch (error) {
      console.warn(`Could not make ${helperScriptPath} executable:`, error);
    }

    return exportedFiles;
  }

  private async writeJsonFile(filePath: string, data: any): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  private async writeTextFile(filePath: string, content: string): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content, 'utf-8');
  }

  private async generateScenariosMarkdown(data: ContextExportData): Promise<string> {
    const { generatedScenarios, prAnalysis, jiraContext } = data;

    let markdown = `# AI-Generated Test Scenarios

**Generated for PR:** ${prAnalysis.title}  
**Jira Ticket:** ${jiraContext?.ticket.key || 'None'} - ${jiraContext?.ticket.summary || 'N/A'}  
**Generated at:** ${data.metadata.exportedAt}  
**Total Scenarios:** ${generatedScenarios.length}

## AI Summary
${data.aiSummary}

---

## Test Scenarios

`;

    generatedScenarios.forEach((scenario, index) => {
      markdown += `### ${index + 1}. ${scenario.title}

**Priority:** ${scenario.priority.toUpperCase()} | **Category:** ${scenario.category} | **Duration:** ${scenario.estimatedDuration} min | **Automation:** ${scenario.automationLevel}

**Description:** ${scenario.description}

**Focus Areas:** ${scenario.focusAreas.join(', ')}

**Test Steps:**
${scenario.steps.map((step, stepIndex) => 
  `${stepIndex + 1}. **${step.action.charAt(0).toUpperCase() + step.action.slice(1)}** ${step.target ? `"${step.target}"` : ''}${step.input ? ` with "${step.input}"` : ''}
   - *Verify:* ${step.verification}`
).join('\n')}

**Expected Outcome:** ${scenario.expectedOutcome}

---

`;
    });

    return markdown;
  }

  private async generateContextSummary(data: ContextExportData): Promise<string> {
    const { prAnalysis, jiraContext, confluencePages, generatedScenarios, metadata } = data;

    return `# TAP Testing Context Summary

## Pull Request Overview
- **Title:** ${prAnalysis.title}
- **Author:** ${prAnalysis.author}
- **Branch:** ${prAnalysis.branch} → ${prAnalysis.baseBranch}
- **Files Changed:** ${prAnalysis.changedFiles.length}
- **Lines Changed:** +${prAnalysis.changedFiles.reduce((acc, file) => acc + file.additions, 0)} / -${prAnalysis.changedFiles.reduce((acc, file) => acc + file.deletions, 0)}

### Changed Files:
${prAnalysis.changedFiles.map(file => 
  `- **${file.status.toUpperCase()}:** \`${file.path}\` (+${file.additions}/-${file.deletions})`
).join('\n')}

## Business Context
${jiraContext ? `
**Jira Ticket:** ${jiraContext.ticket.key} - ${jiraContext.ticket.summary}
- **Type:** ${jiraContext.ticket.issueType} | **Priority:** ${jiraContext.ticket.priority}
- **Status:** ${jiraContext.ticket.status}
- **Reporter:** ${jiraContext.ticket.reporter} | **Assignee:** ${jiraContext.ticket.assignee || 'Unassigned'}

${jiraContext.epic ? `**Epic:** ${jiraContext.epic.key} - ${jiraContext.epic.summary}` : ''}

${jiraContext.linkedIssues.length > 0 ? `
**Linked Issues:**
${jiraContext.linkedIssues.map(issue => `- ${issue.key}: ${issue.summary}`).join('\n')}
` : ''}
` : 'No Jira context available'}

## Documentation Context
${confluencePages.length > 0 ? `
Found ${confluencePages.length} related documentation pages:
${confluencePages.map(page => `- **${page.title}** (${page.space}) - ${page.author}`).join('\n')}
` : 'No related documentation found'}

## AI-Generated Test Scenarios
- **Total Scenarios:** ${generatedScenarios.length}
- **High Priority:** ${generatedScenarios.filter(s => s.priority === 'high').length}
- **Medium Priority:** ${generatedScenarios.filter(s => s.priority === 'medium').length}
- **Low Priority:** ${generatedScenarios.filter(s => s.priority === 'low').length}
- **Fully Automated:** ${generatedScenarios.filter(s => s.automationLevel === 'automated').length}
- **Semi-Automated:** ${generatedScenarios.filter(s => s.automationLevel === 'semi-automated').length}
- **Manual:** ${generatedScenarios.filter(s => s.automationLevel === 'manual').length}

### Categories:
${Object.entries(
  generatedScenarios.reduce((acc, scenario) => {
    acc[scenario.category] = (acc[scenario.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>)
).map(([category, count]) => `- **${category}:** ${count} scenarios`).join('\n')}

## Focus Areas
${metadata.focusAreas.length > 0 ? metadata.focusAreas.join(', ') : 'No specific focus areas'}

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
- \`jira-context.json\` - Business context from Jira ticket${data.jiraContext ? '' : ' (not available for this PR)'}
- \`confluence-docs.json\` - Related documentation${data.confluencePages.length > 0 ? '' : ' (none found)'}
- \`generated-scenarios.json\` - Machine-readable scenarios
- \`generated-scenarios.md\` - Human-readable scenarios
- \`context-summary.md\` - Executive summary

## Key Areas to Consider
1. **Code Changes:** Focus on the ${data.prAnalysis.changedFiles.length} changed files
2. **Business Impact:** ${data.jiraContext ? `Consider Jira ticket ${data.jiraContext.ticket.key} requirements` : 'No specific business context available'}
3. **Risk Assessment:** Prioritize scenarios based on potential impact
4. **Test Coverage:** Ensure all critical paths are covered

## Output Format
When you're done reviewing, create a refined test scenarios JSON file named \`refined-scenarios.json\` that follows the same structure as \`generated-scenarios.json\` but with your improvements.

## Alternative: Use Claude CLI Directly
You can also use the claude CLI to further refine scenarios:

\`\`\`bash
# Create a refinement prompt and use claude CLI
echo "Review and improve these test scenarios, focusing on edge cases and security..." > refinement-prompt.txt
claude --file refinement-prompt.txt --file generated-scenarios.md
\`\`\`

## Current AI Summary
${data.aiSummary}

Focus on quality and completeness - your human insight is valuable for catching edge cases and business logic that AI might miss.
`;
  }

  private generateClaudeCLIHelper(data: ContextExportData): string {
    return `#!/bin/bash

# Claude CLI Helper Script for TAP Test Scenario Refinement
# This script helps you refine test scenarios using the claude CLI

echo "🤖 TAP Claude CLI Refinement Helper"
echo "=================================="
echo ""

# Check if claude CLI is installed
if ! command -v claude &> /dev/null; then
    echo "❌ Claude CLI not found. Install with:"
    echo "   npm install -g @anthropic-ai/claude-cli"
    exit 1
fi

echo "✅ Claude CLI found"
echo ""

# Create refinement prompt
cat > refinement-prompt.txt << 'EOF'
You are a senior QA engineer reviewing AI-generated test scenarios for a GitHub PR.

## Context Summary
- **PR**: ${data.prAnalysis.title}
- **Files Changed**: ${data.prAnalysis.changedFiles.length}
- **Jira**: ${data.jiraContext?.ticket.key || 'None'} - ${data.jiraContext?.ticket.summary || 'N/A'}

## Your Task
Review the test scenarios below and improve them by:
1. Adding missing edge cases and security considerations
2. Improving test step clarity and specificity
3. Adjusting priorities based on risk assessment
4. Adding or removing scenarios as needed
5. Ensuring comprehensive coverage of the code changes

## Requirements for Output
- Return ONLY a valid JSON array of test scenarios
- Follow the exact same structure as the input scenarios
- Each scenario must have: id, title, description, priority, category, steps, expectedOutcome, focusAreas, automationLevel, estimatedDuration
- Be specific and actionable in your improvements

Please review and refine these test scenarios:
EOF

echo "📝 Created refinement prompt"
echo ""

# Run claude CLI with the prompt and scenarios
echo "🚀 Running Claude CLI refinement..."
echo "   This may take a few moments..."
echo ""

claude --file refinement-prompt.txt --file generated-scenarios.md --model haiku > refined-scenarios-raw.txt

if [ $? -eq 0 ]; then
    echo "✅ Claude CLI completed successfully"
    echo ""
    
    # Try to extract JSON from the response
    echo "🔍 Extracting JSON from response..."
    
    # Look for JSON array in the response
    sed -n '/\\[/,/\\]/p' refined-scenarios-raw.txt > refined-scenarios.json
    
    if [ -s refined-scenarios.json ]; then
        # Validate JSON
        if python3 -m json.tool refined-scenarios.json >/dev/null 2>&1; then
            echo "✅ Refined scenarios saved to refined-scenarios.json"
            echo ""
            echo "📊 Summary:"
            echo "   Original scenarios: ${data.generatedScenarios.length}"
            echo "   Refined scenarios: $(python3 -c 'import json; print(len(json.load(open("refined-scenarios.json"))))' 2>/dev/null || echo 'Unknown')"
            echo ""
            echo "🎯 Next step:"
            echo "   bun run start execute-scenarios --file refined-scenarios.json"
        else
            echo "⚠️  Generated JSON is invalid. Check refined-scenarios-raw.txt for the raw response."
            echo "   You may need to manually extract the JSON array."
        fi
    else
        echo "⚠️  No JSON array found in response. Check refined-scenarios-raw.txt"
        echo "   You may need to re-run with a different prompt."
    fi
else
    echo "❌ Claude CLI failed. Check your authentication and try again."
    echo "   Make sure you have run: claude auth"
fi

echo ""
echo "📁 Files generated:"
echo "   - refinement-prompt.txt (the prompt used)"
echo "   - refined-scenarios-raw.txt (raw Claude response)"
if [ -f refined-scenarios.json ]; then
    echo "   - refined-scenarios.json (ready for execution)"
fi

# Clean up prompt file
rm -f refinement-prompt.txt

echo ""
echo "🔧 Troubleshooting:"
echo "   - If JSON extraction failed, manually copy the JSON array from refined-scenarios-raw.txt"
echo "   - Make sure claude CLI is authenticated: claude auth"
echo "   - Try a different model: edit this script and change --model haiku to --model sonnet"
`;
  }

  async exportScenariosOnly(scenarios: TestScenario[], outputPath: string): Promise<void> {
    await this.writeJsonFile(outputPath, scenarios);
  }

  async loadScenariosFromFile(filePath: string): Promise<TestScenario[]> {
    try {
      const content = await import('fs/promises').then(fs => fs.readFile(filePath, 'utf-8'));
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to load scenarios from ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}