#!/usr/bin/env python3
"""
CUA Agent Script for TAP Test Execution
Connects to a Docker container and executes test scenarios using Claude Sonnet 4.5
"""

import asyncio
import logging
import sys
import os
from pathlib import Path

try:
    from agent import ComputerAgent
    from computer import Computer
except ImportError as e:
    print(f"Error: Failed to import CUA modules: {e}", file=sys.stderr)
    print("Please ensure CUA is installed: pip install cua-agent[all] cua-computer", file=sys.stderr)
    sys.exit(1)


async def execute_scenario(instructions: str) -> dict:
    """
    Execute a test scenario using CUA agent with Linux Docker container

    Args:
        instructions: Test scenario instructions to execute

    Returns:
        Dictionary with execution results

    Note:
        Requires ANTHROPIC_API_KEY environment variable to be set
    """
    computer = None

    try:
        # Initialize Linux Docker computer with lower resolution to reduce request size
        computer = Computer(
            os_type="linux",
            provider_type="docker",
            name="tap-test-container",
            verbosity=logging.DEBUG,
            telemetry_enabled=False,
            ephemeral=True,
        )

        # Start the computer container
        print("🚀 Starting Docker container...", file=sys.stderr)
        await computer.run()
        print("✅ Container started successfully", file=sys.stderr)

        # Initialize CUA agent with Claude Sonnet 4.5
        # CUA automatically reads ANTHROPIC_API_KEY from environment
        agent = ComputerAgent(
            model="anthropic/claude-haiku-4-5-20251001",
            tools=[computer],
            telemetry_enabled=False,
            only_n_most_recent_images=3,
            use_prompt_caching=True,
            max_trajectory_budget=2.0,  # Budget in dollars
            max_tokens=4096,  # Limit response size to reduce overall request size
            max_retries=1,
            verbosity=logging.DEBUG,
        )

        # Prepare messages
        messages = [
            {
                "role": "user",
                "content": instructions
            }
        ]

        print("🤖 Executing test scenario with Claude Sonnet 4.5...", file=sys.stderr)

        # Execute the agent
        output_messages = []
        async for result in agent.run(messages):
            for item in result.get("output", []):
                if item.get("type") == "message":
                    content = item.get("content", [])
                    for content_block in content:
                        if content_block.get("type") == "text":
                            text = content_block.get("text", "")
                            print(text)
                            output_messages.append(text)

        return {
            "status": "success",
            "output": "\n".join(output_messages),
            "error": None
        }

    except Exception as e:
        error_msg = f"Execution failed: {str(e)}"
        print(f"❌ {error_msg}", file=sys.stderr)
        return {
            "status": "error",
            "output": None,
            "error": error_msg
        }

    finally:
        # Clean up container
        if computer:
            try:
                print("🧹 Cleaning up container...", file=sys.stderr)
                await computer.stop()
                print("✅ Container stopped", file=sys.stderr)
            except Exception as e:
                print(f"⚠️  Warning: Failed to stop container: {e}", file=sys.stderr)


async def main():
    """Main entry point for the CUA agent script"""

    # Validate that ANTHROPIC_API_KEY is set
    # CUA will automatically read it from environment
    if not os.getenv("ANTHROPIC_API_KEY"):
        print("Error: ANTHROPIC_API_KEY environment variable not set", file=sys.stderr)
        sys.exit(1)

    # Read instructions from stdin
    print("📖 Reading instructions from stdin...", file=sys.stderr)
    instructions = sys.stdin.read().strip()

    if not instructions:
        print("Error: No instructions provided via stdin", file=sys.stderr)
        sys.exit(1)

    print(f"📋 Instructions length: {len(instructions)} characters", file=sys.stderr)

    # Execute the scenario
    result = await execute_scenario(instructions)

    # Exit with appropriate code
    if result["status"] == "success":
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
