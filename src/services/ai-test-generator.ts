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

Based on the above context, generate 5-8 comprehensive test scenarios in the following JSON format:

\`\`\`json
[
  {
    "id": "unique-scenario-id",
    "title": "Clear, descriptive scenario title",
    "description": "Detailed description of what this scenario tests and why it's important",
    "priority": "high|medium|low",
    "category": "functionality|regression|integration|ui|performance|security",
    "steps": [
      {
        "action": "navigate|click|input|verify|call|test",
        "target": "specific element, page, or endpoint",
        "input": "data to input (if applicable)", 
        "verification": "what to verify after this step"
      }
    ],
    "expectedOutcome": "clear description of expected result",
    "focusAreas": ["relevant", "focus", "areas"],
    "automationLevel": "manual|semi-automated|automated",
    "estimatedDuration": 15
  }
]
\`\`\`

## Requirements:
1. **Be Specific**: Use actual file paths, component names, and technical details from the context
2. **Be Intelligent**: Don't just create generic tests - analyze the actual code changes and business context
3. **Cover Edge Cases**: Think about what could go wrong with these specific changes
4. **Prioritize Well**: Mark critical functionality as high priority, nice-to-have as low
5. **Business Context**: Incorporate understanding from Jira tickets and documentation
6. **Realistic Steps**: Create actionable, specific test steps that a human or automation tool could follow
7. **Appropriate Duration**: Estimate realistic time (in minutes) for each scenario

Focus on quality over quantity - create scenarios that are truly valuable for testing this specific PR.`;

    return prompt;
  }

  private parseAIResponse(aiResponse: string, context: AITestGenerationContext): TestScenario[] {
    try {
      // Extract JSON from the AI response (it should be wrapped in ```json```)
      const jsonMatch = aiResponse.match(/```json\n([\s\S]*?)\n```/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }

      const jsonStr = jsonMatch[1];
      const scenarios: TestScenario[] = JSON.parse(jsonStr);

      // Validate and enhance the scenarios
      return scenarios.map(scenario => this.validateAndEnhanceScenario(scenario, context));
    } catch (error) {
      console.error('Failed to parse AI response:', aiResponse);
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
      id: scenario.id || `generated-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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