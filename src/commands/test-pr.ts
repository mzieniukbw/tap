import { Command } from "@cliffy/command";
import { colors } from "@std/fmt/colors.ts";
import { GitHubService } from "../services/github.ts";
import { AtlassianService } from "../services/atlassian.ts";
import { TestScenarioGenerator } from "../services/test-generator.ts";
import { ClaudeDesktopOrchestrator } from "../services/claude-desktop.ts";
import { QAReportGenerator } from "../services/qa-report.ts";

export class TestPRCommand extends Command {
  constructor() {
    super();
    this.description("Analyze and test a GitHub PR")
      .arguments("<pr-url:string>")
      .option("--focus <areas:string>", "Focus testing on specific areas (comma-separated)")
      .option("--skip-execution", "Generate scenarios but don't execute tests")
      .option("--output <path:string>", "Output directory for test artifacts", {
        default: "./tap-output"
      })
      .action(async (options, prUrl) => {
        await this.executePRTest(prUrl, options);
      });
  }

  private async executePRTest(prUrl: string, options: any) {
    console.log(colors.blue("🔍 Testing Assistant Project - PR Analysis"));
    console.log(colors.gray("=" .repeat(50)));
    
    try {
      // Step 1: Analyze PR with Claude Code's built-in GitHub integration
      console.log(colors.yellow("📊 Analyzing GitHub PR..."));
      const githubService = new GitHubService();
      const prAnalysis = await githubService.analyzePR(prUrl);
      
      console.log(`PR: ${prAnalysis.title}`);
      console.log(`Files changed: ${prAnalysis.changedFiles.length}`);
      
      // Step 2: Get Jira ticket context
      console.log(colors.yellow("🎫 Fetching Jira context..."));
      const atlassianService = new AtlassianService();
      const jiraContext = await atlassianService.getTicketFromPR(prAnalysis);
      
      if (jiraContext) {
        console.log(`Jira ticket: ${jiraContext.key} - ${jiraContext.summary}`);
      }
      
      // Step 3: Get Confluence documentation
      console.log(colors.yellow("📚 Searching for related documentation..."));
      const confluencePages = jiraContext 
        ? await atlassianService.getRelatedDocumentation(jiraContext)
        : [];
      
      console.log(`Found ${confluencePages.length} related documentation pages`);
      
      // Step 4: Generate test scenarios
      console.log(colors.yellow("🧪 Generating test scenarios..."));
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
        console.log(colors.yellow("🤖 Executing tests with Claude Desktop..."));
        const orchestrator = new ClaudeDesktopOrchestrator();
        const results = await orchestrator.executeScenarios(scenarios, options.output);
        
        // Step 6: Generate QA report
        console.log(colors.yellow("📋 Generating QA report..."));
        const reportGenerator = new QAReportGenerator();
        const report = await reportGenerator.generate({
          prAnalysis,
          jiraContext,
          confluencePages,
          scenarios,
          results,
          outputDir: options.output
        });
        
        console.log(colors.green("✅ Testing complete!"));
        console.log(colors.gray("QA Report:"));
        console.log(report);
      } else {
        console.log(colors.blue("ℹ️ Test execution skipped - scenarios generated only"));
        scenarios.forEach((scenario, i) => {
          console.log(`${i + 1}. ${scenario.title}`);
          console.log(`   ${scenario.description}`);
        });
      }
      
    } catch (error) {
      console.error(colors.red("❌ Error during PR testing:"));
      console.error(error);
      Deno.exit(1);
    }
  }
}