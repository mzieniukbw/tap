import { PRAnalysis, ChangedFile } from "./github.ts";
import { TicketContext, JiraTicket, ConfluencePage } from "./atlassian.ts";

export interface TestScenario {
  id: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  category: 'functionality' | 'regression' | 'integration' | 'ui' | 'performance';
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

export interface TestGenerationRequest {
  prAnalysis: PRAnalysis;
  jiraContext?: TicketContext | null;
  confluencePages: ConfluencePage[];
  focusAreas: string[];
}

export class TestScenarioGenerator {
  
  async generate(request: TestGenerationRequest): Promise<TestScenario[]> {
    const scenarios: TestScenario[] = [];
    
    // 1. Generate scenarios based on code changes
    scenarios.push(...await this.generateCodeChangeScenarios(request.prAnalysis));
    
    // 2. Generate scenarios based on business context from Jira
    if (request.jiraContext) {
      scenarios.push(...await this.generateBusinessContextScenarios(request.jiraContext));
    }
    
    // 3. Generate scenarios based on documentation
    scenarios.push(...await this.generateDocumentationScenarios(request.confluencePages));
    
    // 4. Generate regression scenarios
    scenarios.push(...await this.generateRegressionScenarios(request.prAnalysis));
    
    // 5. Filter and prioritize based on focus areas
    const filteredScenarios = this.filterByFocusAreas(scenarios, request.focusAreas);
    
    // 6. Sort by priority and limit to reasonable number
    return this.prioritizeScenarios(filteredScenarios).slice(0, 10);
  }

  private async generateCodeChangeScenarios(prAnalysis: PRAnalysis): Promise<TestScenario[]> {
    const scenarios: TestScenario[] = [];
    
    for (const file of prAnalysis.changedFiles) {
      scenarios.push(...this.analyzeFileChanges(file, prAnalysis));
    }
    
    return scenarios;
  }

  private analyzeFileChanges(file: ChangedFile, prAnalysis: PRAnalysis): TestScenario[] {
    const scenarios: TestScenario[] = [];
    const fileName = file.path.split('/').pop() || file.path;
    
    // Analyze by file type and changes
    if (file.path.includes('auth') || file.path.includes('login')) {
      scenarios.push(this.createAuthenticationScenario(file, prAnalysis));
    }
    
    if (file.path.includes('api') || file.path.includes('endpoint')) {
      scenarios.push(this.createAPIScenario(file, prAnalysis));
    }
    
    if (file.path.includes('ui') || file.path.includes('component') || file.path.includes('.vue') || file.path.includes('.tsx')) {
      scenarios.push(this.createUIScenario(file, prAnalysis));
    }
    
    if (file.path.includes('database') || file.path.includes('migration')) {
      scenarios.push(this.createDataScenario(file, prAnalysis));
    }
    
    // Generic scenarios based on change type
    if (file.status === 'added') {
      scenarios.push(this.createNewFeatureScenario(file, prAnalysis));
    } else if (file.status === 'modified') {
      scenarios.push(this.createModificationScenario(file, prAnalysis));
    }
    
    return scenarios.filter(Boolean);
  }

  private createAuthenticationScenario(file: ChangedFile, prAnalysis: PRAnalysis): TestScenario {
    return {
      id: `auth-${file.path.replace(/[^a-zA-Z0-9]/g, '-')}`,
      title: `Authentication Flow Validation`,
      description: `Test authentication functionality after changes to ${file.path}`,
      priority: 'high',
      category: 'functionality',
      steps: [
        {
          action: "navigate",
          target: "login page",
          verification: "Login form is displayed correctly"
        },
        {
          action: "input",
          target: "email field",
          input: "test@company.com",
          verification: "Email is accepted and field shows valid state"
        },
        {
          action: "input",
          target: "password field", 
          input: "validPassword123",
          verification: "Password field accepts input and masks characters"
        },
        {
          action: "click",
          target: "login button",
          verification: "User is successfully authenticated and redirected to dashboard"
        },
        {
          action: "verify",
          verification: "Session is properly established and user remains logged in"
        }
      ],
      expectedOutcome: "User can successfully authenticate without issues",
      focusAreas: ['authentication', 'security'],
      automationLevel: 'automated',
      estimatedDuration: 5
    };
  }

