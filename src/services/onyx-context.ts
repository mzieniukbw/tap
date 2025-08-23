import { ConfigService, TapConfig } from './config';
import { PRAnalysis } from './github';
import { TicketContext } from './atlassian';

export interface OnyxQuery {
  query: string;
  context: string;
}

export interface OnyxResponse {
  query: string;
  answer: string;
  timestamp: string;
}

export interface OnyxContext {
  queries: OnyxQuery[];
  responses: OnyxResponse[];
  metadata: {
    totalQueries: number;
    generatedAt: string;
    prNumber: number;
  };
}

export class OnyxContextService {
  private configService: ConfigService;
  private config: TapConfig | null = null;

  constructor() {
    this.configService = ConfigService.getInstance();
  }

  private async getConfig(): Promise<TapConfig> {
    if (!this.config) {
      this.config = await this.configService.getConfig();
    }
    return this.config;
  }

  async gatherProductContext(
    prAnalysis: PRAnalysis,
    jiraContext: TicketContext | null,
    options: { verbose?: boolean } = {}
  ): Promise<OnyxContext | null> {
    const config = await this.getConfig();
    
    // Skip if Onyx is not configured
    if (!config.onyx?.apiKey) {
      if (options.verbose) {
        console.log('Onyx AI not configured, skipping product context gathering');
      }
      return null;
    }

    const { verbose } = options;
    const queries = this.generateContextQueries(prAnalysis, jiraContext);
    const responses: OnyxResponse[] = [];

    for (const queryObj of queries) {
      try {
        if (verbose) {
          console.log(`  Querying Onyx AI: ${queryObj.query}`);
        }

        const response = await this.queryOnyxAI(queryObj, config.onyx.baseUrl, config.onyx.apiKey);
        responses.push({
          query: queryObj.query,
          answer: response,
          timestamp: new Date().toISOString()
        });

        // Add small delay between queries to be respectful
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.warn(`Failed to query Onyx AI for: ${queryObj.query}`, error);
        // Continue with other queries even if one fails
      }
    }

    return {
      queries,
      responses,
      metadata: {
        totalQueries: queries.length,
        generatedAt: new Date().toISOString(),
        prNumber: prAnalysis.number
      }
    };
  }

  private generateContextQueries(
    prAnalysis: PRAnalysis,
    jiraContext: TicketContext | null
  ): OnyxQuery[] {
    const queries: OnyxQuery[] = [];
    
    // Extract component/feature names from changed files
    const changedComponents = this.extractComponentNames(prAnalysis.changedFiles);
    const contextInfo = this.buildContextInfo(prAnalysis, jiraContext);

    // Query 1: User workflows involving changed components
    if (changedComponents.length > 0) {
      queries.push({
        query: `What are the main user workflows and E2E scenarios that involve these components: ${changedComponents.join(', ')}? Focus on how users interact with these features.`,
        context: contextInfo
      });
    }

    // Query 2: Testing considerations for the feature area
    const featureArea = jiraContext?.ticket.summary || prAnalysis.title;
    queries.push({
      query: `What should QA focus on when testing changes to: "${featureArea}"? What are common edge cases and user scenarios to verify?`,
      context: contextInfo
    });

    // Query 3: Integration points and dependencies
    if (changedComponents.length > 0) {
      queries.push({
        query: `What other features or systems integrate with ${changedComponents.join(', ')}? What should be tested to ensure nothing breaks?`,
        context: contextInfo
      });
    }

    // Query 4: User experience considerations
    queries.push({
      query: `From a user experience perspective, what are the most critical paths to test when changes are made to: ${featureArea}?`,
      context: contextInfo
    });

    return queries;
  }

  private extractComponentNames(changedFiles: Array<{path: string; status: string}>): string[] {
    const components = new Set<string>();
    
    changedFiles.forEach(file => {
      // Extract meaningful component names from file paths
      const pathParts = file.path.split('/');
      
      // Look for component-like directories or files
      pathParts.forEach(part => {
        // Skip common non-component directories
        if (!['src', 'components', 'pages', 'utils', 'lib', 'styles', 'tests', '__tests__'].includes(part) && 
            !part.includes('.') && 
            part.length > 2) {
          components.add(part);
        }
      });

      // Also extract from filename (without extension)
      const fileName = pathParts[pathParts.length - 1];
      if (fileName) {
        const nameWithoutExt = fileName.split('.')[0];
        if (nameWithoutExt && nameWithoutExt.length > 2) {
          components.add(nameWithoutExt);
        }
      }
    });

    return Array.from(components).slice(0, 5); // Limit to top 5 components
  }

  private buildContextInfo(prAnalysis: PRAnalysis, jiraContext: TicketContext | null): string {
    let context = `PR: ${prAnalysis.title}\n`;
    context += `Changed files: ${prAnalysis.changedFiles.map(f => f.path).join(', ')}\n`;
    
    if (jiraContext) {
      context += `Jira ticket: ${jiraContext.ticket.key} - ${jiraContext.ticket.summary}\n`;
      context += `Issue type: ${jiraContext.ticket.issueType}\n`;
      if (jiraContext.ticket.description) {
        context += `Description: ${jiraContext.ticket.description.substring(0, 200)}...\n`;
      }
    }

    return context;
  }

  private async queryOnyxAI(queryObj: OnyxQuery, baseUrl: string, apiKey: string): Promise<string> {
    const onyxUrl = `${baseUrl}/chat/send-message`;
    const response = await fetch(onyxUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: `${queryObj.query}\n\nContext:\n${queryObj.context}`,
        chat_session_id: null
      })
    });

    if (!response.ok) {
      throw new Error(`Onyx AI API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Extract the answer from Onyx response structure
    // This may need adjustment based on actual Onyx API response format
    return data.answer || data.message || data.response || JSON.stringify(data);
  }
}