import chalk from "chalk";
import { GitHubService, PRAnalysis } from "./github";
import { AtlassianService, TicketContext, ConfluencePage } from "./atlassian";
import { OnyxContextService, OnyxContext } from "./onyx-context";

export interface PRContext {
  prAnalysis: PRAnalysis;
  jiraContext: TicketContext | null;
  confluencePages: ConfluencePage[];
  onyxContext: OnyxContext | null;
}

export interface ContextGatheringOptions {
  verbose?: boolean;
  prAnalysis: PRAnalysis; // Required pre-analyzed PR data
}

export class ContextGatheringService {
  async gatherPRContext(options: ContextGatheringOptions): Promise<PRContext> {
    const { verbose, prAnalysis } = options;

    // Use pre-analyzed PR data
    console.log(`PR: ${prAnalysis.title}`);
    console.log(`Files changed: ${prAnalysis.changedFiles.length}`);
    
    if (verbose) {
      console.log(chalk.gray(`Using pre-analyzed PR data`));
      console.log(chalk.gray(`PR Analysis details:`));
      console.log(chalk.gray(`  - Number: ${prAnalysis.number}`));
      console.log(chalk.gray(`  - Author: ${prAnalysis.author}`));
      console.log(chalk.gray(`  - Branch: ${prAnalysis.branch} -> ${prAnalysis.baseBranch}`));
      console.log(chalk.gray(`  - Labels: [${prAnalysis.labels.join(", ")}]`));
      console.log(chalk.gray(`  - Commits: ${prAnalysis.commits.length}`));
      console.log(chalk.gray(`  - Jira tickets found: [${prAnalysis.jiraTicketKeys.join(", ")}]`));
      console.log(chalk.gray(`  - Changed files:`));
      prAnalysis.changedFiles.forEach((file) => {
        console.log(
          chalk.gray(`    ${file.status}: ${file.path} (+${file.additions}/-${file.deletions})`)
        );
      });
      if (prAnalysis.description) {
        console.log(chalk.gray(`  - Description: ${prAnalysis.description}`));
      }
    }

    // Step 2: Get Jira ticket context
    console.log(chalk.yellow("🎫 Fetching Jira context..."));
    if (verbose) {
      console.log(chalk.gray(`Initializing Atlassian service...`));
      console.log(
        chalk.gray(`Looking for Jira tickets in PR: [${prAnalysis.jiraTicketKeys.join(", ")}]`)
      );
    }
    const atlassianService = new AtlassianService();
    const step2Start = Date.now();
    const jiraContext = await atlassianService.getTicketFromPR(prAnalysis);

    if (jiraContext) {
      console.log(`Jira ticket: ${jiraContext.ticket.key} - ${jiraContext.ticket.summary}`);
      if (verbose) {
        console.log(chalk.gray(`Jira context details:`));
        console.log(chalk.gray(`  - Status: ${jiraContext.ticket.status}`));
        console.log(chalk.gray(`  - Type: ${jiraContext.ticket.issueType}`));
        console.log(chalk.gray(`  - Priority: ${jiraContext.ticket.priority}`));
        console.log(chalk.gray(`  - Assignee: ${jiraContext.ticket.assignee || "Unassigned"}`));
        console.log(chalk.gray(`  - Reporter: ${jiraContext.ticket.reporter}`));
        console.log(chalk.gray(`  - Labels: [${jiraContext.ticket.labels.join(", ")}]`));
        console.log(chalk.gray(`  - Components: [${jiraContext.ticket.components.join(", ")}]`));
        if (jiraContext.epic) {
          console.log(
            chalk.gray(`  - Epic: ${jiraContext.epic.key} - ${jiraContext.epic.summary}`)
          );
        }
        if (jiraContext.linkedIssues.length > 0) {
          console.log(chalk.gray(`  - Linked issues: ${jiraContext.linkedIssues.length}`));
          jiraContext.linkedIssues.forEach((issue) => {
            console.log(chalk.gray(`    ${issue.key}: ${issue.summary}`));
          });
        }
      }
    } else {
      if (verbose) {
        console.log(chalk.gray(`No Jira ticket context found`));
      }
    }

    if (verbose) {
      console.log(chalk.gray(`Step 2 completed in ${Date.now() - step2Start}ms`));
    }

    // Step 3: Get Confluence documentation
    console.log(chalk.yellow("📚 Searching for related documentation..."));
    if (verbose) {
      if (jiraContext) {
        console.log(
          chalk.gray(
            `Searching Confluence for documentation related to ${jiraContext.ticket.key}...`
          )
        );
      } else {
        console.log(chalk.gray(`No Jira context available, skipping Confluence search`));
      }
    }
    const step3Start = Date.now();
    const confluencePages = jiraContext
      ? await atlassianService.getRelatedDocumentation(jiraContext)
      : [];

    console.log(`Found ${confluencePages.length} related documentation pages`);

    if (verbose && confluencePages.length > 0) {
      console.log(chalk.gray(`Confluence pages found:`));
      confluencePages.forEach((page) => {
        console.log(chalk.gray(`  - ${page.title} (${page.space})`));
        console.log(chalk.gray(`    Created: ${page.created}, Updated: ${page.updated}`));
        console.log(chalk.gray(`    Author: ${page.author}`));
      });
    }

    if (verbose) {
      console.log(chalk.gray(`Step 3 completed in ${Date.now() - step3Start}ms`));
    }

    // Step 4: Get Onyx AI Product Context
    console.log(chalk.yellow("🧠 Gathering Onyx AI product knowledge..."));
    if (verbose) {
      console.log(chalk.gray(`Querying Onyx AI for product context and user workflows...`));
    }
    const step4Start = Date.now();
    const onyxService = new OnyxContextService();
    const onyxContext = await onyxService.gatherProductContext(prAnalysis, jiraContext, {
      verbose,
    });

    if (onyxContext) {
      console.log(`Gathered ${onyxContext.responses.length} Onyx AI insights`);
      if (verbose && onyxContext.responses.length > 0) {
        console.log(chalk.gray(`Onyx AI insights:`));
        onyxContext.responses.forEach((response, i) => {
          console.log(chalk.gray(`  ${i + 1}. ${response.query}`));
          console.log(
            chalk.gray(
              `     Answer preview: ${response.answer.substring(0, 100)}${response.answer.length > 100 ? "..." : ""}`
            )
          );
        });
      }
    } else {
      if (verbose) {
        console.log(chalk.gray(`Onyx AI not configured or unavailable`));
      }
    }

    if (verbose) {
      console.log(chalk.gray(`Step 4 completed in ${Date.now() - step4Start}ms`));
    }

    return {
      prAnalysis,
      jiraContext,
      confluencePages,
      onyxContext,
    };
  }
}
