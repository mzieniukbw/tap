import {ClaudeCLI, ClaudeCLIWrapper} from './claude-cli';
import {PRAnalysis} from './github';
import {ConfluencePage, TicketContext} from './atlassian';

export interface TestScenario {
  id: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  category: 'functionality' | 'regression' | 'integration' | 'ui' | 'performance' | 'security';
  steps: TestStep[];
  expectedOutcome: string;
  focusAreas: string[];
  automationLevel: 'manual' | 'semi-automated' | 'automated';
  estimatedDuration: number; // minutes
}

export interface TestStep {
  action: string;
  target?: string;
  input?: string;
  verification: string;
}

export interface AITestGenerationContext {
  prAnalysis: PRAnalysis;
  jiraContext?: TicketContext | null;
  confluencePages: ConfluencePage[];
}

export class AITestScenarioGenerator {
  private claudeCLI: ClaudeCLI;

  constructor(claudeCLI?: ClaudeCLI) {
    this.claudeCLI = claudeCLI || new ClaudeCLIWrapper();
  }

  async generateScenarios(context: AITestGenerationContext): Promise<TestScenario[]> {
    const contextPrompt = this.buildGenerationPrompt(context);
    const taskPrompt = 'Generate comprehensive test scenarios for this GitHub PR based on the provided context';
    
    try {
      const claudeResponse = await this.claudeCLI.generateResponse(contextPrompt, taskPrompt);

      // Parse the AI response into TestScenario objects
      return this.parseAIResponse(claudeResponse, context);
    } catch (error) {
      console.error('Error calling Claude CLI:', error);
      throw new Error(`Failed to generate AI test scenarios: ${error instanceof Error ? error.message : String(error)}`);
    }
  }


  private buildGenerationPrompt(context: AITestGenerationContext): string {
    const { prAnalysis, jiraContext, confluencePages } = context;
    
    let prompt = `You are an expert software testing assistant. Generate comprehensive test scenarios for a GitHub PR based on the provided context.

## Pull Request Analysis
**Title:** ${prAnalysis.title}
**Description:** ${prAnalysis.description || 'No description provided'}
**Branch:** ${prAnalysis.branch} -> ${prAnalysis.baseBranch}
**Author:** ${prAnalysis.author}
**Labels:** [${prAnalysis.labels.join(', ')}]

### Changed Files (${prAnalysis.changedFiles.length} files):
${prAnalysis.changedFiles.map(file => 
  `- **${file.status.toUpperCase()}**: \`${file.path}\` (+${file.additions}/-${file.deletions} lines)`
).join('\n')}

### Commit Messages:
${prAnalysis.commits.map((commit, i) => `${i + 1}. ${commit.message}`).join('\n')}
`;

    // Add Jira context if available
    if (jiraContext) {
      prompt += `

## Jira Ticket Context
**Ticket:** ${jiraContext.ticket.key} - ${jiraContext.ticket.summary}
**Type:** ${jiraContext.ticket.issueType} | **Priority:** ${jiraContext.ticket.priority} | **Status:** ${jiraContext.ticket.status}
**Description:** ${jiraContext.ticket.description || 'No description'}
**Reporter:** ${jiraContext.ticket.reporter} | **Assignee:** ${jiraContext.ticket.assignee || 'Unassigned'}
**Labels:** [${jiraContext.ticket.labels.join(', ')}]
**Components:** [${jiraContext.ticket.components.join(', ')}]

${jiraContext.epic ? `**Epic:** ${jiraContext.epic.key} - ${jiraContext.epic.summary}` : ''}

${jiraContext.linkedIssues.length > 0 ? `
**Linked Issues:**
${jiraContext.linkedIssues.map(issue => `- ${issue.key}: ${issue.summary}`).join('\n')}
` : ''}`;
    }

    // Add Confluence documentation context
    if (confluencePages.length > 0) {
      prompt += `

## Related Documentation
${confluencePages.map(page => `
**${page.title}** (${page.space})
- Author: ${page.author} | Created: ${page.created} | Updated: ${page.updated}
- Content Preview: ${page.content.slice(0, 200)}${page.content.length > 200 ? '...' : ''}
`).join('')}`;
    }


    prompt += `

## Task: Generate Test Scenarios

**CRITICAL: You must respond with ONLY valid JSON. No additional text, explanation, or markdown formatting outside the JSON.**

Based on the above context, generate 5-8 comprehensive test scenarios as a JSON array with the exact structure shown below:

