import { Command } from "commander";
import chalk from "chalk";
import inquirer from "inquirer";
import { mkdir, access, writeFile, chmod } from "fs/promises";
import { homedir } from "os";
import { ConfigService } from "../services/config";
import { InterpreterService } from "../services/interpreter";

interface Config {
  github: {
    token: string;
  };
  atlassian: {
    baseUrl: string;
    email: string;
    apiToken: string;
  };
  onyx?: {
    baseUrl: string;
    apiKey: string;
  };
  appSetupInstructions: string;
}

async function executeSetup(options: any) {
  console.log(chalk.blue("🚀 Testing Assistant Project Setup"));
  console.log(chalk.gray("=".repeat(40)));

  try {
    // Check if already set up
    const configDir = homedir() + "/.tap";
    const configExists = await access(configDir + "/config.json")
      .then(() => true)
      .catch(() => false);

    if (configExists && !options.force) {
      const { shouldContinue } = await inquirer.prompt([
        {
          type: "confirm",
          name: "shouldContinue",
          message: "TAP is already configured. Continue with setup?",
          default: false,
        },
      ]);

      if (!shouldContinue) {
        console.log(chalk.gray("Setup cancelled."));
        return;
      }
    }

    console.log(chalk.yellow("📝 Configuring TAP..."));

    // Ensure config directory exists
    await mkdir(configDir, { recursive: true });

    // Collect configuration
    const answers = await inquirer.prompt([
      {
        type: "password",
        name: "githubToken",
        message: "GitHub Personal Access Token (with repo permissions):",
        mask: "*",
      },
      {
        type: "input",
        name: "atlassianBaseUrl",
        message: "Atlassian Base URL (e.g., https://company.atlassian.net):",
      },
      {
        type: "input",
        name: "atlassianEmail",
        message: "Atlassian Email:",
      },
      {
        type: "password",
        name: "atlassianApiToken",
        message: "Atlassian API Token:",
        mask: "*",
      },
      {
        type: "editor",
        name: "appSetupInstructions",
        message: "App Setup Instructions (required - describe how to open/access your app for testing):\n",
        default: "Example:\n1. Navigate to https://myapp.com\n2. If logged out, use test account: testuser@company.com / TestPass123\n3. Click 'Dashboard' to access main features",
        validate: (input: string) => {
          if (!input.trim()) {
            return "App setup instructions are required. Please provide instructions for how to access your application for testing.";
          }
          return true;
        },
      },
      {
        type: "confirm",
        name: "useOnyx",
        message: "Configure Onyx AI for enhanced product context? (optional)",
        default: false,
      },
      {
        type: "input",
        name: "onyxBaseUrl",
        message: "Onyx Base URL (e.g., https://your-onyx.company.com):",
        default: "https://api.onyx.app",
        when: (answers) => answers.useOnyx,
      },
      {
        type: "password",
        name: "onyxApiKey",
        message: "Onyx AI API Key:",
        mask: "*",
        when: (answers) => answers.useOnyx,
      },
    ]);

    // Build config object
    const config: Config = {
      github: {
        token: answers.githubToken,
      },
      atlassian: {
        baseUrl: answers.atlassianBaseUrl,
        email: answers.atlassianEmail,
        apiToken: answers.atlassianApiToken,
      },
      appSetupInstructions: answers.appSetupInstructions,
    };

    // Add Onyx config if provided
    if (answers.useOnyx && answers.onyxApiKey) {
      config.onyx = {
        baseUrl: answers.onyxBaseUrl || "https://api.onyx.app",
        apiKey: answers.onyxApiKey,
      };
    }

    // Save config
    await writeFile(configDir + "/config.json", JSON.stringify(config, null, 2));
    await chmod(configDir + "/config.json", 0o600);

    console.log(chalk.green("✅ Configuration saved successfully!"));
    console.log(chalk.gray(`Config location: ${configDir}/config.json`));

    // Test connectivity
    const configService = ConfigService.getInstance();
    await configService.testConnectivity(config);

    // Set up Open Interpreter
    await setupOpenInterpreter(configService);

    console.log(chalk.green("🎉 Setup completed successfully!"));
    console.log("");
    console.log(chalk.blue("Next steps:"));
    console.log("  • Run 'tap test-pr <PR_URL>' to test a specific PR");
  } catch (error) {
    console.error(chalk.red("❌ Setup failed:"));
    console.error(error);
    process.exit(1);
  }
}

