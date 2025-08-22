import { Command } from "commander";
import chalk from "chalk";
import { execSync } from "child_process";
import { GitHubService } from "../services/github";
import { AtlassianService } from "../services/atlassian";
import { TestScenarioGenerator } from "../services/test-generator";
import { AITestScenarioGenerator } from "../services/ai-test-generator";
import { ContextExporter } from "../services/context-exporter";
import { ClaudeDesktopOrchestrator } from "../services/claude-desktop";
import { QAReportGenerator } from "../services/qa-report";

async function executeCurrentPRTest(options: any) {
  console.log(chalk.blue("🔍 Auto-detecting current PR..."));
  
  try {
    // Get current branch
    const currentBranch = await getCurrentBranch();
    console.log(`Current branch: ${currentBranch}`);
    
    // Get remote origin URL
    const remoteUrl = await getRemoteOriginUrl();
    console.log(`Repository: ${remoteUrl}`);
    
    // Find PR for current branch
    const prUrl = await findPRForBranch(remoteUrl, currentBranch);
    
    if (!prUrl) {
      console.log(chalk.yellow("⚠️ No PR found for current branch"));
      console.log("Make sure your branch has an associated pull request on GitHub");
      process.exit(1);
    }
    
    console.log(chalk.green(`Found PR: ${prUrl}`));
    
    // Execute the PR test using the same logic as test-pr command
    await executePRTest(prUrl, options);
    
  } catch (error) {
    console.error(chalk.red("❌ Error detecting current PR:"));
    console.error(error);
    process.exit(1);
  }
}

