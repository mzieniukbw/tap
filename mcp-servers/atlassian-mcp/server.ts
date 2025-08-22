#!/usr/bin/env -S deno run --allow-all

// MCP Server for Atlassian (Jira + Confluence) integration
// Uses unified Atlassian API token for both services

import { Server } from "npm:@modelcontextprotocol/sdk@0.6.0/server/index.js";
import { StdioServerTransport } from "npm:@modelcontextprotocol/sdk@0.6.0/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "npm:@modelcontextprotocol/sdk@0.6.0/types.js";

interface JiraTicket {
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

interface ConfluencePage {
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

class AtlassianMCPServer {
  private server: Server;
  private baseUrl: string;
  private email: string;
  private apiToken: string;
  private authHeader: string;

  constructor() {
    this.server = new Server(
      {
        name: 'atlassian-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    // Get configuration from environment
    this.baseUrl = Deno.env.get("ATLASSIAN_BASE_URL") || "";
    this.email = Deno.env.get("ATLASSIAN_EMAIL") || "";
    this.apiToken = Deno.env.get("ATLASSIAN_API_TOKEN") || "";
    this.authHeader = `Basic ${btoa(`${this.email}:${this.apiToken}`)}`;

    if (!this.baseUrl || !this.email || !this.apiToken) {
      throw new Error("Missing required environment variables: ATLASSIAN_BASE_URL, ATLASSIAN_EMAIL, ATLASSIAN_API_TOKEN");
    }

    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        {
          uri: 'jira://tickets',
          name: 'Jira Tickets',
          description: 'Access to Jira ticket information',
          mimeType: 'application/json',
        },
        {
          uri: 'confluence://pages',
          name: 'Confluence Pages',
          description: 'Access to Confluence page content',
          mimeType: 'application/json',
        },
      ],
    }));

    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'get_jira_ticket',
          description: 'Get details of a Jira ticket by key',
          inputSchema: {
            type: 'object',
            properties: {
              ticketKey: {
                type: 'string',
                description: 'The Jira ticket key (e.g., PROJ-123)',
              },
            },
            required: ['ticketKey'],
          },
        },
        {
          name: 'get_confluence_page',
          description: 'Get content of a Confluence page by ID',
          inputSchema: {
            type: 'object',
            properties: {
              pageId: {
                type: 'string',
                description: 'The Confluence page ID',
              },
            },
            required: ['pageId'],
          },
        },
        {
          name: 'search_jira_tickets',
          description: 'Search for Jira tickets using JQL',
          inputSchema: {
            type: 'object',
            properties: {
              jql: {
                type: 'string',
                description: 'JQL query string',
              },
            },
            required: ['jql'],
          },
        },
        {
          name: 'search_confluence_pages',
          description: 'Search for Confluence pages',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query',
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'get_ticket_context',
          description: 'Get full context for a ticket including epic and linked issues',
          inputSchema: {
            type: 'object',
            properties: {
              ticketKey: {
                type: 'string',
                description: 'The Jira ticket key (e.g., PROJ-123)',
              },
            },
            required: ['ticketKey'],
          },
        },
        {
          name: 'find_related_documentation',
          description: 'Find Confluence pages related to a Jira ticket',
          inputSchema: {
            type: 'object',
            properties: {
              ticketKey: {
                type: 'string',
                description: 'The Jira ticket key to find documentation for',
              },
            },
            required: ['ticketKey'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      
      if (uri.startsWith('jira://')) {
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify({ message: 'Jira resource access available' }),
            },
          ],
        };
      }
      
