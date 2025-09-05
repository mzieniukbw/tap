import { Command } from "commander";
import chalk from "chalk";
import inquirer from "inquirer";
import { ConfigFieldName, ConfigService } from "../services/config";
import { InterpreterService } from "../services/interpreter";

interface Config {
  github?: {
    token?: string;
  };
  atlassian?: {
    baseUrl?: string;
    email?: string;
    apiToken?: string;
  };
  onyx?: {
    baseUrl?: string;
    apiKey?: string;
  };
  appSetupInstructions?: string;
  anthropicApiKey?: string;
}

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
        const promptConfig: any = {
          type:
            status.fromConfig && config.field === "appSetupInstructions"
              ? "input"
              : config.promptType,
          name: config.field,
          message: status.fromConfig
            ? `${config.defaultMessage}: ${status.currentValue} [Press Enter to keep, or ${config.field === "appSetupInstructions" ? "'edit' to modify" : "type new value"}]:`
            : config.message,
          default: status.fromConfig ? "" : config.defaultValue,
          filter: (input: string) => {
            if (input.trim() === "" && status.fromConfig) {
              return "KEEP_CURRENT";
            }
            if (
              input.trim() === "edit" &&
              status.fromConfig &&
              config.field === "appSetupInstructions"
            ) {
              return "EDIT_CURRENT";
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
            if (
              status.fromConfig &&
              input.trim() === "edit" &&
              config.field === "appSetupInstructions"
            ) {
              return true; // Will trigger editor
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

    // Handle Onyx Base URL separately since it depends on API key
    const onyxBaseUrlStatusSeparate = await configService.getFieldStatus("onyxBaseUrl");
    if (!onyxBaseUrlStatusSeparate.fromEnv) {
      prompts.push({
        type: "input",
        name: "onyxBaseUrl",
        message: onyxBaseUrlStatusSeparate.fromConfig
          ? `Onyx Base URL: ${onyxBaseUrlStatusSeparate.currentValue} [Press Enter to keep, or type new value]:`
          : "Onyx Base URL (e.g., https://your-onyx.company.com):",
        default: onyxBaseUrlStatusSeparate.fromConfig ? "" : "https://api.onyx.app",
        filter: (input: string) =>
          input.trim() === "" && onyxBaseUrlStatusSeparate.fromConfig ? "KEEP_CURRENT" : input,
        when: (answers: any) =>
          answers.onyxApiKey && answers.onyxApiKey !== "" && answers.onyxApiKey !== "KEEP_CURRENT",
      });
    }

    // Run all prompts
    if (prompts.length > 0) {
      const promptAnswers = await inquirer.prompt(prompts);
      Object.assign(answers, promptAnswers);
    }

    // Handle special case for app setup instructions "edit" trigger
    if (answers.appSetupInstructions === "EDIT_CURRENT") {
      const configFileValues = await configService.getConfigFileValues();
      const currentInstructions = configFileValues?.appSetupInstructions || "";

      const { editedInstructions } = await inquirer.prompt([
        {
          type: "editor",
          name: "editedInstructions",
          message: "Edit your app setup instructions:",
          default: currentInstructions,
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

    // Get existing config file values to merge with new values
    const existingConfig = (await configService.getConfigFileValues()) || {};

    // Helper function to get field value (either from answers or existing config)
    const getFieldValue = (field: ConfigFieldName, answerKey: string): string => {
      const answerValue = answers[answerKey];
      if (answerValue === "KEEP_CURRENT") {
        // Get value from existing config based on field path
        switch (field) {
          case "githubToken":
            return existingConfig.github?.token || "";
          case "atlassianBaseUrl":
            return existingConfig.atlassian?.baseUrl || "";
          case "atlassianEmail":
            return existingConfig.atlassian?.email || "";
          case "atlassianApiToken":
            return existingConfig.atlassian?.apiToken || "";
          case "appSetupInstructions":
            return existingConfig.appSetupInstructions || "";
          case "anthropicApiKey":
            return existingConfig.anthropicApiKey || "";
          case "onyxApiKey":
            return existingConfig.onyx?.apiKey || "";
          case "onyxBaseUrl":
            return existingConfig.onyx?.baseUrl || "https://api.onyx.app";
          default:
            return "";
        }
      }
      return answerValue || "";
    };

    // Build config from answers first
    const tempConfig: Config = {
      github: answers.githubToken
        ? { token: getFieldValue("githubToken", "githubToken") }
        : undefined,
      atlassian:
        answers.atlassianBaseUrl || answers.atlassianEmail || answers.atlassianApiToken
          ? {
              baseUrl: answers.atlassianBaseUrl
                ? getFieldValue("atlassianBaseUrl", "atlassianBaseUrl")
                : undefined,
              email: answers.atlassianEmail
                ? getFieldValue("atlassianEmail", "atlassianEmail")
                : undefined,
              apiToken: answers.atlassianApiToken
                ? getFieldValue("atlassianApiToken", "atlassianApiToken")
                : undefined,
            }
          : undefined,
      appSetupInstructions: answers.appSetupInstructions
        ? getFieldValue("appSetupInstructions", "appSetupInstructions")
        : undefined,
      anthropicApiKey: answers.anthropicApiKey
        ? getFieldValue("anthropicApiKey", "anthropicApiKey")
        : undefined,
      onyx:
        answers.onyxApiKey || answers.onyxBaseUrl
          ? {
              baseUrl: answers.onyxBaseUrl
                ? getFieldValue("onyxBaseUrl", "onyxBaseUrl") || "https://api.onyx.app"
                : undefined,
              apiKey: answers.onyxApiKey ? getFieldValue("onyxApiKey", "onyxApiKey") : undefined,
            }
          : undefined,
    };

    // Clean up undefined fields first
    Object.keys(tempConfig).forEach((key) => {
      if (tempConfig[key as keyof Config] === undefined) {
        delete tempConfig[key as keyof Config];
      }
    });

    // Clean up nested undefined fields
    if (tempConfig.atlassian) {
      Object.keys(tempConfig.atlassian).forEach((key) => {
        if (tempConfig.atlassian![key as keyof typeof tempConfig.atlassian] === undefined) {
          delete tempConfig.atlassian![key as keyof typeof tempConfig.atlassian];
        }
      });
    }

    if (tempConfig.onyx) {
      Object.keys(tempConfig.onyx).forEach((key) => {
        if (tempConfig.onyx![key as keyof typeof tempConfig.onyx] === undefined) {
          delete tempConfig.onyx![key as keyof typeof tempConfig.onyx];
        }
      });
    }

    // Save config using centralized method (automatically filters env variables)
    const configFile = await ConfigService.writeConfigFile(tempConfig);

    console.log(chalk.green("✅ Configuration saved successfully!"));
    console.log(chalk.gray("Config location: " + configFile));

    // Test connectivity - create a complete config object for testing
    const testConfig = await configService.getConfig();
    await configService.testConnectivity(testConfig);

    // Set up Open Interpreter
    await setupOpenInterpreter(configService);

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
