import { execSync } from "child_process";

export interface ClaudeCLI {
  isAvailable(): boolean;
  generateResponse(context: string, prompt: string): Promise<string>;
}

export class ClaudeCLIWrapper implements ClaudeCLI {
  constructor() {
    if (!this.isAvailable()) {
      throw new Error(
        "Claude CLI not found. Please install it with: npm install -g @anthropic-ai/claude-cli"
      );
    }
  }

  isAvailable(): boolean {
    try {
      execSync("claude --version", { stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  }

  async generateResponse(context: string, prompt: string): Promise<string> {
    try {
      const claudeResponse = execSync(`claude -p "${prompt}"`, {
        input: context,
        encoding: "utf-8",
        maxBuffer: 8 * 1024 * 1024, // 8MB buffer
        stdio: ["pipe", "pipe", "pipe"],
      });

      return claudeResponse.trim();
    } catch (error) {
      throw new Error(
        `Failed to generate Claude response: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
