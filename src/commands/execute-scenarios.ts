import { Command } from "commander";
import chalk from "chalk";
import inquirer from "inquirer";
import { ContextExporter } from "../services/context-exporter";
import { TestExecutionService } from "../services/test-execution";
import { ComputerUseService } from "../services/computer-use";
import { TestScenario } from "../services/ai-test-generator";
import { PRAnalysis } from "../services/github";
import { TicketContext, ConfluencePage } from "../services/atlassian";
import { OnyxContext } from "../services/onyx-context";
import { ConfigService } from "../services/config";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";

async function validateTestExecutionPrerequisites(verbose?: boolean): Promise<void> {
  try {
    // Validate CUA and Docker
    const cuaService = ComputerUseService.getInstance();
    await cuaService.validateAndReportExecutionReadiness(verbose);

    // Validate Anthropic API key
    const configService = ConfigService.getInstance();
    await configService.validateAnthropicApiKey(verbose);

    if (verbose) {
      console.log(chalk.green("✅ All prerequisites validated"));
    }
  } catch {
    // Services have already shown user-friendly messages
    // Just exit with error code
    process.exit(1);
  }
}

async function collectSetupInstructions(options: any): Promise<{
  baseSetupInstructions: string;
  prSpecificSetupInstructions?: string;
  sessionSetupInstructions?: string;
}> {
  // Get base app setup instructions from config
  const configService = ConfigService.getInstance();
  const baseSetupInstructions = await configService.getAppSetupInstructions();

  let prSpecificSetupInstructions: string | undefined;
  let sessionSetupInstructions: string | undefined;

  // Prompt for PR-specific setup if --instructions flag is used
  if (options.instructions) {
    console.log(chalk.yellow("📝 PR-Specific Setup Instructions"));
    const { prSetup } = await inquirer.prompt([
      {
        type: "editor",
        name: "prSetup",
        message: "Enter PR-specific setup instructions (or leave empty to skip):",
        default:
          "Example:\n• This PR requires running: npm run build\n• New feature flag: FEATURE_X=true\n• Test with port 3001 instead of 3000",
      },
    ]);

    if (prSetup.trim()) {
      prSpecificSetupInstructions = prSetup.trim();
    }
  }

  // Always prompt for session-specific setup
  console.log(chalk.yellow("🔧 Session Setup"));
  const { sessionSetup } = await inquirer.prompt([
    {
      type: "input",
      name: "sessionSetup",
      message: "Any additional setup needed for this test run? (press Enter to skip):",
      default: "",
    },
  ]);

  if (sessionSetup.trim()) {
    sessionSetupInstructions = sessionSetup.trim();
  }

  return {
    baseSetupInstructions,
    prSpecificSetupInstructions,
    sessionSetupInstructions,
  };
}

async function executeScenarios(options: any) {
  const startTime = Date.now();
  console.log(chalk.blue("🤖 TAP - Execute Test Scenarios"));
  console.log(chalk.gray("=".repeat(50)));

  if (!options.file) {
    console.error(chalk.red("❌ Error: --file parameter is required"));
    console.log(chalk.yellow("Usage: tap execute-scenarios --file <scenarios.json>"));
    process.exit(1);
  }

  // Determine output directory: use provided option or default to base directory of scenarios file
  if (!options.output) {
    options.output = dirname(options.file);
  }

  // Validate prerequisites before proceeding
  await validateTestExecutionPrerequisites(options.verbose);

  // Collect setup instructions
  console.log(chalk.yellow("📋 Collecting setup instructions..."));
  const setupInstructions = await collectSetupInstructions(options);

  if (options.verbose) {
    console.log(chalk.gray(`Verbose logging enabled`));
    console.log(chalk.gray(`Scenarios file: ${options.file}`));
    console.log(chalk.gray(`Output directory: ${options.output}`));
    console.log(chalk.gray(`Started at: ${new Date(startTime).toISOString()}`));
    console.log(
      chalk.gray(`Base setup: ${setupInstructions.baseSetupInstructions ? "Configured" : "None"}`)
    );
    console.log(
      chalk.gray(
        `PR-specific setup: ${setupInstructions.prSpecificSetupInstructions ? "Provided" : "None"}`
      )
    );
    console.log(
      chalk.gray(
        `Session setup: ${setupInstructions.sessionSetupInstructions ? "Provided" : "None"}`
      )
    );
  }

  try {
    // Step 1: Load test scenarios from file
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
        console.log(
          chalk.gray(
            `  ${i + 1}. ${scenario.title} (${scenario.priority} priority, ${scenario.category})`
          )
        );
        console.log(
          chalk.gray(
            `     Steps: ${scenario.steps.length}, Duration: ${scenario.estimatedDuration}min, Level: ${scenario.automationLevel}`
          )
        );
      });
    }

    if (scenarios.length === 0) {
      console.log(chalk.yellow("⚠️  No scenarios found in file"));
      process.exit(0);
    }

    // Step 2: Load original context files (from the same directory as scenarios file)
    const scenariosDir = dirname(options.file);
    const context = await loadOriginalContext(scenariosDir, options.verbose);

    // Step 3: Execute scenarios using shared execution service
    console.log(chalk.yellow("🤖 Executing test scenarios..."));
    const executionService = new TestExecutionService();
    const timeoutMinutes = parseFloat(options.timeout);
    await executionService.executeTestScenarios({
      prAnalysis: context.prAnalysis,
      jiraContext: context.jiraContext,
      confluencePages: context.confluencePages,
      onyxContext: context.onyxContext,
      scenarios,
      outputDir: options.output,
      verbose: options.verbose,
      setupInstructions,
      timeoutMinutes,
    });
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

