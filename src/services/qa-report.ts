import { PRAnalysis } from "./github";
import { TicketContext } from "./atlassian";
import { ConfluencePage } from "./atlassian";
import { TestScenario } from "./ai-test-generator";
import { TestResult } from "./open-interpreter-executor";
import { OnyxContext } from "./onyx-context";

export interface QAReportData {
  prAnalysis: PRAnalysis;
  jiraContext?: TicketContext | null;
  confluencePages: ConfluencePage[];
  onyxContext?: OnyxContext | null;
  scenarios: TestScenario[];
  results: TestResult[];
  outputDir: string;
}

export class QAReportGenerator {
  async generate(data: QAReportData): Promise<string> {
    const report = this.buildReport(data);

    // Save report to file
    const reportPath = `${data.outputDir}/qa-report.md`;
    await import("fs/promises").then((fs) => fs.writeFile(reportPath, report));

    return report;
  }

  private buildReport(data: QAReportData): string {
    const sections = [
      this.buildHeader(),
      this.buildPRSection(data.prAnalysis),
      this.buildJiraSection(data.jiraContext),
      this.buildDocumentationSection(data.confluencePages),
      this.buildCodeChangesSection(data.prAnalysis),
      this.buildTestExecutionSection(data.scenarios, data.results),
      this.buildSummarySection(data.results),
      this.buildRecommendationsSection(data.results),
      this.buildArtifactsSection(data.results, data.outputDir),
    ];

    return sections.filter(Boolean).join("\n\n");
  }

  private buildHeader(): string {
    const timestamp = new Date().toLocaleString();
    return [
      "=".repeat(50),
      "🧪 QA TESTING NOTES",
      "=".repeat(50),
      `Generated: ${timestamp}`,
      `Testing Assistant Project v1.1.0`,
    ].join("\n");
  }

  private buildPRSection(pr: PRAnalysis): string {
    const lines = [
      "📋 PULL REQUEST DETAILS",
      "-".repeat(30),
      `PR: ${pr.url}`,
      `Title: ${pr.title}`,
      `Author: ${pr.author}`,
      `Branch: ${pr.branch} → ${pr.baseBranch}`,
      `Files Changed: ${pr.changedFiles.length}`,
      `Commits: ${pr.commits.length}`,
    ];

    if (pr.labels.length > 0) {
      lines.push(`Labels: ${pr.labels.join(", ")}`);
    }

    if (pr.description) {
      lines.push(
        "",
        "Description:",
        pr.description.substring(0, 300) + (pr.description.length > 300 ? "..." : "")
      );
    }

    return lines.join("\n");
  }

  private buildJiraSection(context?: TicketContext | null): string {
    if (!context) {
      return ["🎫 JIRA CONTEXT", "-".repeat(20), "⚠️  No Jira ticket found in PR description"].join(
        "\n"
      );
    }

    const lines = [
      "🎫 JIRA CONTEXT",
      "-".repeat(20),
      `Ticket: ${context.ticket.key} - ${context.ticket.summary}`,
      `Status: ${context.ticket.status}`,
      `Type: ${context.ticket.issueType}`,
      `Priority: ${context.ticket.priority}`,
      `Assignee: ${context.ticket.assignee || "Unassigned"}`,
    ];

    if (context.epic) {
      lines.push(`Epic: ${context.epic.key} - ${context.epic.summary}`);
    }

    if (context.linkedIssues.length > 0) {
      lines.push("", "Linked Issues:");
      context.linkedIssues.forEach((issue) => {
        lines.push(`  • ${issue.key} - ${issue.summary}`);
      });
    }

    if (context.ticket.description) {
      lines.push("", "Description:", context.ticket.description.substring(0, 200) + "...");
    }

    return lines.join("\n");
  }

