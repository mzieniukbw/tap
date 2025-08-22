import { Command } from "commander";
import { testPRCommand } from "./commands/test-pr";
import { testCurrentPRCommand } from "./commands/test-current-pr";
import { setupCommand } from "./commands/setup";
import { homedir } from "os";

const TAP_VERSION = "1.0.0";

const program = new Command()
  .name("tap")
  .version(TAP_VERSION)
  .description("Testing Assistant Project - Automated testing scenarios from GitHub PRs and Jira tickets")
  .option("-v, --verbose", "Enable verbose output")
  .option("--config <path>", "Path to config file", homedir() + "/.tap/config.json");

program.addCommand(testPRCommand);
program.addCommand(testCurrentPRCommand);
program.addCommand(setupCommand);

program.parse();