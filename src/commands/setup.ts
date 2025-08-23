import { Command } from "commander";
import chalk from "chalk";
import inquirer from "inquirer";
import { mkdir, access, writeFile, chmod } from "fs/promises";
import { homedir } from "os";
import { ConfigService } from "../services/config";

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
}

async function executeSetup(options: any) {
  console.log(chalk.blue("🚀 Testing Assistant Project Setup"));
  console.log(chalk.gray("=".repeat(40)));

  try {
    // Check if already set up
    const configDir = homedir() + "/.tap";
    const configExists = await access(configDir + "/config.json").then(() => true).catch(() => false);
    
    if (configExists && !options.force) {
      const { shouldContinue } = await inquirer.prompt([{
        type: 'confirm',
        name: 'shouldContinue',
        message: 'TAP is already configured. Continue with setup?',
        default: false
      }]);
      
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
        type: 'password',
        name: 'githubToken',
        message: 'GitHub Personal Access Token (with repo permissions):',
        mask: '*'
      },
      {
        type: 'input',
        name: 'atlassianBaseUrl',
        message: 'Atlassian Base URL (e.g., https://company.atlassian.net):'
      },
      {
        type: 'input',
        name: 'atlassianEmail',
        message: 'Atlassian Email:'
      },
      {
        type: 'password',
        name: 'atlassianApiToken',
        message: 'Atlassian API Token:',
        mask: '*'
      },
      {
        type: 'confirm',
        name: 'useOnyx',
        message: 'Configure Onyx AI for enhanced product context? (optional)',
        default: false
      },
      {
        type: 'input',
        name: 'onyxBaseUrl',
        message: 'Onyx Base URL (e.g., https://your-onyx.company.com):',
        default: 'https://api.onyx.app',
        when: (answers) => answers.useOnyx
      },
      {
        type: 'password',
        name: 'onyxApiKey',
        message: 'Onyx AI API Key:',
        mask: '*',
        when: (answers) => answers.useOnyx
      }
    ]);

    // Build config object
    const config: Config = {
      github: {
        token: answers.githubToken
      },
      atlassian: {
        baseUrl: answers.atlassianBaseUrl,
        email: answers.atlassianEmail,
        apiToken: answers.atlassianApiToken
      }
    };

    // Add Onyx config if provided
    if (answers.useOnyx && answers.onyxApiKey) {
      config.onyx = {
        baseUrl: answers.onyxBaseUrl || 'https://api.onyx.app',
        apiKey: answers.onyxApiKey
      };
    }

    // Save config
    await writeFile(
      configDir + "/config.json",
      JSON.stringify(config, null, 2)
    );
    await chmod(configDir + "/config.json", 0o600);

    console.log(chalk.green("✅ Configuration saved successfully!"));
    console.log(chalk.gray(`Config location: ${configDir}/config.json`));
    
    // Test connectivity
    const configService = ConfigService.getInstance();
    await configService.testConnectivity(config);
    
    console.log(chalk.green("🎉 Setup completed successfully!"));
    console.log("");
    console.log(chalk.blue("Next steps:"));
    console.log("  • Run 'bun run start test-pr <PR_URL>' to test a specific PR");
    console.log("  • Run 'bun run start test-current-pr' to test the current branch");
    
  } catch (error) {
    console.error(chalk.red("❌ Setup failed:"));
    console.error(error);
    process.exit(1);
  }
}


export const setupCommand = new Command("setup")
  .description("Set up Testing Assistant Project")
  .option("--force", "Force setup even if already configured")
  .action(executeSetup);