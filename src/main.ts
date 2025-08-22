#!/usr/bin/env -S deno run --allow-all

import { Command } from "@cliffy/command";
import { TestPRCommand } from "./commands/test-pr.ts";
import { TestCurrentPRCommand } from "./commands/test-current-pr.ts";
import { SetupCommand } from "./commands/setup.ts";

const TAP_VERSION = "1.0.0";

await new Command()
  .name("tap")
  .version(TAP_VERSION)
  .description("Testing Assistant Project - Automated testing scenarios from GitHub PRs and Jira tickets")
  .globalOption("-v, --verbose", "Enable verbose output")
  .globalOption("--config <path:string>", "Path to config file", {
    default: Deno.env.get("HOME") + "/.tap/config.json"
  })
  .command("test-pr", new TestPRCommand())
  .command("test-current-pr", new TestCurrentPRCommand())
  .command("setup", new SetupCommand())
  .parse(Deno.args);