\`\`\`json
[
  {
    "id": "unique-scenario-id",
    "title": "Clear, descriptive scenario title",
    "description": "Detailed description of what this scenario tests and why it's important",
    "priority": "high",
    "category": "functionality",
    "steps": [
      {
        "action": "navigate",
        "target": "specific element, page, or endpoint",
        "input": "data to input (if applicable)",
        "verification": "what to verify after this step"
      }
    ],
    "expectedOutcome": "clear description of expected result",
    "focusAreas": ["relevant", "focus", "areas"],
    "automationLevel": "manual",
    "estimatedDuration": 15
  }
]
\`\`\`

## Field Requirements:
- **id**: Unique string identifier (lowercase with dashes)
- **title**: Clear, concise test scenario name
- **description**: 2-3 sentences explaining what this tests and why
- **priority**: Must be exactly "high", "medium", or "low" 
- **category**: Must be exactly one of: "functionality", "regression", "integration", "ui", "performance", "security"
- **steps**: Array of test steps (minimum 3 steps)
  - **action**: Must be one of: "navigate", "click", "input", "verify", "call", "test"
  - **target**: Specific UI element, page, API endpoint, or file path
  - **input**: Data/values to use (optional - use null if not needed)
  - **verification**: What to check/verify after this step
- **expectedOutcome**: Clear description of expected result
- **focusAreas**: Array of strings (relevant technical areas)
- **automationLevel**: Must be exactly "manual", "semi-automated", or "automated"
- **estimatedDuration**: Number (minutes as integer)

## Content Requirements:
1. **Be Specific**: Use actual file paths, component names, and technical details from the context
2. **Be Intelligent**: Analyze the actual code changes and business context - don't create generic tests
3. **Cover Edge Cases**: Consider what could go wrong with these specific changes
4. **Prioritize Well**: Mark critical functionality as high priority, nice-to-have as low
5. **Business Context**: Incorporate understanding from Jira tickets and documentation
6. **Realistic Steps**: Create actionable, specific test steps that can be executed
7. **Appropriate Duration**: Estimate realistic time (5-60 minutes per scenario)

**RESPONSE FORMAT: Return ONLY the JSON array. No markdown code blocks, no explanatory text, no additional formatting.**`;

    return prompt;
  }

  private parseAIResponse(aiResponse: string, context: AITestGenerationContext): TestScenario[] {
    try {
      let jsonStr: string;

      // Try to extract JSON from markdown code blocks first
      const jsonMatch = aiResponse.match(/```json\s*\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      } else {
        // If no code blocks, try to parse the response directly as JSON
        jsonStr = aiResponse.trim();
      }

      const scenarios: TestScenario[] = JSON.parse(jsonStr);

      // Validate that we got an array
      if (!Array.isArray(scenarios)) {
        throw new Error('Expected JSON array of test scenarios');
      }

      // Validate and enhance the scenarios
      return scenarios.map(scenario => this.validateAndEnhanceScenario(scenario, context));
    } catch (error) {
      console.error('Failed to parse AI response:', aiResponse.substring(0, 500) + '...');
      throw new Error(`Failed to parse AI-generated scenarios: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private validateAndEnhanceScenario(scenario: TestScenario, context: AITestGenerationContext): TestScenario {
    // Ensure all required fields are present and valid
    const validPriorities = ['high', 'medium', 'low'];
    const validCategories = ['functionality', 'regression', 'integration', 'ui', 'performance', 'security'];
    const validAutomationLevels = ['manual', 'semi-automated', 'automated'];

    return {
      ...scenario,
      id: scenario.id || `generated-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      priority: validPriorities.includes(scenario.priority) ? scenario.priority : 'medium',
      category: validCategories.includes(scenario.category) ? scenario.category : 'functionality',
      automationLevel: validAutomationLevels.includes(scenario.automationLevel) ? scenario.automationLevel : 'manual',
      estimatedDuration: scenario.estimatedDuration || 15,
      focusAreas: scenario.focusAreas || [],
      steps: scenario.steps.map(step => ({
        ...step,
        action: step.action || 'test',
        verification: step.verification || 'Verify step completed successfully'
      }))
    };
  }

  async generateTestSummary(scenarios: TestScenario[], context: AITestGenerationContext): Promise<string> {
    const summaryContext = `## Generated Test Scenarios:
${scenarios.map((scenario, i) => `
${i + 1}. **${scenario.title}** (${scenario.priority} priority, ${scenario.category})
   - ${scenario.description}
   - Duration: ${scenario.estimatedDuration} minutes
   - Automation: ${scenario.automationLevel}
   - Steps: ${scenario.steps.length}
`).join('')}

## Context:
- **PR:** ${context.prAnalysis.title}
- **Files Changed:** ${context.prAnalysis.changedFiles.length}
- **Jira:** ${context.jiraContext?.ticket.key || 'None'} - ${context.jiraContext?.ticket.summary || 'N/A'}`;

    const taskPrompt = 'Generate a concise 2-3 paragraph executive summary for developers and QA team explaining what these test scenarios cover, key risks, and recommended testing priorities';

    try {
      return await this.claudeCLI.generateResponse(summaryContext, taskPrompt);
    } catch (error) {
      console.error('Error generating test summary:', error);
      return `Generated ${scenarios.length} test scenarios covering ${scenarios.filter(s => s.priority === 'high').length} high-priority, ${scenarios.filter(s => s.priority === 'medium').length} medium-priority, and ${scenarios.filter(s => s.priority === 'low').length} low-priority test cases.`;
    }
  }
}