  private createAPIScenario(file: ChangedFile, prAnalysis: PRAnalysis): TestScenario {
    return {
      id: `api-${file.path.replace(/[^a-zA-Z0-9]/g, '-')}`,
      title: `API Endpoint Testing`,
      description: `Validate API changes in ${file.path}`,
      priority: 'high',
      category: 'integration',
      steps: [
        {
          action: "call",
          target: "modified API endpoint",
          input: "valid request payload",
          verification: "API responds with expected status code and structure"
        },
        {
          action: "validate",
          verification: "Response data format matches schema expectations"
        },
        {
          action: "test",
          target: "error handling",
          input: "invalid request payload",
          verification: "API returns appropriate error codes and messages"
        }
      ],
      expectedOutcome: "API endpoint functions correctly with proper error handling",
      focusAreas: ['api', 'integration'],
      automationLevel: 'automated',
      estimatedDuration: 8
    };
  }

  private createUIScenario(file: ChangedFile, prAnalysis: PRAnalysis): TestScenario {
    return {
      id: `ui-${file.path.replace(/[^a-zA-Z0-9]/g, '-')}`,
      title: `UI Component Validation`,
      description: `Test user interface changes in ${file.path}`,
      priority: 'medium',
      category: 'ui',
      steps: [
        {
          action: "navigate",
          target: "affected page/component",
          verification: "Page loads without errors and displays correctly"
        },
        {
          action: "interact",
          target: "modified UI elements",
          verification: "UI elements respond correctly to user interactions"
        },
        {
          action: "verify",
          verification: "Visual layout and styling appear as expected"
        },
        {
          action: "test",
          target: "responsive behavior",
          verification: "Component works across different screen sizes"
        }
      ],
      expectedOutcome: "UI changes function correctly and maintain good user experience",
      focusAreas: ['ui', 'usability'],
      automationLevel: 'semi-automated',
      estimatedDuration: 10
    };
  }

  private createDataScenario(file: ChangedFile, prAnalysis: PRAnalysis): TestScenario {
    return {
      id: `data-${file.path.replace(/[^a-zA-Z0-9]/g, '-')}`,
      title: `Data Layer Validation`,
      description: `Test data handling changes in ${file.path}`,
      priority: 'high',
      category: 'functionality',
      steps: [
        {
          action: "create",
          target: "test data",
          verification: "Data can be successfully created with new schema/logic"
        },
        {
          action: "read",
          target: "existing data",
          verification: "Data retrieval works correctly with changes"
        },
        {
          action: "update",
          target: "test data",
          verification: "Data updates function properly"
        },
        {
          action: "verify",
          verification: "Data integrity is maintained throughout operations"
        }
      ],
      expectedOutcome: "Data operations function correctly without corruption or loss",
      focusAreas: ['data', 'persistence'],
      automationLevel: 'automated',
      estimatedDuration: 12
    };
  }

  private createNewFeatureScenario(file: ChangedFile, prAnalysis: PRAnalysis): TestScenario {
    return {
      id: `new-${file.path.replace(/[^a-zA-Z0-9]/g, '-')}`,
      title: `New Feature Validation`,
      description: `Test newly added functionality in ${file.path}`,
      priority: 'high',
      category: 'functionality',
      steps: [
        {
          action: "access",
          target: "new feature",
          verification: "New feature is accessible and discoverable"
        },
        {
          action: "test",
          target: "core functionality",
          verification: "Primary use case works as intended"
        },
        {
          action: "test",
          target: "edge cases",
          verification: "Feature handles boundary conditions appropriately"
        },
        {
          action: "verify",
          verification: "Feature integrates well with existing functionality"
        }
      ],
      expectedOutcome: "New feature works correctly and doesn't break existing functionality",
      focusAreas: ['new-feature', 'integration'],
      automationLevel: 'manual',
      estimatedDuration: 15
    };
  }