async function executePRTest(prUrl: string, options: any) {
  const startTime = Date.now();
  console.log(chalk.blue("🔍 Testing Assistant Project - Current PR Analysis"));
  console.log(chalk.gray("=".repeat(50)));
  
  if (options.verbose) {
    console.log(chalk.gray(`Verbose logging enabled`));
    console.log(chalk.gray(`PR URL: ${prUrl}`));
    console.log(chalk.gray(`Options:`, JSON.stringify(options, null, 2)));
    console.log(chalk.gray(`Started at: ${new Date(startTime).toISOString()}`));
  }
  
  try {
    // Step 1: Analyze PR
    console.log(chalk.yellow("📊 Analyzing GitHub PR..."));
    const githubService = new GitHubService();
    const prAnalysis = await githubService.analyzePR(prUrl);
    
    console.log(`PR: ${prAnalysis.title}`);
    console.log(`Files changed: ${prAnalysis.changedFiles.length}`);
    
    if (options.verbose) {
      console.log(chalk.gray(`PR Analysis details:`));
      console.log(chalk.gray(`  - Number: ${prAnalysis.number}`));
      console.log(chalk.gray(`  - Author: ${prAnalysis.author}`));
      console.log(chalk.gray(`  - Branch: ${prAnalysis.branch} -> ${prAnalysis.baseBranch}`));
    }
    
    // Step 2: Get Jira context
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
    
    // Step 4: Generate test scenarios with AI
    console.log(chalk.yellow("🧪 Generating test scenarios..."));
    const focusAreas = options.focus?.split(",") || [];
    
    let scenarios;
    let aiSummary = '';
    let isAIGenerated = false;

    // Try AI generation first, fallback to rule-based
    try {
      const aiGenerator = new AITestScenarioGenerator();
      scenarios = await aiGenerator.generateScenarios({
        prAnalysis,
        jiraContext,
        confluencePages,
        focusAreas
      });

      aiSummary = await aiGenerator.generateTestSummary(scenarios, {
        prAnalysis,
        jiraContext,
        confluencePages,
        focusAreas
      });

      isAIGenerated = true;
      console.log(`🤖 AI-generated ${scenarios.length} intelligent test scenarios`);

    } catch (aiError) {
      console.log(chalk.yellow(`⚠️  AI generation unavailable, using rule-based generation`));
      
      const generator = new TestScenarioGenerator();
      scenarios = await generator.generate({
        prAnalysis,
        jiraContext,
        confluencePages,
        focusAreas
      });

      console.log(`📋 Generated ${scenarios.length} rule-based test scenarios`);
    }

    // Export context if generate-only mode
    if (options.generateOnly) {
      console.log(chalk.yellow("📤 Exporting context for Claude Code review..."));
      
      const exporter = new ContextExporter();
      const contextData = {
        prAnalysis,
        jiraContext,
        confluencePages,
        generatedScenarios: scenarios,
        aiSummary,
        metadata: {
          exportedAt: new Date().toISOString(),
          tapVersion: "1.0.0",
          totalScenarios: scenarios.length,
          focusAreas
        }
      };

      const exportedFiles = await exporter.exportFullContext(contextData, options.output);
      
      console.log(chalk.green("✅ Context exported successfully!"));
      console.log(chalk.blue(`\n📁 Files created in ${options.output}:`));
      exportedFiles.forEach(file => {
        console.log(`  • ${file}`);
      });

      console.log(chalk.blue(`\n🤖 Next steps:`));
      console.log(`  1. Review generated scenarios in: ${options.output}/generated-scenarios.md`);
      console.log(`  2. Use Claude Code to refine scenarios based on full context`);
      console.log(`  3. Run: bun run start execute-scenarios --file <refined-scenarios.json>`);
      
      if (isAIGenerated) {
        console.log(chalk.gray(`\n💡 AI Summary:`));
        console.log(chalk.gray(aiSummary));
      }

      return;
    }
    
    // Step 5: Execute tests (unless skipped)
    if (!options.skipExecution) {
      console.log(chalk.yellow("🤖 Executing tests with Claude Desktop..."));
      
      const orchestrator = new ClaudeDesktopOrchestrator();
      const results = await orchestrator.executeScenarios(scenarios, options.output);
      
      // Generate QA report
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

async function getCurrentBranch(): Promise<string> {
  try {
    const result = execSync("git rev-parse --abbrev-ref HEAD", { encoding: 'utf8' });
    return result.trim();
  } catch (error) {
    throw new Error(`Failed to get current branch: ${error}`);
  }
}

async function getRemoteOriginUrl(): Promise<string> {
  try {
    const result = execSync("git config --get remote.origin.url", { encoding: 'utf8' });
    return result.trim();
  } catch (error) {
    throw new Error(`Failed to get remote origin URL: ${error}`);
  }
}

async function findPRForBranch(remoteUrl: string, branch: string): Promise<string | null> {
  // Parse GitHub URL to get owner/repo
  const match = remoteUrl.match(/github\.com[:/](.+?)\/(.+?)(?:\.git)?$/);
  if (!match) {
    throw new Error("Not a GitHub repository or invalid URL format");
  }
  
  const owner = match[1];
  const repo = match[2];
  
  // Use GitHub API to find PR for branch
  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    throw new Error("GITHUB_TOKEN environment variable is required");
  }
  
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/pulls?head=${owner}:${branch}&state=open`;
  
  try {
    const response = await fetch(apiUrl, {
      headers: {
        "Authorization": `token ${githubToken}`,
        "Accept": "application/vnd.github.v3+json"
      }
    });
    
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }
    
    const prs = await response.json();
    
    if (prs.length === 0) {
      return null;
    }
    
    return prs[0].html_url;
  } catch (error) {
    throw new Error(`Failed to find PR for branch ${branch}: ${error}`);
  }
}

export const testCurrentPRCommand = new Command("test-current-pr")
  .description("Test the current branch's PR (auto-detect)")
  .option("--focus <areas>", "Focus testing on specific areas (comma-separated)")
  .option("--generate-only", "Generate scenarios and export context for Claude Code review")
  .option("--skip-execution", "Generate scenarios but don't execute tests")
  .option("--output <path>", "Output directory for test artifacts", "./tap-output")
  .option("--verbose", "Enable detailed logging")
  .action(executeCurrentPRTest);