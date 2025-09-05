import { Command } from "commander";
import { generateTestsCommand } from "./commands/generate-tests";
import { executeScenariosCommand } from "./commands/execute-scenarios";
import { setupCommand } from "./commands/setup";
import { ConfigService } from "./services/config";
import { homedir } from "os";
import chalk from "chalk";

const TAP_VERSION = "1.1.0";

const program = new Command()
  .name("tap")
  .version(TAP_VERSION)
  .description(
    "Testing Assistant Project - Automated testing scenarios from GitHub PRs and Jira tickets"
  )
  .option("--config <path>", "Path to config file", homedir() + "/.tap/config.json");

program.addCommand(generateTestsCommand);
program.addCommand(executeScenariosCommand);
program.addCommand(setupCommand);

// Hook to run connectivity test before any command (except setup)
program.hook("preAction", async (thisCommand) => {
  const commandName = thisCommand.name();

  // Skip connectivity test for setup command
  if (commandName === "setup") {
    return;
  }

  try {
    const configService = ConfigService.getInstance();
    await configService.testConnectivity();
  } catch (error) {
    if (error instanceof Error && error.message.includes("No configuration found")) {
      console.log(chalk.red("❌ Configuration not found."));
      console.log(chalk.yellow("Please run 'tap setup' to configure TAP."));
      process.exit(1);
    } else {
      console.log(chalk.yellow("⚠️  Connectivity test failed, but continuing..."));
    }
  }
});

program.parse();