  private createModificationScenario(file: ChangedFile, prAnalysis: PRAnalysis): TestScenario {
    return {
      id: `mod-${file.path.replace(/[^a-zA-Z0-9]/g, '-')}`,
      title: `Modified Functionality Test`,
      description: `Validate changes to existing functionality in ${file.path}`,
      priority: 'medium',
      category: 'functionality',
      steps: [
        {
          action: "test",
          target: "existing workflow",
          verification: "Previously working functionality still operates correctly"
        },
        {
          action: "validate",
          target: "modifications",
          verification: "Changes work as intended"
        },
        {
          action: "regression test",
          verification: "No unintended side effects in related areas"
        }
      ],
      expectedOutcome: "Modified functionality works correctly without breaking existing features",
      focusAreas: ['regression', 'modification'],
      automationLevel: 'semi-automated',
      estimatedDuration: 8
    };
  }

  private async generateBusinessContextScenarios(context: TicketContext): Promise<TestScenario[]> {
    const scenarios: TestScenario[] = [];
    
    // Generate scenarios based on ticket type
    const ticket = context.ticket;
    
    if (ticket.issueType.toLowerCase().includes('bug')) {
      scenarios.push(this.createBugFixScenario(ticket));
    }
    
    if (ticket.issueType.toLowerCase().includes('story') || ticket.issueType.toLowerCase().includes('feature')) {
      scenarios.push(this.createUserStoryScenario(ticket));
    }
    
    if (ticket.issueType.toLowerCase().includes('task')) {
      scenarios.push(this.createTaskScenario(ticket));
    }
    
    // Add epic-level scenarios if available
    if (context.epic) {
      scenarios.push(this.createEpicValidationScenario(context.epic, ticket));
    }
    
    return scenarios;
  }

  private createBugFixScenario(ticket: JiraTicket): TestScenario {
    return {
      id: `bugfix-${ticket.key}`,
      title: `Bug Fix Validation - ${ticket.key}`,
      description: `Verify that ${ticket.summary} has been resolved`,
      priority: 'high',
      category: 'regression',
      steps: [
        {
          action: "reproduce",
          target: "original bug scenario",
          verification: "Previously failing scenario now works correctly"
        },
        {
          action: "test",
          target: "related functionality",
          verification: "Fix doesn't introduce regressions in related areas"
        },
        {
          action: "verify",
          verification: "All acceptance criteria from ticket are met"
        }
      ],
      expectedOutcome: `Bug ${ticket.key} is resolved without introducing new issues`,
      focusAreas: ['bug-fix', 'regression'],
      automationLevel: 'semi-automated',
      estimatedDuration: 10
    };
  }

  private createUserStoryScenario(ticket: JiraTicket): TestScenario {
    return {
      id: `story-${ticket.key}`,
      title: `User Story Validation - ${ticket.key}`,
      description: `Test user story: ${ticket.summary}`,
      priority: 'high',
      category: 'functionality',
      steps: [
        {
          action: "execute",
          target: "primary user journey",
          verification: "User can complete the intended workflow"
        },
        {
          action: "validate",
          target: "acceptance criteria",
          verification: "All story requirements are met"
        },
        {
          action: "test",
          target: "user experience",
          verification: "Workflow is intuitive and user-friendly"
        }
      ],
      expectedOutcome: `User story ${ticket.key} delivers intended value to users`,
      focusAreas: ['user-story', 'acceptance'],
      automationLevel: 'manual',
      estimatedDuration: 20
    };
  }

  private createTaskScenario(ticket: JiraTicket): TestScenario {
    return {
      id: `task-${ticket.key}`,
      title: `Task Validation - ${ticket.key}`,
      description: `Verify task completion: ${ticket.summary}`,
      priority: 'medium',
      category: 'functionality',
      steps: [
        {
          action: "verify",
          target: "task deliverables",
          verification: "All task outputs are present and functional"
        },
        {
          action: "test",
          target: "integration points",
          verification: "Task integrates properly with existing system"
        }
      ],
      expectedOutcome: `Task ${ticket.key} is completed successfully`,
      focusAreas: ['task', 'integration'],
      automationLevel: 'semi-automated',
      estimatedDuration: 12
    };
  }