      if (uri.startsWith('confluence://')) {
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify({ message: 'Confluence resource access available' }),
            },
          ],
        };
      }

      throw new Error(`Unknown resource: ${uri}`);
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'get_jira_ticket':
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(await this.getJiraTicket(args.ticketKey as string)),
                },
              ],
            };

          case 'get_confluence_page':
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(await this.getConfluencePage(args.pageId as string)),
                },
              ],
            };

          case 'search_jira_tickets':
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(await this.searchJiraTickets(args.jql as string)),
                },
              ],
            };

          case 'search_confluence_pages':
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(await this.searchConfluencePages(args.query as string)),
                },
              ],
            };

          case 'get_ticket_context':
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(await this.getTicketContext(args.ticketKey as string)),
                },
              ],
            };

          case 'find_related_documentation':
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(await this.findRelatedDocumentation(args.ticketKey as string)),
                },
              ],
            };

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: error.message }),
            },
          ],
        };
      }
    });
  }

  private async makeRequest(url: string, options: any = {}): Promise<any> {
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
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async getJiraTicket(ticketKey: string): Promise<JiraTicket> {
    const url = `${this.baseUrl}/rest/api/3/issue/${ticketKey}`;
    const response = await this.makeRequest(url);

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

  async searchJiraTickets(jql: string): Promise<JiraTicket[]> {
    const url = `${this.baseUrl}/rest/api/3/search`;
    const response = await this.makeRequest(url, {
      method: 'POST',
      body: JSON.stringify({ jql, maxResults: 50 }),
    });

    return response.issues.map((issue: any) => ({
      key: issue.key,
      summary: issue.fields.summary,
      description: this.extractTextFromJiraContent(issue.fields.description),
      status: issue.fields.status.name,
      assignee: issue.fields.assignee?.displayName,
      reporter: issue.fields.reporter.displayName,
      created: issue.fields.created,
      updated: issue.fields.updated,
      priority: issue.fields.priority.name,
      issueType: issue.fields.issuetype.name,
      epic: issue.fields.parent?.key,
      labels: issue.fields.labels || [],
      components: issue.fields.components?.map((c: any) => c.name) || [],
    }));
  }

  async getConfluencePage(pageId: string): Promise<ConfluencePage> {
    const url = `${this.baseUrl}/wiki/rest/api/content/${pageId}?expand=body.storage,version,space`;
    const response = await this.makeRequest(url);

    return {
      id: response.id,
      title: response.title,
      content: this.extractTextFromConfluenceContent(response.body?.storage?.value || ""),
      space: response.space.name,
      version: response.version.number,
      created: response.history?.createdDate || response.version?.when || "",
      updated: response.version?.when || "",
      author: response.version?.by?.displayName || "Unknown",
      url: `${this.baseUrl}/wiki${response._links.webui}`
    };
  }

  async searchConfluencePages(query: string): Promise<ConfluencePage[]> {
    const encodedQuery = encodeURIComponent(query);
    const url = `${this.baseUrl}/wiki/rest/api/content/search?cql=text~"${encodedQuery}"&expand=body.storage,version,space&limit=10`;
    
    const response = await this.makeRequest(url);

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
  }

  async getTicketContext(ticketKey: string): Promise<{
    ticket: JiraTicket;
    epic?: JiraTicket;
    linkedIssues: JiraTicket[];
  }> {
    const ticket = await this.getJiraTicket(ticketKey);
    const context: any = { ticket, linkedIssues: [] };

    // Get epic if available
    if (ticket.epic) {
      try {
        context.epic = await this.getJiraTicket(ticket.epic);
      } catch (error) {
        console.warn(`Could not fetch epic ${ticket.epic}:`, error);
      }
    }

    // Get linked issues
    try {
      const linksUrl = `${this.baseUrl}/rest/api/3/issue/${ticketKey}?expand=issuelinks`;
      const linksResponse = await this.makeRequest(linksUrl);
      
      for (const link of linksResponse.fields.issuelinks || []) {
        const linkedKey = link.outwardIssue?.key || link.inwardIssue?.key;
        if (linkedKey) {
          try {
            const linkedTicket = await this.getJiraTicket(linkedKey);
            context.linkedIssues.push(linkedTicket);
          } catch (error) {
            console.warn(`Could not fetch linked issue ${linkedKey}:`, error);
          }
        }
      }
    } catch (error) {
      console.warn(`Could not fetch linked issues for ${ticketKey}:`, error);
    }

    return context;
  }

  async findRelatedDocumentation(ticketKey: string): Promise<ConfluencePage[]> {
    const ticket = await this.getJiraTicket(ticketKey);
    
    const searchTerms = [
      ticket.key,
      ...ticket.labels,
      ...ticket.components,
      // Extract key terms from summary
      ...ticket.summary.split(' ').filter(word => word.length > 3)
    ].filter(Boolean);

    const pages: ConfluencePage[] = [];
    
    // Search for each term
    for (const term of searchTerms.slice(0, 5)) { // Limit to first 5 terms
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

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log("Atlassian MCP Server started");
  }
}

if (import.meta.main) {
  const server = new AtlassianMCPServer();
  server.run().catch(console.error);
}