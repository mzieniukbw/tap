import { Command } from "commander";
import chalk from "chalk";
import { GitHubService } from "../services/github";
import { AtlassianService } from "../services/atlassian";
import { TestScenarioGenerator } from "../services/test-generator";
import { ClaudeDesktopOrchestrator } from "../services/claude-desktop";
import { QAReportGenerator } from "../services/qa-report";

async function executePRTest(prUrl: string, options: any) {
  console.log(chalk.blue("🔍 Testing Assistant Project - PR Analysis"));
  console.log(chalk.gray("=".repeat(50)));
  
  try {
    // Step 1: Analyze PR with Claude Code's built-in GitHub integration
    console.log(chalk.yellow("📊 Analyzing GitHub PR..."));
    const githubService = new GitHubService();
    const prAnalysis = await githubService.analyzePR(prUrl);
    
    console.log(`PR: ${prAnalysis.title}`);
    console.log(`Files changed: ${prAnalysis.changedFiles.length}`);
    
    // Step 2: Get Jira ticket context
    console.log(chalk.yellow("🎫 Fetching Jira context..."));
    const atlassianService = new AtlassianService();
    const jiraContext = await atlassianService.getTicketFromPR(prAnalysis);
    
    if (jiraContext) {
      console.log(`Jira ticket: ${jiraContext.ticket.key} - ${jiraContext.ticket.summary}`);
    }
    
    // Step 3: Get Confluence documentation
    console.log(chalk.yellow("📚 Searching for related documentation..."));
    const confluencePages = jiraContext 
      ? await atlassianService.getRelatedDocumentation(jiraContext)
      : [];
    
    console.log(`Found ${confluencePages.length} related documentation pages`);
    
    // Step 4: Generate test scenarios
    console.log(chalk.yellow("🧪 Generating test scenarios..."));
    const generator = new TestScenarioGenerator();
    const scenarios = await generator.generate({
      prAnalysis,
      jiraContext,
      confluencePages,
      focusAreas: options.focus?.split(",") || []
    });
    
    console.log(`Generated ${scenarios.length} test scenarios`);
    
    // Step 5: Execute tests (unless skipped)
    if (!options.skipExecution) {
      console.log(chalk.yellow("🤖 Executing tests with Claude Desktop..."));
      const orchestrator = new ClaudeDesktopOrchestrator();
      const results = await orchestrator.executeScenarios(scenarios, options.output);
      
      // Step 6: Generate QA report
      console.log(chalk.yellow("📋 Generating QA report..."));
      const reportGenerator = new QAReportGenerator();
      const report = await reportGenerator.generate({
        prAnalysis,
        jiraContext,
        confluencePages,
        scenarios,
        results,
        outputDir: options.output
      });
      
      console.log(chalk.green("✅ Testing complete!"));
      console.log(chalk.gray("QA Report:"));
      console.log(report);
    } else {
      console.log(chalk.blue("ℹ️ Test execution skipped - scenarios generated only"));
      scenarios.forEach((scenario, i) => {
        console.log(`${i + 1}. ${scenario.title}`);
        console.log(`   ${scenario.description}`);
      });
    }
    
  } catch (error) {
    console.error(chalk.red("❌ Error during PR testing:"));
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
  .action(executePRTest);