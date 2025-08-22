import { Command } from "commander";
import chalk from "chalk";
import { ContextGatheringService } from "../services/context-gathering";
import { AITestScenarioGenerator } from "../services/ai-test-generator";
import { ContextExporter } from "../services/context-exporter";
import { TestExecutionService } from "../services/test-execution";

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
    // Gather PR context (Steps 1-3: GitHub PR, Jira, and Confluence)
    const contextService = new ContextGatheringService();
    const { prAnalysis, jiraContext, confluencePages } = await contextService.gatherPRContext(prUrl, {
      verbose: options.verbose
    });
    
    // Generate output directory name based on PR number and last commit SHA
    const lastCommitSha = prAnalysis.commits[prAnalysis.commits.length - 1]?.sha.substring(0, 7) || 'unknown';
    const outputDir = options.output === './tap-output' 
      ? `./${prAnalysis.number}-${lastCommitSha}`
      : options.output;
    
    // Step 2: Generate test scenarios with AI
    console.log(chalk.yellow("🧪 Generating AI test scenarios..."));
    
    if (options.verbose) {
      console.log(chalk.gray(`Using Claude CLI for intelligent test generation...`));
    }

    const step2Start = Date.now();
    let scenarios;
    let aiSummary = '';

    try {
      const aiGenerator = new AITestScenarioGenerator();
      scenarios = await aiGenerator.generateScenarios({
        prAnalysis,
        jiraContext,
        confluencePages
      });

      aiSummary = await aiGenerator.generateTestSummary(scenarios, {
        prAnalysis,
        jiraContext,
        confluencePages
      });

      console.log(`🤖 AI-generated ${scenarios.length} intelligent test scenarios`);

      if (options.verbose) {
        console.log(chalk.gray(`AI generation successful - scenarios based on full context analysis`));
      }

    } catch (aiError) {
      console.error(chalk.red("❌ AI test generation failed:"));
      if (options.verbose) {
        console.error(chalk.gray(`Error: ${aiError instanceof Error ? aiError.message : String(aiError)}`));
        console.error(chalk.gray(`Make sure Claude CLI is installed and authenticated:`));
        console.error(chalk.gray(`  npm install -g @anthropic-ai/claude-cli`));
        console.error(chalk.gray(`  claude auth`));
      }
      throw aiError;
    }
    
    if (options.verbose && scenarios.length > 0) {
      console.log(chalk.gray(`Test scenarios generated:`));
      scenarios.forEach((scenario, i) => {
        console.log(chalk.gray(`  ${i + 1}. ${scenario.title} (${scenario.priority} priority, ${scenario.category})`));
        console.log(chalk.gray(`     ${scenario.description}`));
        console.log(chalk.gray(`     Steps: ${scenario.steps.length}, Duration: ${scenario.estimatedDuration}min, Level: ${scenario.automationLevel}`));
      });
    }
    
    if (options.verbose) {
      console.log(chalk.gray(`Step 2 completed in ${Date.now() - step2Start}ms`));
    }

    // Export context for Claude Code review if --generate-only mode
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
          totalScenarios: scenarios.length
        }
      };

      const exportedFiles = await exporter.exportFullContext(contextData, outputDir);
      
      console.log(chalk.green("✅ Context exported successfully!"));
      console.log(chalk.blue(`\n📁 Files created in ${outputDir}:`));
      exportedFiles.forEach(file => {
        console.log(`  • ${file}`);
      });

      console.log(chalk.blue(`\n🤖 Next steps:`));
      console.log(`  1. Review generated scenarios in: ${outputDir}/generated-scenarios.md`);
      console.log(`  2. Use Claude Code to refine scenarios based on full context`);
      console.log(`  3. Run: bun run start execute-scenarios --file <refined-scenarios.json>`);
      
      console.log(chalk.gray(`\n💡 AI Summary:`));
      console.log(chalk.gray(aiSummary));

      if (options.verbose) {
        console.log(chalk.gray(`Total execution time: ${Date.now() - startTime}ms`));
      }
      return;
    }
    
    // Step 3: Execute tests with shared execution service
    const executionService = new TestExecutionService();
    await executionService.executeTestScenarios({
      prAnalysis,
      jiraContext,
      confluencePages,
      scenarios,
      outputDir: outputDir,
      verbose: options.verbose
    });
    
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
  .option("--generate-only", "Generate scenarios and export context for Claude Code review")
  .option("--output <path>", "Output directory for test artifacts (default: ./{PR-number}-{commit-sha})")
  .option("--verbose", "Enable detailed logging")
  .action(executePRTest);