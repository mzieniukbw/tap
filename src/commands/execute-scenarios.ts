import { Command } from "commander";
import chalk from "chalk";
import inquirer from "inquirer";
import { ContextExporter } from "../services/context-exporter";
import { TestExecutionService } from "../services/test-execution";
import { InterpreterService } from "../services/interpreter";
import { TestScenario } from "../services/ai-test-generator";
import { PRAnalysis } from "../services/github";
import { TicketContext, ConfluencePage } from "../services/atlassian";
import { OnyxContext } from "../services/onyx-context";
import { ConfigService } from "../services/config";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";

async function validateTestExecutionPrerequisites(verbose?: boolean): Promise<void> {
  if (verbose) {
    console.log(chalk.yellow("🔍 Validating test execution prerequisites..."));
  }

  // 1. Check if Open Interpreter is available
  const interpreterService = InterpreterService.getInstance();
  try {
    const interpreterPath = await interpreterService.resolveInterpreterPath();
    if (verbose) {
      console.log(chalk.green(`  ✅ Open Interpreter found: ${interpreterPath}`));

      const info = await interpreterService.getInterpreterInfo();
      if (info) {
        console.log(chalk.gray(`     Version: ${info.version}`));
      }
    }
  } catch (error) {
    console.error(chalk.red("❌ Open Interpreter not found"));
    console.log(chalk.yellow("Open Interpreter with OS capabilities is required."));
    console.log(chalk.gray("Solutions:"));
    console.log(chalk.gray("  1. Run 'tap setup' to install automatically"));
    console.log(chalk.gray("  2. Set OPEN_INTERPRETER_PATH environment variable"));
    console.log(chalk.gray("  3. See README.md for manual installation instructions"));
    console.log(chalk.gray(""));
    console.log(
      chalk.gray("Error details: " + (error instanceof Error ? error.message : String(error)))
    );
    process.exit(1);
  }

  // 2. Check if ANTHROPIC_API_KEY is configured

  // Check environment variable first
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
    console.error(chalk.red("❌ ANTHROPIC_API_KEY not found"));
    console.log(chalk.yellow("Open Interpreter requires an Anthropic API key for test execution."));
    console.log(chalk.yellow("Please set your API key:"));
    console.log(chalk.gray("  export ANTHROPIC_API_KEY=your_api_key_here"));
    console.log(chalk.gray("Or add it to your shell profile (~/.bashrc, ~/.zshrc, etc.)"));
    console.log(chalk.gray("Get your API key from: https://console.anthropic.com/"));
    process.exit(1);
  }

  if (verbose) {
    console.log(chalk.green("  ✅ ANTHROPIC_API_KEY configured"));
    console.log(chalk.green("✅ All prerequisites validated"));
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

  // Prompt for PR-specific setup if --setup flag is used
  if (options.setup) {
    console.log(chalk.yellow("📝 PR-Specific Setup Instructions"));
    const { prSetup } = await inquirer.prompt([
      {
        type: "editor",
        name: "prSetup",
        message: "Enter PR-specific setup instructions (or leave empty to skip):",
        default: "Example:\n• This PR requires running: npm run build\n• New feature flag: FEATURE_X=true\n• Test with port 3001 instead of 3000",
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

async function generatePROutputDirectory(scenariosFile: string): Promise<string | null> {
  try {
    const scenariosDir = dirname(scenariosFile);
    const prAnalysisPath = join(scenariosDir, "pr-analysis.json");
    
    if (existsSync(prAnalysisPath)) {
      const prAnalysisContent = await readFile(prAnalysisPath, "utf-8");
      const prAnalysis: PRAnalysis = JSON.parse(prAnalysisContent);
      
      // Extract commit SHA from commits array (same logic as test-pr command)
      const lastCommitSha = prAnalysis.commits[prAnalysis.commits.length - 1]?.sha.substring(0, 7) || "unknown";
      return `./test-pr-${prAnalysis.number}-${lastCommitSha}`;
    }
  } catch (error) {
    // If we can't read pr-analysis.json, return null
    return null;
  }
  return null;
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

  // Determine output directory: use provided option or generate from PR analysis
  if (!options.output) {
    const prOutputDir = await generatePROutputDirectory(options.file);
    if (!prOutputDir) {
      console.error(chalk.red("❌ Error: Cannot determine output directory"));
      console.error(chalk.yellow("Either provide --output <path> or ensure pr-analysis.json exists in the output directory"));
      process.exit(1);
    }
    options.output = prOutputDir;
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
    console.log(chalk.gray(`Base setup: ${setupInstructions.baseSetupInstructions ? 'Configured' : 'None'}`));
    console.log(chalk.gray(`PR-specific setup: ${setupInstructions.prSpecificSetupInstructions ? 'Provided' : 'None'}`));
    console.log(chalk.gray(`Session setup: ${setupInstructions.sessionSetupInstructions ? 'Provided' : 'None'}`));
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
    await executionService.executeTestScenarios({
      prAnalysis: context.prAnalysis,
      jiraContext: context.jiraContext,
      confluencePages: context.confluencePages,
      onyxContext: context.onyxContext,
      scenarios,
      outputDir: options.output,
      verbose: options.verbose,
      setupInstructions,
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
  .description("Execute test scenarios from a file using Open Interpreter (requires 'os' extra)")
  .option("--file <path>", "Path to JSON file containing test scenarios")
  .option("--output <path>", "Output directory for test artifacts (default: auto-detected from pr-analysis.json)")
  .option("--setup", "Prompt for session-specific setup instructions")
  .option("--verbose", "Enable detailed logging")
  .action(executeScenarios);