  private buildDocumentationSection(pages: ConfluencePage[]): string {
    if (pages.length === 0) {
      return ["📚 RELATED DOCUMENTATION", "-".repeat(30), "No related Confluence pages found"].join(
        "\n"
      );
    }

    const lines = ["📚 RELATED DOCUMENTATION", "-".repeat(30)];

    pages.slice(0, 5).forEach((page, index) => {
      lines.push(`${index + 1}. ${page.title}`);
      lines.push(`   Space: ${page.space}`);
      lines.push(`   URL: ${page.url}`);
      if (index < pages.length - 1) lines.push("");
    });

    return lines.join("\n");
  }

  private buildCodeChangesSection(pr: PRAnalysis): string {
    const lines = ["💻 CODE CHANGES ANALYZED", "-".repeat(30)];

    const changesByType = this.groupFilesByType(pr.changedFiles);

    Object.entries(changesByType).forEach(([type, files]) => {
      lines.push(`\n${type.toUpperCase()}:`);
      files.forEach((file) => {
        const changeInfo =
          file.additions > 0 || file.deletions > 0
            ? ` (+${file.additions}/-${file.deletions})`
            : "";
        lines.push(`  • ${file.status.toUpperCase()}: ${file.path}${changeInfo}`);
      });
    });

    return lines.join("\n");
  }

  private buildTestExecutionSection(scenarios: TestScenario[], results: TestResult[]): string {
    const lines = ["🧪 TEST SCENARIOS EXECUTED", "-".repeat(35)];

    results.forEach((result, index) => {
      const scenario = scenarios.find((s) => s.id === result.scenarioId);
      const statusIcon = this.getStatusIcon(result.status);

      lines.push(`\n${statusIcon} ${index + 1}. ${scenario?.title || "Unknown Scenario"}`);
      lines.push(`   Duration: ${result.executionTime} minutes`);
      lines.push(
        `   Steps: ${result.steps.length} (${result.steps.filter((s) => s.status === "passed").length} passed)`
      );

      if (result.status === "failed" || result.status === "warning") {
        const failedSteps = result.steps.filter((s) => s.status === "failed");
        if (failedSteps.length > 0) {
          lines.push(`   ⚠️  Failed steps: ${failedSteps.map((s) => s.stepIndex + 1).join(", ")}`);
        }
      }

      if (result.artifacts.length > 0) {
        const screenshots = result.artifacts.filter((a) => a.type === "screenshot");
        const videos = result.artifacts.filter((a) => a.type === "video");

        if (screenshots.length > 0) {
          lines.push(`   📸 Screenshots: ${screenshots.length}`);
        }
        if (videos.length > 0) {
          lines.push(`   🎥 Videos: ${videos.length}`);
        }
      }

      if (result.notes) {
        lines.push(`   Note: ${result.notes}`);
      }
    });

    return lines.join("\n");
  }

  private buildSummarySection(results: TestResult[]): string {
    const total = results.length;
    const passed = results.filter((r) => r.status === "passed").length;
    const failed = results.filter((r) => r.status === "failed").length;
    const warnings = results.filter((r) => r.status === "warning").length;

    const totalTime = results.reduce((sum, r) => sum + r.executionTime, 0);
    const avgTime = total > 0 ? (totalTime / total).toFixed(1) : "0";

    const lines = [
      "📊 EXECUTION SUMMARY",
      "-".repeat(25),
      `Total Scenarios: ${total}`,
      `✅ Passed: ${passed}`,
      `❌ Failed: ${failed}`,
      `⚠️  Warnings: ${warnings}`,
      ``,
      `Total Execution Time: ${totalTime.toFixed(1)} minutes`,
      `Average per Scenario: ${avgTime} minutes`,
      ``,
      `Success Rate: ${total > 0 ? Math.round((passed / total) * 100) : 0}%`,
    ];

    return lines.join("\n");
  }