  private createEpicValidationScenario(epic: JiraTicket, ticket: JiraTicket): TestScenario {
    return {
      id: `epic-${epic.key}-${ticket.key}`,
      title: `Epic Integration Test - ${epic.key}`,
      description: `Validate ${ticket.key} contributes correctly to epic ${epic.summary}`,
      priority: 'medium',
      category: 'integration',
      steps: [
        {
          action: "test",
          target: "end-to-end epic workflow",
          verification: "Complete epic user journey works with new changes"
        },
        {
          action: "validate",
          target: "epic acceptance criteria",
          verification: "Changes support overall epic goals"
        }
      ],
      expectedOutcome: `Changes support the larger epic ${epic.key} objectives`,
      focusAreas: ['epic', 'integration'],
      automationLevel: 'manual',
      estimatedDuration: 25
    };
  }

  private async generateDocumentationScenarios(pages: ConfluencePage[]): Promise<TestScenario[]> {
    const scenarios: TestScenario[] = [];
    
    for (const page of pages.slice(0, 3)) { // Limit to top 3 most relevant pages
      scenarios.push(this.createDocumentationBasedScenario(page));
    }
    
    return scenarios;
  }

  private createDocumentationBasedScenario(page: ConfluencePage): TestScenario {
    return {
      id: `doc-${page.id}`,
      title: `Documentation Scenario - ${page.title}`,
      description: `Test functionality based on ${page.title} documentation`,
      priority: 'low',
      category: 'functionality',
      steps: [
        {
          action: "follow",
          target: "documented workflow",
          verification: "Workflow described in documentation functions correctly"
        },
        {
          action: "verify",
          target: "documentation accuracy",
          verification: "Current implementation matches documented behavior"
        }
      ],
      expectedOutcome: `Implementation matches documentation in ${page.title}`,
      focusAreas: ['documentation', 'workflow'],
      automationLevel: 'manual',
      estimatedDuration: 15
    };
  }

  private async generateRegressionScenarios(prAnalysis: PRAnalysis): Promise<TestScenario[]> {
    const scenarios: TestScenario[] = [];
    
    // Generate regression tests based on critical areas
    scenarios.push({
      id: 'regression-core',
      title: 'Core Functionality Regression Test',
      description: 'Ensure core application functionality remains intact',
      priority: 'high',
      category: 'regression',
      steps: [
        {
          action: "test",
          target: "critical user paths",
          verification: "All essential workflows continue to function"
        },
        {
          action: "verify",
          target: "data integrity",
          verification: "No data corruption or loss occurs"
        }
      ],
      expectedOutcome: 'Core functionality remains stable after changes',
      focusAreas: ['regression', 'stability'],
      automationLevel: 'automated',
      estimatedDuration: 15
    });
    
    return scenarios;
  }

  private filterByFocusAreas(scenarios: TestScenario[], focusAreas: string[]): TestScenario[] {
    if (focusAreas.length === 0) {
      return scenarios;
    }
    
    return scenarios.filter(scenario => 
      scenario.focusAreas.some(area => 
        focusAreas.some(focus => 
          area.toLowerCase().includes(focus.toLowerCase()) ||
          focus.toLowerCase().includes(area.toLowerCase())
        )
      )
    );
  }

  private prioritizeScenarios(scenarios: TestScenario[]): TestScenario[] {
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    
    return scenarios.sort((a, b) => {
      // First by priority
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) return priorityDiff;
      
      // Then by automation level (prefer automated)
      const automationOrder = { automated: 3, 'semi-automated': 2, manual: 1 };
      const automationDiff = automationOrder[b.automationLevel] - automationOrder[a.automationLevel];
      if (automationDiff !== 0) return automationDiff;
      
      // Finally by estimated duration (prefer shorter)
      return a.estimatedDuration - b.estimatedDuration;
    });
  }
}