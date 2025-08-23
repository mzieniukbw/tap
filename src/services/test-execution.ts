import chalk from "chalk";
import { PRAnalysis } from "./github";
import { TicketContext, ConfluencePage } from "./atlassian";
import { TestScenario } from "./ai-test-generator";
import { ClaudeDesktopOrchestrator, TestResult } from "./claude-desktop";
import { QAReportGenerator } from "./qa-report";
import { OnyxContext } from "./onyx-context";

export interface TestExecutionContext {
  prAnalysis: PRAnalysis;
  jiraContext?: TicketContext | null;
  confluencePages: ConfluencePage[];
  onyxContext?: OnyxContext | null;
  scenarios: TestScenario[];
  outputDir: string;
  verbose?: boolean;
}

export class TestExecutionService {
  async executeTestScenarios(context: TestExecutionContext): Promise<void> {
    const {
      scenarios,
      outputDir,
      verbose,
      prAnalysis,
      jiraContext,
      confluencePages,
      onyxContext,
    } = context;
    const startTime = Date.now();

    // Step 1: Execute tests with Claude Desktop
    console.log(chalk.yellow("🤖 Executing tests with Claude Desktop..."));
    if (verbose) {
      console.log(chalk.gray(`Initializing Claude Desktop orchestrator...`));
      console.log(chalk.gray(`Output directory: ${outputDir}`));
      console.log(chalk.gray(`Scenarios to execute: ${scenarios.length}`));
    }

    const orchestrator = new ClaudeDesktopOrchestrator();
    const step1Start = Date.now();
    const results = await orchestrator.executeScenarios(scenarios, outputDir);

    if (verbose) {
      console.log(chalk.gray(`Test execution completed`));
      console.log(
        chalk.gray(
          `Results summary: ${results ? "Available" : "No results returned"}`,
        ),
      );
      console.log(
        chalk.gray(`Step 1 completed in ${Date.now() - step1Start}ms`),
      );
    }

    // Step 2: Generate QA report
    console.log(chalk.yellow("📋 Generating QA report..."));
    if (verbose) {
      console.log(chalk.gray(`Initializing QA report generator...`));
      console.log(
        chalk.gray(`Including ${scenarios.length} scenarios in report`),
      );
      console.log(
        chalk.gray(
          `Report will be generated for output directory: ${outputDir}`,
        ),
      );
    }

    const reportGenerator = new QAReportGenerator();
    const step2Start = Date.now();
    const report = await reportGenerator.generate({
      prAnalysis,
      jiraContext,
      confluencePages,
      onyxContext,
      scenarios,
      results,
      outputDir,
    });

    if (verbose) {
      console.log(chalk.gray(`QA report generation completed`));
      console.log(chalk.gray(`Report length: ${report.length} characters`));
      console.log(
        chalk.gray(`Step 2 completed in ${Date.now() - step2Start}ms`),
      );
    }

    console.log(chalk.green("✅ Testing complete!"));
    if (verbose) {
      console.log(
        chalk.gray(`Total execution time: ${Date.now() - startTime}ms`),
      );
      console.log(chalk.gray(`Results summary:`));
      const passed = results.filter((r) => r.status === "passed").length;
      const failed = results.filter((r) => r.status === "failed").length;
      const warnings = results.filter((r) => r.status === "warning").length;
      console.log(chalk.gray(`  - Passed: ${passed}`));
      console.log(chalk.gray(`  - Failed: ${failed}`));
      console.log(chalk.gray(`  - Warnings: ${warnings}`));
    }

    console.log(chalk.gray("📋 QA Report:"));
    console.log(report);
  }
}
