import { Command } from "commander";
import chalk from "chalk";
import { GitHubService } from "../services/github";
import { AtlassianService } from "../services/atlassian";
import { TestScenarioGenerator } from "../services/test-generator";
import { ClaudeDesktopOrchestrator } from "../services/claude-desktop";
import { QAReportGenerator } from "../services/qa-report";

async function executePRTest(prUrl: string, options: any) {
  const startTime = Date.now();
  console.log(chalk.blue("🔍 Testing Assistant Project - PR Analysis"));
  console.log(chalk.gray("=".repeat(50)));
  
  if (options.verbose) {
    console.log(chalk.gray(`Verbose logging enabled`));
    console.log(chalk.gray(`PR URL: ${prUrl}`));
    console.log(chalk.gray(`Options:`, JSON.stringify(options, null, 2)));
    console.log(chalk.gray(`Started at: ${new Date(startTime).toISOString()}`));
  }
  
  try {
    // Step 1: Analyze PR with Claude Code's built-in GitHub integration
    console.log(chalk.yellow("📊 Analyzing GitHub PR..."));
    if (options.verbose) {
      console.log(chalk.gray(`Initializing GitHub service...`));
    }
    const githubService = new GitHubService();
    const step1Start = Date.now();
    const prAnalysis = await githubService.analyzePR(prUrl);
    
    console.log(`PR: ${prAnalysis.title}`);
    console.log(`Files changed: ${prAnalysis.changedFiles.length}`);
    
    if (options.verbose) {
      console.log(chalk.gray(`Step 1 completed in ${Date.now() - step1Start}ms`));
      console.log(chalk.gray(`PR Analysis details:`));
      console.log(chalk.gray(`  - Number: ${prAnalysis.number}`));
      console.log(chalk.gray(`  - Author: ${prAnalysis.author}`));
      console.log(chalk.gray(`  - Branch: ${prAnalysis.branch} -> ${prAnalysis.baseBranch}`));
      console.log(chalk.gray(`  - Labels: [${prAnalysis.labels.join(', ')}]`));
      console.log(chalk.gray(`  - Commits: ${prAnalysis.commits.length}`));
      console.log(chalk.gray(`  - Jira tickets found: [${prAnalysis.jiraTicketKeys.join(', ')}]`));
      console.log(chalk.gray(`  - Changed files:`));
      prAnalysis.changedFiles.forEach(file => {
        console.log(chalk.gray(`    ${file.status}: ${file.path} (+${file.additions}/-${file.deletions})`));
      });
      if (prAnalysis.description) {
        console.log(chalk.gray(`  - Description: ${prAnalysis.description}`));
      }
    }
    
    // Step 2: Get Jira ticket context
    console.log(chalk.yellow("🎫 Fetching Jira context..."));
    if (options.verbose) {
      console.log(chalk.gray(`Initializing Atlassian service...`));
      console.log(chalk.gray(`Looking for Jira tickets in PR: [${prAnalysis.jiraTicketKeys.join(', ')}]`));
    }
    const atlassianService = new AtlassianService();
    const step2Start = Date.now();
    const jiraContext = await atlassianService.getTicketFromPR(prAnalysis);
    
    if (jiraContext) {
      console.log(`Jira ticket: ${jiraContext.ticket.key} - ${jiraContext.ticket.summary}`);
      if (options.verbose) {
        console.log(chalk.gray(`Jira context details:`));
        console.log(chalk.gray(`  - Status: ${jiraContext.ticket.status}`));
        console.log(chalk.gray(`  - Type: ${jiraContext.ticket.issueType}`));
        console.log(chalk.gray(`  - Priority: ${jiraContext.ticket.priority}`));
        console.log(chalk.gray(`  - Assignee: ${jiraContext.ticket.assignee || 'Unassigned'}`));
        console.log(chalk.gray(`  - Reporter: ${jiraContext.ticket.reporter}`));
        console.log(chalk.gray(`  - Labels: [${jiraContext.ticket.labels.join(', ')}]`));
        console.log(chalk.gray(`  - Components: [${jiraContext.ticket.components.join(', ')}]`));
        if (jiraContext.epic) {
          console.log(chalk.gray(`  - Epic: ${jiraContext.epic.key} - ${jiraContext.epic.summary}`));
        }
        if (jiraContext.linkedIssues.length > 0) {
          console.log(chalk.gray(`  - Linked issues: ${jiraContext.linkedIssues.length}`));
          jiraContext.linkedIssues.forEach(issue => {
            console.log(chalk.gray(`    ${issue.key}: ${issue.summary}`));
          });
        }
      }
    } else {
      if (options.verbose) {
        console.log(chalk.gray(`No Jira ticket context found`));
      }
    }
    
    if (options.verbose) {
      console.log(chalk.gray(`Step 2 completed in ${Date.now() - step2Start}ms`));
    }
    
    // Step 3: Get Confluence documentation
    console.log(chalk.yellow("📚 Searching for related documentation..."));
    if (options.verbose) {
      if (jiraContext) {
        console.log(chalk.gray(`Searching Confluence for documentation related to ${jiraContext.ticket.key}...`));
      } else {
        console.log(chalk.gray(`No Jira context available, skipping Confluence search`));
      }
    }
    const step3Start = Date.now();
    const confluencePages = jiraContext 
      ? await atlassianService.getRelatedDocumentation(jiraContext)
      : [];
    
    console.log(`Found ${confluencePages.length} related documentation pages`);
    
    if (options.verbose && confluencePages.length > 0) {
      console.log(chalk.gray(`Confluence pages found:`));
      confluencePages.forEach(page => {
        console.log(chalk.gray(`  - ${page.title} (${page.space})`));
        console.log(chalk.gray(`    Created: ${page.created}, Updated: ${page.updated}`));
        console.log(chalk.gray(`    Author: ${page.author}`));
      });
    }
    
    if (options.verbose) {
      console.log(chalk.gray(`Step 3 completed in ${Date.now() - step3Start}ms`));
    }
    
    // Step 4: Generate test scenarios
    console.log(chalk.yellow("🧪 Generating test scenarios..."));
    if (options.verbose) {
      console.log(chalk.gray(`Initializing test scenario generator...`));
      const focusAreas = options.focus?.split(",") || [];
      if (focusAreas.length > 0) {
        console.log(chalk.gray(`Focus areas: [${focusAreas.join(', ')}]`));
      } else {
        console.log(chalk.gray(`No specific focus areas specified`));
      }
    }
    const generator = new TestScenarioGenerator();
    const step4Start = Date.now();
    const scenarios = await generator.generate({
      prAnalysis,
      jiraContext,
      confluencePages,
      focusAreas: options.focus?.split(",") || []
    });
    
    console.log(`Generated ${scenarios.length} test scenarios`);
    
    if (options.verbose && scenarios.length > 0) {
      console.log(chalk.gray(`Test scenarios generated:`));
      scenarios.forEach((scenario, i) => {
        console.log(chalk.gray(`  ${i + 1}. ${scenario.title} (${scenario.priority} priority, ${scenario.category})`));
        console.log(chalk.gray(`     ${scenario.description}`));
        console.log(chalk.gray(`     Steps: ${scenario.steps.length}, Duration: ${scenario.estimatedDuration}min, Level: ${scenario.automationLevel}`));
        if (scenario.focusAreas.length > 0) {
          console.log(chalk.gray(`     Focus: [${scenario.focusAreas.join(', ')}]`));
        }
      });
    }
    
    if (options.verbose) {
      console.log(chalk.gray(`Step 4 completed in ${Date.now() - step4Start}ms`));
    }
    
    // Step 5: Execute tests (unless skipped)
    if (!options.skipExecution) {
      console.log(chalk.yellow("🤖 Executing tests with Claude Desktop..."));
      if (options.verbose) {
        console.log(chalk.gray(`Initializing Claude Desktop orchestrator...`));
        console.log(chalk.gray(`Output directory: ${options.output}`));
        console.log(chalk.gray(`Scenarios to execute: ${scenarios.length}`));
      }
      const orchestrator = new ClaudeDesktopOrchestrator();
      const step5Start = Date.now();
      const results = await orchestrator.executeScenarios(scenarios, options.output);
      
      if (options.verbose) {
        console.log(chalk.gray(`Test execution completed`));
        console.log(chalk.gray(`Results summary: ${results ? 'Available' : 'No results returned'}`));
        console.log(chalk.gray(`Step 5 completed in ${Date.now() - step5Start}ms`));
      }
      
      // Step 6: Generate QA report
      console.log(chalk.yellow("📋 Generating QA report..."));
      if (options.verbose) {
        console.log(chalk.gray(`Initializing QA report generator...`));
        console.log(chalk.gray(`Including ${scenarios.length} scenarios in report`));
        console.log(chalk.gray(`Report will be generated for output directory: ${options.output}`));
      }
      const reportGenerator = new QAReportGenerator();
      const step6Start = Date.now();
      const report = await reportGenerator.generate({
        prAnalysis,
        jiraContext,
        confluencePages,
        scenarios,
        results,
        outputDir: options.output
      });
      
      if (options.verbose) {
        console.log(chalk.gray(`QA report generation completed`));
        console.log(chalk.gray(`Report length: ${report.length} characters`));
        console.log(chalk.gray(`Step 6 completed in ${Date.now() - step6Start}ms`));
      }
      
      console.log(chalk.green("✅ Testing complete!"));
      if (options.verbose) {
        console.log(chalk.gray(`Total execution time: ${Date.now() - startTime}ms`));
      }
      console.log(chalk.gray("QA Report:"));
      console.log(report);
    } else {
      console.log(chalk.blue("ℹ️ Test execution skipped - scenarios generated only"));
      scenarios.forEach((scenario, i) => {
        console.log(`${i + 1}. ${scenario.title}`);
        console.log(`   ${scenario.description}`);
      });
      if (options.verbose) {
        console.log(chalk.gray(`Total execution time: ${Date.now() - startTime}ms`));
      }
    }
    
  } catch (error) {
    console.error(chalk.red("❌ Error during PR testing:"));
    if (options.verbose) {
      console.error(chalk.gray(`Error occurred at: ${new Date().toISOString()}`));
      console.error(chalk.gray(`Total runtime before error: ${Date.now() - startTime}ms`));
      console.error(chalk.gray(`PR URL: ${prUrl}`));
      if (error instanceof Error) {
        console.error(chalk.gray(`Error name: ${error.name}`));
        console.error(chalk.gray(`Error message: ${error.message}`));
        if (error.stack) {
          console.error(chalk.gray(`Stack trace:`));
          console.error(chalk.gray(error.stack));
        }
      }
    }
    console.error(error);
    process.exit(1);
  }
}

export const testPRCommand = new Command("test-pr")
  .description("Analyze and test a GitHub PR")
  .argument("<pr-url>", "GitHub PR URL")
  .option("--focus <areas>", "Focus testing on specific areas (comma-separated)")
  .option("--skip-execution", "Generate scenarios but don't execute tests")
  .option("--output <path>", "Output directory for test artifacts", "./tap-output")
  .option("--verbose", "Enable detailed logging")
  .action(executePRTest);