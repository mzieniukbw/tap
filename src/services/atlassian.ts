import { PRAnalysis } from "./github.ts";

export interface JiraTicket {
  key: string;
  summary: string;
  description: string;
  status: string;
  assignee?: string;
  reporter: string;
  created: string;
  updated: string;
  priority: string;
  issueType: string;
  epic?: string;
  labels: string[];
  components: string[];
}

export interface ConfluencePage {
  id: string;
  title: string;
  content: string;
  space: string;
  version: number;
  created: string;
  updated: string;
  author: string;
  url: string;
}

export interface TicketContext {
  ticket: JiraTicket;
  epic?: JiraTicket;
  linkedIssues: JiraTicket[];
  relatedPages: ConfluencePage[];
}

export class AtlassianService {
  private baseUrl: string;
  private email: string;
  private token: string;
  private authHeader: string;

  constructor() {
    this.baseUrl = Deno.env.get("ATLASSIAN_BASE_URL") || "";
    this.email = Deno.env.get("ATLASSIAN_EMAIL") || "";
    this.token = Deno.env.get("ATLASSIAN_API_TOKEN") || "";
    this.authHeader = `Basic ${btoa(`${this.email}:${this.token}`)}`;
  }

  async getTicketFromPR(prAnalysis: PRAnalysis): Promise<TicketContext | null> {
    if (prAnalysis.jiraTicketKeys.length === 0) {
      return null;
    }

    // Use the first Jira ticket found
    const ticketKey = prAnalysis.jiraTicketKeys[0];
    
    try {
      const ticket = await this.getJiraTicket(ticketKey);
      const context: TicketContext = {
        ticket,
        linkedIssues: [],
        relatedPages: []
      };

      // Get epic if available
      if (ticket.epic) {
        try {
          context.epic = await this.getJiraTicket(ticket.epic);
        } catch (error) {
          console.warn(`Could not fetch epic ${ticket.epic}:`, error);
        }
      }

      // Get linked issues
      context.linkedIssues = await this.getLinkedIssues(ticketKey);

      // Get related Confluence pages
      context.relatedPages = await this.findRelatedConfluencePages(ticket);

      return context;
    } catch (error) {
      console.warn(`Could not fetch Jira ticket ${ticketKey}:`, error);
      return null;
    }
  }

  async getJiraTicket(ticketKey: string): Promise<JiraTicket> {
    const url = `${this.baseUrl}/rest/api/3/issue/${ticketKey}`;
    const response = await this.atlassianRequest(url);

    return {
      key: response.key,
      summary: response.fields.summary,
      description: this.extractTextFromJiraContent(response.fields.description),
      status: response.fields.status.name,
      assignee: response.fields.assignee?.displayName,
      reporter: response.fields.reporter.displayName,
      created: response.fields.created,
      updated: response.fields.updated,
      priority: response.fields.priority.name,
      issueType: response.fields.issuetype.name,
      epic: response.fields.parent?.key,
      labels: response.fields.labels || [],
      components: response.fields.components?.map((c: any) => c.name) || [],
    };
  }

  async getLinkedIssues(ticketKey: string): Promise<JiraTicket[]> {
    try {
      const url = `${this.baseUrl}/rest/api/3/issue/${ticketKey}?expand=issuelinks`;
      const response = await this.atlassianRequest(url);
      
      const linkedIssues: JiraTicket[] = [];
      
      for (const link of response.fields.issuelinks || []) {
        const linkedKey = link.outwardIssue?.key || link.inwardIssue?.key;
        if (linkedKey) {
          try {
            const linkedTicket = await this.getJiraTicket(linkedKey);
            linkedIssues.push(linkedTicket);
          } catch (error) {
            console.warn(`Could not fetch linked issue ${linkedKey}:`, error);
          }
        }
      }
      
      return linkedIssues;
    } catch (error) {
      console.warn(`Could not fetch linked issues for ${ticketKey}:`, error);
      return [];
    }
  }

  async findRelatedConfluencePages(ticket: JiraTicket): Promise<ConfluencePage[]> {
    const searchTerms = [
      ticket.key,
      ...ticket.labels,
      ...ticket.components,
      // Extract key terms from summary
      ...ticket.summary.split(' ').filter(word => word.length > 3)
    ].filter(Boolean);

    const pages: ConfluencePage[] = [];
    
    // Search for each term
    for (const term of searchTerms.slice(0, 5)) { // Limit to first 5 terms to avoid too many requests
      try {
        const results = await this.searchConfluencePages(term);
        pages.push(...results.slice(0, 3)); // Limit to 3 results per term
      } catch (error) {
        console.warn(`Confluence search failed for term "${term}":`, error);
      }
    }

    // Remove duplicates based on page ID
    const uniquePages = pages.filter((page, index, self) => 
      index === self.findIndex(p => p.id === page.id)
    );

    return uniquePages.slice(0, 10); // Limit to 10 total pages
  }

  async searchConfluencePages(query: string): Promise<ConfluencePage[]> {
    const encodedQuery = encodeURIComponent(query);
    const url = `${this.baseUrl}/wiki/rest/api/content/search?cql=text~"${encodedQuery}"&expand=body.storage,version,space&limit=5`;
    
    try {
      const response = await this.atlassianRequest(url);
      
      return response.results.map((page: any) => ({
        id: page.id,
        title: page.title,
        content: this.extractTextFromConfluenceContent(page.body?.storage?.value || ""),
        space: page.space.name,
        version: page.version?.number || 1,
        created: page.history?.createdDate || page.version?.when || "",
        updated: page.version?.when || "",
        author: page.version?.by?.displayName || "Unknown",
        url: `${this.baseUrl}/wiki${page._links.webui}`
      }));
    } catch (error) {
      console.warn(`Confluence search error:`, error);
      return [];
    }
  }

  async getRelatedDocumentation(context: TicketContext): Promise<ConfluencePage[]> {
    // Already populated in getTicketFromPR
    return context.relatedPages;
  }

  private async atlassianRequest(url: string, options: any = {}): Promise<any> {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': this.authHeader,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`Atlassian API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  private extractTextFromJiraContent(content: any): string {
    if (!content) return "";
    
    // Handle Atlassian Document Format (ADF)
    if (content.content) {
      return this.extractTextFromADF(content);
    }
    
    // Handle plain text
    if (typeof content === 'string') {
      return content;
    }
    
    return "";
  }

  private extractTextFromADF(adf: any): string {
    if (!adf || !adf.content) return "";
    
    let text = "";
    for (const node of adf.content) {
      if (node.type === "paragraph" && node.content) {
        for (const inline of node.content) {
          if (inline.type === "text") {
            text += inline.text + " ";
          }
        }
      }
    }
    
    return text.trim();
  }

  private extractTextFromConfluenceContent(html: string): string {
    // Basic HTML to text conversion
    return html
      .replace(/<[^>]*>/g, " ") // Remove HTML tags
      .replace(/\s+/g, " ")     // Normalize whitespace
      .trim()
      .substring(0, 1000);      // Limit to 1000 characters
  }
}