import { Command } from "commander";
import chalk from "chalk";
import inquirer from "inquirer";
import { ConfigFieldName, ConfigService, TapConfig } from "../services/config";
import { InterpreterService } from "../services/interpreter";

async function executeSetup() {
  console.log(chalk.blue("🚀 Testing Assistant Project Setup"));
  console.log(chalk.gray("=".repeat(40)));

  try {
    const configService = ConfigService.getInstance();

    console.log(chalk.yellow("📝 Configuring TAP..."));

    // Collect configuration with smart detection
    const answers: any = {};
    const prompts: any[] = [];

    // Define field configurations to iterate over
    const fieldConfigs: Array<{
      field: ConfigFieldName;
      displayName: string;
      promptType: "input" | "password" | "editor";
      message: string;
      defaultMessage: string;
      mask?: string;
      defaultValue?: string;
      validate?: (input: string) => boolean | string;
      when?: (answers: any) => boolean;
    }> = [
      {
        field: "githubToken",
        displayName: "GitHub token",
        promptType: "password",
        message: "GitHub Personal Access Token (with repo permissions):",
        defaultMessage: "GitHub Personal Access Token",
        mask: "*",
      },
      {
        field: "atlassianBaseUrl",
        displayName: "Atlassian Base URL",
        promptType: "input",
        message: "Atlassian Base URL (e.g., https://company.atlassian.net):",
        defaultMessage: "Atlassian Base URL",
      },
      {
        field: "atlassianEmail",
        displayName: "Atlassian Email",
        promptType: "input",
        message: "Atlassian Email:",
        defaultMessage: "Atlassian Email",
      },
      {
        field: "atlassianApiToken",
        displayName: "Atlassian API Token",
        promptType: "password",
        message: "Atlassian API Token:",
        defaultMessage: "Atlassian API Token",
        mask: "*",
      },
      {
        field: "appSetupInstructions",
        displayName: "App Setup Instructions",
        promptType: "editor",
        message:
          "App Setup Instructions (required - describe how to open/access your app for testing):\n",
        defaultMessage: "App Setup Instructions",
        defaultValue:
          "Example:\n1. Navigate to https://myapp.com\n2. If logged out, use test account: testuser@company.com / TestPass123\n3. Click 'Dashboard' to access main features",
        validate: (input: string) => {
          if (!input.trim()) {
            return "App setup instructions are required. Please provide instructions for how to access your application for testing.";
          }
          return true;
        },
      },
      {
        field: "anthropicApiKey",
        displayName: "Anthropic API Key",
        promptType: "password",
        message: "Anthropic API Key (optional - for test execution):",
        defaultMessage: "Anthropic API Key",
        mask: "*",
      },
      {
        field: "onyxBaseUrl",
        displayName: "Onyx Base URL",
        promptType: "input",
        message: "Onyx Base URL (e.g., https://your-onyx.company.com):",
        defaultMessage: "Onyx Base URL",
        defaultValue: "https://api.onyx.app",
      },
      {
        field: "onyxApiKey",
        displayName: "Onyx AI API Key",
        promptType: "password",
        message: "Onyx AI API Key (optional - for enhanced product context):",
        defaultMessage: "Onyx AI API Key",
        mask: "*",
      },
    ];

    // Process each field configuration
    for (const config of fieldConfigs) {
      const status = await configService.getFieldStatus(config.field);

      if (status.fromEnv) {
        console.log(
          chalk.green(`✅ ${config.displayName}: Using ${status.envVarName} environment variable`)
        );
      } else {
        // Special flag for appSetupInstructions - handle after regular prompts
        if (config.field === "appSetupInstructions" && status.fromConfig) {
          // Mark for special handling but don't prompt yet
          answers._appSetupInstructionsNeedsSpecialHandling = {
            currentValue: status.currentValue,
            defaultMessage: config.defaultMessage,
            config: config,
          };
        } else {
          // Regular prompt handling for all other fields
          const promptConfig: any = {
            type: config.promptType,
            name: config.field,
            message: status.fromConfig
              ? `${config.defaultMessage}: ${status.currentValue} [Press Enter to keep, or type new value]:`
              : config.message,
            default: status.fromConfig ? "" : config.defaultValue,
            filter: (input: string) => {
              if (input.trim() === "" && status.fromConfig) {
                return "KEEP_CURRENT";
              }
              return input;
            },
          };

          if (config.mask) {
            promptConfig.mask = config.mask;
          }

          if (config.validate) {
            promptConfig.validate = (input: string) => {
              if (status.fromConfig && input.trim() === "") {
                return true; // Keep current value
              }
              return config.validate!(input);
            };
          }

          if (config.when) {
            promptConfig.when = config.when;
          }

          prompts.push(promptConfig);
        }
      }
    }

    // Run all prompts
    if (prompts.length > 0) {
      const promptAnswers = await inquirer.prompt(prompts);
      Object.assign(answers, promptAnswers);
    }

    // Handle appSetupInstructions special case in proper order
    if (answers._appSetupInstructionsNeedsSpecialHandling) {
      const special = answers._appSetupInstructionsNeedsSpecialHandling;
      delete answers._appSetupInstructionsNeedsSpecialHandling; // Clean up temp flag

      const { action } = await inquirer.prompt([
        {
          type: "list",
          name: "action",
          message: `${special.defaultMessage}: ${special.currentValue}`,
          choices: [
            { name: "Keep current instructions", value: "keep" },
            { name: "Edit instructions", value: "edit" },
          ],
        },
      ]);

      if (action === "keep") {
        answers.appSetupInstructions = "KEEP_CURRENT";
      } else {
        // edit - use inquirer editor with waitForUseInput: false
        const { editedInstructions } = await inquirer.prompt([
          {
            type: "editor",
            name: "editedInstructions",
            message: "Edit your app setup instructions:",
            default: special.currentValue,
            waitForUseInput: false,
            validate: (input: string) => {
              if (!input.trim()) {
                return "App setup instructions are required. Please provide instructions for how to access your application for testing.";
              }
              return true;
            },
          },
        ]);
        answers.appSetupInstructions = editedInstructions;
      }
    }

    // Get existing config file values to merge with new values
    const existingConfig = (await configService.getConfigFileValues()) || {};

    // Helper function to get field value (either from answers or existing config)
    const getFieldValue = (field: ConfigFieldName, answerKey: string): string => {
      const answerValue = answers[answerKey];
      if (answerValue === "KEEP_CURRENT") {
        // Direct access to flat config fields
        return existingConfig[field] || (field === "onyxBaseUrl" ? "https://api.onyx.app" : "");
      }
      return answerValue || "";
    };

    // Build config from answers (flat structure)
    const tempConfig: Partial<TapConfig> = {};

    if (answers.githubToken) {
      tempConfig.githubToken = getFieldValue("githubToken", "githubToken");
    }
    if (answers.atlassianBaseUrl) {
      tempConfig.atlassianBaseUrl = getFieldValue("atlassianBaseUrl", "atlassianBaseUrl");
    }
    if (answers.atlassianEmail) {
      tempConfig.atlassianEmail = getFieldValue("atlassianEmail", "atlassianEmail");
    }
    if (answers.atlassianApiToken) {
      tempConfig.atlassianApiToken = getFieldValue("atlassianApiToken", "atlassianApiToken");
    }
    if (answers.appSetupInstructions) {
      tempConfig.appSetupInstructions = getFieldValue(
        "appSetupInstructions",
        "appSetupInstructions"
      );
    }
    if (answers.anthropicApiKey) {
      tempConfig.anthropicApiKey = getFieldValue("anthropicApiKey", "anthropicApiKey");
    }
    if (answers.onyxApiKey) {
      tempConfig.onyxApiKey = getFieldValue("onyxApiKey", "onyxApiKey");
    }
    if (answers.onyxBaseUrl) {
      tempConfig.onyxBaseUrl = getFieldValue("onyxBaseUrl", "onyxBaseUrl");
    }

    // Save config using centralized method (automatically filters env variables)
    const configFile = await ConfigService.writeConfigFile(tempConfig);

    console.log(chalk.green("✅ Configuration saved successfully!"));
    console.log(chalk.gray("Config location: " + configFile));

    // Test connectivity - create a complete config object for testing
    const testConfig = await configService.getConfig();
    await configService.testConnectivity(testConfig);

    // Check if Open Interpreter installation is needed
    await offerOpenInterpreterInstallation();

    console.log(chalk.green("🎉 Setup completed successfully!"));
    console.log("");
    console.log(chalk.blue("Next steps:"));
    console.log("  • Run 'tap generate-tests <PR_URL>' to generate test scenarios for a PR");
  } catch (error) {
    console.error(chalk.red("❌ Setup failed:"));
    console.error(error);
    process.exit(1);
  }
}

async function offerOpenInterpreterInstallation(): Promise<void> {
  const interpreterService = InterpreterService.getInstance();

  try {
    // Check if already available
    await interpreterService.resolveInterpreterPath();
    // If we get here, it's already available
    return;
  } catch {
    // Not found, offer installation
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

    const installedPath = await interpreterService.installOpenInterpreter((message) => {
      console.log(chalk.gray(`  ${message}`));
    });

    console.log(chalk.green("✅ Open Interpreter installation completed!"));
    console.log(chalk.gray(`Installed at: ${installedPath}`));
  } catch (error) {
    console.error(chalk.red("❌ Failed to install Open Interpreter:"));
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    console.log(chalk.yellow("You can try manual installation or set OPEN_INTERPRETER_PATH"));
    console.log(chalk.gray("See README.md for installation instructions"));
  }
}

export const setupCommand = new Command("setup")
  .description("Set up Testing Assistant Project")
  .action(executeSetup);