async function setupOpenInterpreter(configService: ConfigService): Promise<void> {
  console.log("");
  console.log(chalk.yellow("🤖 Setting up Open Interpreter..."));

  const interpreterService = InterpreterService.getInstance();

  try {
    // Check if already configured
    const interpreterPath = await interpreterService.resolveInterpreterPath();
    console.log(chalk.green(`✅ Open Interpreter found: ${interpreterPath}`));

    // Get and save current info
    const info = await interpreterService.getInterpreterInfo();
    if (info) {
      await configService.saveOpenInterpreterConfig(info);
      console.log(chalk.gray(`Version: ${info.version}`));
    }
    return;
  } catch {
    // Not found, proceed with installation
  }

  console.log(chalk.yellow("❌ Open Interpreter not found"));

  // Check if user wants to install
  const { shouldInstall } = await inquirer.prompt([
    {
      type: "confirm",
      name: "shouldInstall",
      message: "Install Open Interpreter with OS capabilities automatically?",
      default: true,
    },
  ]);

  if (!shouldInstall) {
    console.log(chalk.yellow("⚠️  Skipping Open Interpreter setup"));
    console.log(chalk.gray("You can install it manually later or set OPEN_INTERPRETER_PATH"));
    console.log(chalk.gray("See README.md for installation instructions"));
    return;
  }

  // Check prerequisites
  console.log(chalk.blue("🔍 Checking prerequisites..."));
  const prerequisites = await interpreterService.checkPrerequisites();

  if (!prerequisites.python311.available) {
    console.log(chalk.red("❌ Python 3.11 not found"));
    console.log(chalk.yellow("Please install Python 3.11 first:"));
    console.log(chalk.gray("  • macOS: brew install python@3.11"));
    console.log(chalk.gray("  • Ubuntu: sudo apt install python3.11"));
    console.log(chalk.gray("  • Or use pyenv: pyenv install 3.11.0 && pyenv global 3.11.0"));
    return;
  }

  if (!prerequisites.poetry.available) {
    console.log(chalk.red("❌ Poetry not found"));
    console.log(chalk.yellow("Please install Poetry first:"));
    console.log(chalk.gray("  curl -sSL https://install.python-poetry.org | python3 -"));
    console.log(chalk.gray("  Or see: https://python-poetry.org/docs/#installation"));
    return;
  }

  console.log(chalk.green(`✅ Python: ${prerequisites.python311.version}`));
  console.log(chalk.green(`✅ Poetry: ${prerequisites.poetry.version}`));

  // Install Open Interpreter
  try {
    console.log(chalk.blue("📦 Installing Open Interpreter with OS capabilities..."));
    console.log(chalk.gray("This may take a few minutes..."));

    const info = await interpreterService.installOpenInterpreter((message) => {
      console.log(chalk.gray(`  ${message}`));
    });

    // Save configuration
    await configService.saveOpenInterpreterConfig(info);

    console.log(chalk.green("✅ Open Interpreter installation completed!"));
    console.log(chalk.gray(`Installed at: ${info.path}`));
    console.log(chalk.gray(`Version: ${info.version}`));
  } catch (error) {
    console.error(chalk.red("❌ Failed to install Open Interpreter:"));
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    console.log(chalk.yellow("You can try manual installation or set OPEN_INTERPRETER_PATH"));
    console.log(chalk.gray("See README.md for installation instructions"));
  }
}

export const setupCommand = new Command("setup")
  .description("Set up Testing Assistant Project")
  .option("--force", "Force setup even if already configured")
  .action(executeSetup);
