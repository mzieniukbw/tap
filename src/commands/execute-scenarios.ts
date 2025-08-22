import { Command } from "commander";
import chalk from "chalk";
import { ContextExporter } from "../services/context-exporter";
import { ClaudeDesktopOrchestrator } from "../services/claude-desktop";
import { QAReportGenerator } from "../services/qa-report";
import { TestScenario } from "../services/test-generator";

async function executeScenarios(options: any) {
  const startTime = Date.now();
  console.log(chalk.blue("🤖 TAP - Execute Test Scenarios"));
  console.log(chalk.gray("=".repeat(50)));
  
  if (!options.file) {
    console.error(chalk.red("❌ Error: --file parameter is required"));
    console.log(chalk.yellow("Usage: bun run start execute-scenarios --file <scenarios.json>"));
    process.exit(1);
  }

  if (options.verbose) {
    console.log(chalk.gray(`Verbose logging enabled`));
    console.log(chalk.gray(`Scenarios file: ${options.file}`));
    console.log(chalk.gray(`Output directory: ${options.output}`));
    console.log(chalk.gray(`Started at: ${new Date(startTime).toISOString()}`));
  }
  
  try {
    // Load test scenarios from file
    console.log(chalk.yellow("📄 Loading test scenarios..."));
    if (options.verbose) {
      console.log(chalk.gray(`Reading scenarios from: ${options.file}`));
    }
    
    const exporter = new ContextExporter();
    const scenarios: TestScenario[] = await exporter.loadScenariosFromFile(options.file);
    
    console.log(`Loaded ${scenarios.length} test scenarios`);
    
    if (options.verbose) {
      console.log(chalk.gray(`Scenarios loaded:`));
      scenarios.forEach((scenario, i) => {
        console.log(chalk.gray(`  ${i + 1}. ${scenario.title} (${scenario.priority} priority, ${scenario.category})`));
        console.log(chalk.gray(`     Steps: ${scenario.steps.length}, Duration: ${scenario.estimatedDuration}min, Level: ${scenario.automationLevel}`));
      });
    }

    if (scenarios.length === 0) {
      console.log(chalk.yellow("⚠️  No scenarios found in file"));
      process.exit(0);
    }

    // Execute scenarios
    console.log(chalk.yellow("🤖 Executing test scenarios..."));
    if (options.verbose) {
      console.log(chalk.gray(`Initializing Claude Desktop orchestrator...`));
      console.log(chalk.gray(`Output directory: ${options.output}`));
    }
    
    const orchestrator = new ClaudeDesktopOrchestrator();
    const results = await orchestrator.executeScenarios(scenarios, options.output);
    
    if (options.verbose) {
      console.log(chalk.gray(`Test execution completed`));
      console.log(chalk.gray(`Results: ${results.length} scenario results generated`));
    }
    
    // Generate QA report
    console.log(chalk.yellow("📋 Generating QA report..."));
    if (options.verbose) {
      console.log(chalk.gray(`Initializing QA report generator...`));
    }
    
    const reportGenerator = new QAReportGenerator();
    const report = await reportGenerator.generate({
      // Note: These would ideally come from the original context files
      prAnalysis: {
        title: "Executed from refined scenarios",
        description: `Executed ${scenarios.length} test scenarios`,
        author: "TAP",
        number: 0,
        branch: "unknown",
        baseBranch: "unknown",
        labels: [],
        commits: [],
        changedFiles: [],
        jiraTicketKeys: []
      },
      jiraContext: null,
      confluencePages: [],
      scenarios,
      results,
      outputDir: options.output
    });
    
    console.log(chalk.green("✅ Test execution complete!"));
    
    if (options.verbose) {
      console.log(chalk.gray(`Total execution time: ${Date.now() - startTime}ms`));
      console.log(chalk.gray(`Results summary:`));
      const passed = results.filter(r => r.status === 'passed').length;
      const failed = results.filter(r => r.status === 'failed').length;
      const warnings = results.filter(r => r.status === 'warning').length;
      console.log(chalk.gray(`  - Passed: ${passed}`));
      console.log(chalk.gray(`  - Failed: ${failed}`));
      console.log(chalk.gray(`  - Warnings: ${warnings}`));
    }
    
    console.log(chalk.gray("\n📋 QA Report:"));
    console.log(report);
    
  } catch (error) {
    console.error(chalk.red("❌ Error during scenario execution:"));
    if (options.verbose) {
      console.error(chalk.gray(`Error occurred at: ${new Date().toISOString()}`));
      console.error(chalk.gray(`Total runtime before error: ${Date.now() - startTime}ms`));
      console.error(chalk.gray(`Scenarios file: ${options.file}`));
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

export const executeScenariosCommand = new Command("execute-scenarios")
  .description("Execute test scenarios from a file")
  .option("--file <path>", "Path to JSON file containing test scenarios")
  .option("--output <path>", "Output directory for test artifacts", "./tap-output")
  .option("--verbose", "Enable detailed logging")
  .action(executeScenarios);