async function loadOriginalContext(
  contextDir: string,
  verbose?: boolean
): Promise<{
  prAnalysis: PRAnalysis;
  jiraContext: TicketContext | null;
  confluencePages: ConfluencePage[];
  onyxContext: OnyxContext | null;
}> {
  if (verbose) {
    console.log(chalk.gray(`Loading original context from: ${contextDir}`));
  }

  // Load PR analysis (required)
  const prAnalysisPath = join(contextDir, "pr-analysis.json");
  let prAnalysis: PRAnalysis;

  if (existsSync(prAnalysisPath)) {
    const prAnalysisContent = await readFile(prAnalysisPath, "utf-8");
    prAnalysis = JSON.parse(prAnalysisContent);
    if (verbose) {
      console.log(chalk.gray(`✅ Loaded PR analysis: ${prAnalysis.title}`));
    }
  } else {
    // Create dummy PR analysis if not found
    prAnalysis = {
      url: "unknown",
      title: "Executed from refined scenarios",
      description: "Test execution from refined scenarios",
      author: "TAP",
      number: 0,
      branch: "unknown",
      baseBranch: "unknown",
      labels: [],
      commits: [],
      changedFiles: [],
      jiraTicketKeys: [],
    };
    if (verbose) {
      console.log(chalk.gray(`⚠️  PR analysis not found, using dummy data`));
    }
  }

  // Load Jira context (optional)
  const jiraContextPath = join(contextDir, "jira-context.json");
  let jiraContext: TicketContext | null = null;

  if (existsSync(jiraContextPath)) {
    const jiraContextContent = await readFile(jiraContextPath, "utf-8");
    jiraContext = JSON.parse(jiraContextContent);
    if (verbose) {
      console.log(chalk.gray(`✅ Loaded Jira context: ${jiraContext?.ticket.key}`));
    }
  } else if (verbose) {
    console.log(chalk.gray(`ℹ️  No Jira context found`));
  }

  // Load Confluence docs (optional)
  const confluenceDocsPath = join(contextDir, "confluence-docs.json");
  let confluencePages: ConfluencePage[] = [];

  if (existsSync(confluenceDocsPath)) {
    const confluenceDocsContent = await readFile(confluenceDocsPath, "utf-8");
    confluencePages = JSON.parse(confluenceDocsContent);
    if (verbose) {
      console.log(chalk.gray(`✅ Loaded ${confluencePages.length} Confluence pages`));
    }
  } else if (verbose) {
    console.log(chalk.gray(`ℹ️  No Confluence documentation found`));
  }

  // Load Onyx AI context (optional)
  const onyxContextPath = join(contextDir, "onyx-product-context.json");
  let onyxContext: OnyxContext | null = null;

  if (existsSync(onyxContextPath)) {
    const onyxContextContent = await readFile(onyxContextPath, "utf-8");
    onyxContext = JSON.parse(onyxContextContent);
    if (verbose) {
      console.log(
        chalk.gray(`✅ Loaded Onyx AI context with ${onyxContext?.responses.length || 0} insights`)
      );
    }
  } else if (verbose) {
    console.log(chalk.gray(`ℹ️  No Onyx AI product context found`));
  }

  return { prAnalysis, jiraContext, confluencePages, onyxContext };
}

export const executeScenariosCommand = new Command("execute-scenarios")
  .description("Execute test scenarios from a file using CUA (Computer Use Agent) with Docker")
  .option(
    "--file <path>",
    "Path to JSON file containing test scenarios (e.g., ./test-pr-{PR-number}-{commit-sha}/generated-scenarios.json)"
  )
  .option(
    "--output <path>",
    "Output directory for test artifacts (default: same directory as scenarios file)"
  )
  .option("--instructions", "Prompt for PR-specific setup instructions")
  .option("--timeout <minutes>", "Timeout for each scenario in minutes (default: 1)", "1")
  .option("--verbose", "Enable detailed logging")
  .action(executeScenarios);