  private buildRecommendationsSection(results: TestResult[]): string {
    const lines = ["💡 RECOMMENDATIONS", "-".repeat(25)];

    const failed = results.filter((r) => r.status === "failed");
    const warnings = results.filter((r) => r.status === "warning");

    if (failed.length === 0 && warnings.length === 0) {
      lines.push("✅ All tests passed successfully");
      lines.push("✅ No issues found - ready for QA team review");
    } else {
      if (failed.length > 0) {
        lines.push(
          `❌ Address ${failed.length} failing test scenario${failed.length === 1 ? "" : "s"} before deployment`
        );
      }

      if (warnings.length > 0) {
        lines.push(
          `⚠️  Review ${warnings.length} test scenario${warnings.length === 1 ? "" : "s"} with warnings`
        );
      }

      lines.push("");
      lines.push("Recommended Actions:");

      if (failed.length > 0) {
        lines.push("1. Fix failing test scenarios");
        lines.push("2. Re-run tests to verify fixes");
      }

      if (warnings.length > 0) {
        lines.push("3. Investigate warning scenarios for potential issues");
      }

      lines.push("4. Consider additional manual testing for complex scenarios");
    }

    return lines.join("\n");
  }

  private buildArtifactsSection(results: TestResult[], outputDir: string): string {
    const allArtifacts = results.flatMap((r) => r.artifacts);

    if (allArtifacts.length === 0) {
      return ["📁 TEST ARTIFACTS", "-".repeat(20), "No artifacts generated"].join("\n");
    }

    const lines = ["📁 TEST ARTIFACTS", "-".repeat(20), `Output Directory: ${outputDir}`, ""];

    const artifactsByType = this.groupArtifactsByType(allArtifacts);

    Object.entries(artifactsByType).forEach(([type, artifacts]) => {
      lines.push(`${type.toUpperCase()}:`);
      artifacts.forEach((artifact) => {
        const filename = artifact.path.split("/").pop();
        lines.push(`  • ${filename} - ${artifact.description}`);
      });
      lines.push("");
    });

    return lines.join("\n");
  }

  private groupArtifactsByType(artifacts: any[]) {
    const groups: { [key: string]: any[] } = {};

    artifacts.forEach((artifact) => {
      const type = artifact.type;
      if (!groups[type]) {
        groups[type] = [];
      }
      groups[type].push(artifact);
    });

    return groups;
  }

  private groupFilesByType(files: any[]) {
    const groups: { [key: string]: any[] } = {
      frontend: [],
      backend: [],
      database: [],
      configuration: [],
      documentation: [],
      tests: [],
      other: [],
    };

    files.forEach((file) => {
      const path = file.path.toLowerCase();

      if (
        path.includes("frontend") ||
        path.includes("ui") ||
        path.includes(".vue") ||
        path.includes(".tsx") ||
        path.includes(".jsx")
      ) {
        groups.frontend.push(file);
      } else if (
        path.includes("backend") ||
        path.includes("api") ||
        path.includes("server") ||
        path.includes(".rs") ||
        path.includes(".go")
      ) {
        groups.backend.push(file);
      } else if (path.includes("database") || path.includes("migration") || path.includes(".sql")) {
        groups.database.push(file);
      } else if (
        path.includes("config") ||
        path.includes(".json") ||
        path.includes(".yaml") ||
        path.includes(".toml")
      ) {
        groups.configuration.push(file);
      } else if (path.includes("readme") || path.includes(".md") || path.includes("doc")) {
        groups.documentation.push(file);
      } else if (path.includes("test") || path.includes("spec")) {
        groups.tests.push(file);
      } else {
        groups.other.push(file);
      }
    });

    // Filter out empty groups
    return Object.fromEntries(Object.entries(groups).filter(([, files]) => files.length > 0));
  }

  private getStatusIcon(status: string): string {
    switch (status) {
      case "passed":
        return "✅";
      case "failed":
        return "❌";
      case "warning":
        return "⚠️";
      case "skipped":
        return "⏭️";
      default:
        return "❓";
    }
  }
}
