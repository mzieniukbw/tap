import { Command } from "commander";
import chalk from "chalk";
import { existsSync } from "fs";
import { ContextGatheringService } from "../services/context-gathering";
import { AITestScenarioGenerator } from "../services/ai-test-generator";
import { ContextExporter } from "../services/context-exporter";
import { GitHubService } from "../services/github";

async function executeGenerateTests(prUrl: string, options: any) {
  const startTime = Date.now();
  console.log(chalk.blue("🔍 Testing Assistant Project - Test Generation"));
  console.log(chalk.gray("=".repeat(50)));

  if (options.verbose) {
    console.log(chalk.gray(`Verbose logging enabled`));
    console.log(chalk.gray(`PR URL: ${prUrl}`));
    console.log(chalk.gray(`Options:`, JSON.stringify(options, null, 2)));
    console.log(chalk.gray(`Started at: ${new Date(startTime).toISOString()}`));
  }

  try {
    // Get basic PR info (GitHub API only) to determine output directory before expensive context gathering
    const githubService = new GitHubService();
    const prAnalysis = await githubService.analyzePR(prUrl);

    // Generate output directory name and check if it exists early
    const lastCommitSha =
      prAnalysis.commits[prAnalysis.commits.length - 1]?.sha.substring(0, 7) || "unknown";
    const outputDir = options.output
      ? options.output
      : `./test-pr-${prAnalysis.number}-${lastCommitSha}`;

    // Check if output directory already exists to prevent accidental re-runs
    if (existsSync(outputDir)) {
      console.error(chalk.red(`❌ Output directory already exists: ${outputDir}`));
      console.error(chalk.yellow(`To prevent accidental re-runs, please:`));
      console.error(`  • Remove the existing directory: rm -rf ${outputDir}`);
      console.error(`  • Or specify a different output path: --output <new-path>`);
      process.exit(1);
    }

    // Now gather expensive context (Jira, Confluence, Onyx AI) after directory validation
    const contextService = new ContextGatheringService();
    const contextResult = await contextService.gatherPRContext({
      verbose: options.verbose,
      prAnalysis,
    });

    const { jiraContext, confluencePages, onyxContext } = contextResult;

    // Step 2: Generate test scenarios with AI
    console.log(chalk.yellow("🧪 Generating AI test scenarios..."));

    if (options.verbose) {
      console.log(chalk.gray(`Using Claude CLI for intelligent test generation...`));
    }

    const step2Start = Date.now();
    let scenarios;
    let aiSummary = "";

    try {
      const aiGenerator = new AITestScenarioGenerator();
      scenarios = await aiGenerator.generateScenarios({
        prAnalysis,
        jiraContext,
        confluencePages,
        onyxContext,
      });

      aiSummary = await aiGenerator.generateTestSummary(scenarios, {
        prAnalysis,
        jiraContext,
        confluencePages,
        onyxContext,
      });

      console.log(`🤖 AI-generated ${scenarios.length} intelligent test scenarios`);

      if (options.verbose) {
        console.log(
          chalk.gray(`AI generation successful - scenarios based on full context analysis`)
        );
      }
    } catch (aiError) {
      console.error(chalk.red("❌ AI test generation failed:"));
      if (options.verbose) {
        console.error(
          chalk.gray(`Error: ${aiError instanceof Error ? aiError.message : String(aiError)}`)
        );
        console.error(chalk.gray(`Make sure Claude CLI is installed and authenticated:`));
        console.error(chalk.gray(`  npm install -g @anthropic-ai/claude-cli`));
        console.error(chalk.gray(`  claude auth`));
      }
      throw aiError;
    }

    if (options.verbose && scenarios.length > 0) {
      console.log(chalk.gray(`Test scenarios generated:`));
      scenarios.forEach((scenario, i) => {
        console.log(
          chalk.gray(
            `  ${i + 1}. ${scenario.title} (${scenario.priority} priority, ${scenario.category})`
          )
        );
        console.log(chalk.gray(`     ${scenario.description}`));
        console.log(
          chalk.gray(
            `     Steps: ${scenario.steps.length}, Duration: ${scenario.estimatedDuration}min, Level: ${scenario.automationLevel}`
          )
        );
      });
    }

    if (options.verbose) {
      console.log(chalk.gray(`Step 2 completed in ${Date.now() - step2Start}ms`));
    }

    // Export context for Claude Code review
    console.log(chalk.yellow("📤 Exporting context for Claude Code review..."));

    const exporter = new ContextExporter();
    const contextData = {
      prAnalysis,
      jiraContext,
      confluencePages,
      onyxContext,
      generatedScenarios: scenarios,
      aiSummary,
      metadata: {
        exportedAt: new Date().toISOString(),
        tapVersion: "1.1.0",
        totalScenarios: scenarios.length,
      },
    };

    const exportedFiles = await exporter.exportFullContext(contextData, outputDir);

    console.log(chalk.green("✅ Context exported successfully!"));
    console.log(chalk.blue(`\n📁 Files created in ${outputDir}:`));
    exportedFiles.forEach((file) => {
      console.log(`  • ${file}`);
    });

    console.log(chalk.blue(`\n🚀 Next step:`));
    console.log(
      `  Execute your test scenarios: ${chalk.cyan(`tap execute-scenarios --file ${outputDir}/refined-scenarios.json`)}`
    );
    console.log(chalk.gray(`\n💡 Optional: Use Claude Code to refine scenarios first:`));
    console.log(chalk.gray(`  Run: ${outputDir}/claude-refine.sh`));

    console.log(chalk.gray(`\n💡 AI Summary:`));
    console.log(chalk.gray(aiSummary));

    if (options.verbose) {
      console.log(chalk.gray(`Total execution time: ${Date.now() - startTime}ms`));
    }
  } catch (error) {
    console.error(chalk.red("❌ Error during test generation:"));
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

export const generateTestsCommand = new Command("generate-tests")
  .description("Generate AI test scenarios from a GitHub PR (no execution)")
  .argument("<pr-url>", "GitHub PR URL")
  .option(
    "--output <path>",
    "Output directory for test artifacts (default: ./test-pr-{PR-number}-{commit-sha})"
  )
  .option("--setup", "Prompt for PR-specific setup instructions")
  .option("--verbose", "Enable detailed logging")
  .action(executeGenerateTests);
