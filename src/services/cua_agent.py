#!/usr/bin/env python3
"""
CUA Agent Script for TAP Test Execution
Connects to a Docker container and executes test scenarios using Claude Sonnet 4.5
"""

import asyncio
import logging
import sys
import os
import signal
from pathlib import Path

# Configure logging BEFORE importing CUA to suppress verbose output
# This must happen before any CUA imports
_verbosity_str = os.getenv("CUA_VERBOSITY", "INFO").upper()
_log_level = getattr(logging, _verbosity_str, logging.INFO)

# Suppress verbose loggers from CUA and dependencies
if _log_level > logging.DEBUG:
    # Set root logger to WARNING to suppress all INFO messages
    logging.basicConfig(level=logging.WARNING, format='', force=True)

    # Disable all existing handlers and set level for noisy loggers
    for logger_name in ["agent", "computer", "litellm", "anthropic", "LiteLLM", "httpx"]:
        logger = logging.getLogger(logger_name)
        logger.setLevel(logging.WARNING)
        logger.handlers = []  # Clear any existing handlers
        logger.propagate = False

    # Also set sub-loggers
    logging.getLogger("agent.ComputerAgent").setLevel(logging.WARNING)
    logging.getLogger("agent.ComputerAgent").handlers = []
    logging.getLogger("agent.ComputerAgent").propagate = False
else:
    # DEBUG mode - show everything
    logging.basicConfig(level=logging.DEBUG, format='%(levelname)s: %(message)s', force=True)

try:
    from agent import ComputerAgent
    from computer import Computer
except ImportError as e:
    print(f"Error: Failed to import CUA modules: {e}", file=sys.stderr)
    print("Please ensure CUA is installed: pip install cua-agent[all] cua-computer", file=sys.stderr)
    sys.exit(1)

# Reconfigure logging AFTER CUA imports (CUA sets up its own loggers during import)
if _log_level > logging.DEBUG:
    # Aggressively suppress all CUA loggers
    for logger_name in ["agent", "agent.ComputerAgent", "computer", "litellm", "anthropic", "LiteLLM", "httpx"]:
        logger = logging.getLogger(logger_name)
        logger.setLevel(logging.WARNING)
        logger.handlers = []
        logger.propagate = False


# Global flag for graceful shutdown
shutdown_requested = False


def signal_handler(signum, frame):
    """Handle SIGTERM/SIGINT for graceful shutdown"""
    global shutdown_requested
    print(f"\n⚠️  Received signal {signum} - initiating graceful shutdown...", file=sys.stderr)
    shutdown_requested = True


async def execute_scenario(instructions: str, timeout_seconds: int = 60, output_dir: str = ".") -> dict:
    """
    Execute a test scenario using CUA agent with Linux Docker container

    Args:
        instructions: Test scenario instructions to execute
        timeout_seconds: Maximum execution time in seconds (default: 60)
        output_dir: Directory to save screenshots and artifacts (default: current directory)

    Returns:
        Dictionary with execution results

    Note:
        Requires ANTHROPIC_API_KEY environment variable to be set
    """
    computer = None
    timed_out = False
    container_name = "tap-test-container"

    try:
        # Ensure output directory exists
        os.makedirs(output_dir, exist_ok=True)

        # Get verbosity level from environment (default: INFO)
        verbosity_str = os.getenv("CUA_VERBOSITY", "INFO").upper()
        verbosity_map = {
            "DEBUG": logging.DEBUG,
            "INFO": logging.INFO,
            "WARNING": logging.WARNING,
            "ERROR": logging.ERROR,
            "CRITICAL": logging.CRITICAL,
        }
        verbosity = verbosity_map.get(verbosity_str, logging.INFO)

        # Initialize Linux Docker computer with lower resolution to reduce request size
        computer = Computer(
            os_type="linux",
            provider_type="docker",
            name=container_name,
            verbosity=verbosity,
            telemetry_enabled=False,
            ephemeral=True,
        )

        # Start the computer container
        print(f"🚀 Starting Docker container (timeout: {timeout_seconds}s)...", file=sys.stderr)
        await computer.run()
        print("✅ Container started successfully", file=sys.stderr)

        # Start tracing to capture screenshots and video
        trace_name = f"tap_trace_{os.getpid()}"
        print(f"📸 Starting trace (screenshots + video): {trace_name}", file=sys.stderr)
        await computer.tracing.start({
            'screenshots': True,
            'video': True,
            'name': trace_name,
            'path': output_dir
        })

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
            verbosity=verbosity,
        )

        # Prepare messages
        messages = [
            {
                "role": "user",
                "content": instructions
            }
        ]

        print("🤖 Executing test scenario...", file=sys.stderr)

        # Execute the agent with proper timeout and cancellation
        output_messages = []
        agent_task = None
        start_time = asyncio.get_event_loop().time()

        async def run_agent():
            try:
                iteration_count = 0
                async for result in agent.run(messages):
                    # Check timeout periodically
                    iteration_count += 1
                    elapsed = asyncio.get_event_loop().time() - start_time
                    if elapsed > timeout_seconds:
                        print(f"⏱️  Timeout reached after {iteration_count} iterations", file=sys.stderr)
                        raise asyncio.TimeoutError()

                    for item in result.get("output", []):
                        if item.get("type") == "message":
                            content = item.get("content", [])
                            for content_block in content:
                                if content_block.get("type") == "text":
                                    text = content_block.get("text", "")
                                    print(text)
                                    output_messages.append(text)
            except asyncio.CancelledError:
                print("⏱️  Agent execution cancelled due to timeout", file=sys.stderr)
                raise

        try:
            # Create task so we can cancel it explicitly
            agent_task = asyncio.create_task(run_agent())
            await asyncio.wait_for(agent_task, timeout=timeout_seconds)
            status = "success"
            error = None
        except asyncio.TimeoutError:
            timed_out = True
            status = "warning"
            error = f"Execution timed out after {timeout_seconds} seconds (artifacts preserved)"
            print(f"⏱️  Timeout reached - cancelling agent...", file=sys.stderr)

            # Explicitly cancel the task
            if agent_task and not agent_task.done():
                agent_task.cancel()
                try:
                    # Give it 5 seconds to cancel gracefully
                    await asyncio.wait_for(agent_task, timeout=5.0)
                except (asyncio.CancelledError, asyncio.TimeoutError):
                    print("⚠️  Agent task forcefully terminated", file=sys.stderr)

        return {
            "status": status,
            "output": "\n".join(output_messages),
            "error": error,
            "timed_out": timed_out
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
        # Clean up container and retrieve artifacts
        if computer:
            try:
                # Stop tracing to save screenshots and get trace path
                trace_path = None
                try:
                    print("📸 Stopping trace and saving artifacts...", file=sys.stderr)
                    trace_path = await computer.tracing.stop({'format': 'dir'})
                    if trace_path:
                        print(f"✅ Trace saved to: {trace_path}", file=sys.stderr)
                except Exception as e:
                    print(f"⚠️  Failed to stop trace: {e}", file=sys.stderr)

                if timed_out:
                    print("🧹 Cleaning up container (timeout - artifacts already saved)...", file=sys.stderr)
                else:
                    print("🧹 Cleaning up container...", file=sys.stderr)

                # Copy trace artifacts to organized cua-results directory structure
                if trace_path and os.path.exists(trace_path):
                    try:
                        print(f"📁 Processing trace artifacts from: {trace_path}", file=sys.stderr)
                        import glob as glob_module
                        import shutil

                        # Get scenario ID from environment for directory naming
                        scenario_id = os.getenv("CUA_SCENARIO_ID", "unknown-scenario")

                        # Create organized directory structure
                        cua_results_base = os.path.join(output_dir, "cua-results")
                        scenario_dir = os.path.join(cua_results_base, scenario_id)
                        screenshots_dir = os.path.join(scenario_dir, "screenshots")
                        videos_dir = os.path.join(scenario_dir, "videos")
                        metadata_dir = os.path.join(scenario_dir, "metadata")

                        os.makedirs(screenshots_dir, exist_ok=True)
                        os.makedirs(videos_dir, exist_ok=True)
                        os.makedirs(metadata_dir, exist_ok=True)

                        # If trace_path is a directory, organize and copy files
                        if os.path.isdir(trace_path):
                            # Find all artifacts
                            screenshots = glob_module.glob(os.path.join(trace_path, "*.png"))
                            videos = glob_module.glob(os.path.join(trace_path, "*.mp4"))
                            webm_videos = glob_module.glob(os.path.join(trace_path, "*.webm"))
                            metadata_files = glob_module.glob(os.path.join(trace_path, "*.json"))

                            all_videos = videos + webm_videos
                            total_artifacts = len(screenshots) + len(all_videos) + len(metadata_files)

                            if total_artifacts > 0:
                                print(f"📋 Found {total_artifacts} artifact(s): {len(screenshots)} screenshots, {len(all_videos)} videos, {len(metadata_files)} metadata files", file=sys.stderr)

                                # Copy screenshots to screenshots/
                                copied_screenshots = 0
                                for screenshot in screenshots:
                                    try:
                                        dest_path = os.path.join(screenshots_dir, os.path.basename(screenshot))
                                        shutil.copy2(screenshot, dest_path)
                                        copied_screenshots += 1
                                    except Exception as copy_err:
                                        print(f"⚠️  Failed to copy {os.path.basename(screenshot)}: {copy_err}", file=sys.stderr)

                                # Copy videos to videos/
                                copied_videos = 0
                                for video in all_videos:
                                    try:
                                        dest_path = os.path.join(videos_dir, os.path.basename(video))
                                        shutil.copy2(video, dest_path)
                                        copied_videos += 1
                                    except Exception as copy_err:
                                        print(f"⚠️  Failed to copy {os.path.basename(video)}: {copy_err}", file=sys.stderr)

                                # Copy metadata files to metadata/
                                copied_metadata = 0
                                for metadata_file in metadata_files:
                                    try:
                                        dest_path = os.path.join(metadata_dir, os.path.basename(metadata_file))
                                        shutil.copy2(metadata_file, dest_path)
                                        copied_metadata += 1
                                    except Exception as copy_err:
                                        print(f"⚠️  Failed to copy {os.path.basename(metadata_file)}: {copy_err}", file=sys.stderr)

                                print(f"✅ Organized artifacts into: {scenario_dir}", file=sys.stderr)
                                print(f"   📸 {copied_screenshots} screenshot(s) → screenshots/", file=sys.stderr)
                                print(f"   🎥 {copied_videos} video(s) → videos/", file=sys.stderr)
                                print(f"   📄 {copied_metadata} metadata file(s) → metadata/", file=sys.stderr)

                                # Show first few screenshots
                                if screenshots:
                                    print(f"   Screenshots:", file=sys.stderr)
                                    for screenshot in screenshots[:3]:
                                        print(f"     - {os.path.basename(screenshot)}", file=sys.stderr)
                                    if len(screenshots) > 3:
                                        print(f"     ... and {len(screenshots) - 3} more", file=sys.stderr)
                            else:
                                print(f"⚠️  No artifacts found in trace directory", file=sys.stderr)
                                print(f"   (Video recording may not be supported yet)", file=sys.stderr)
                    except Exception as e:
                        print(f"⚠️  Could not process trace artifacts: {e}", file=sys.stderr)

                # Stop the container
                await computer.stop()

                if timed_out:
                    print("✅ Container stopped - check output directory for partial results", file=sys.stderr)
                else:
                    print("✅ Container stopped", file=sys.stderr)
            except Exception as e:
                print(f"⚠️  Warning: Failed to stop container: {e}", file=sys.stderr)


async def main():
    """Main entry point for the CUA agent script"""

    # Register signal handlers for graceful shutdown
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)

    # Validate that ANTHROPIC_API_KEY is set
    # CUA will automatically read it from environment
    if not os.getenv("ANTHROPIC_API_KEY"):
        print("Error: ANTHROPIC_API_KEY environment variable not set", file=sys.stderr)
        sys.exit(1)

    # Read timeout from environment (default: 60 seconds for testing)
    timeout_seconds = int(os.getenv("CUA_TIMEOUT_SECONDS", "60"))

    # Read output directory from environment (default: current directory)
    output_dir = os.getenv("CUA_OUTPUT_DIR", ".")

    # Read instructions from stdin
    print("📖 Reading instructions from stdin...", file=sys.stderr)
    instructions = sys.stdin.read().strip()

    if not instructions:
        print("Error: No instructions provided via stdin", file=sys.stderr)
        sys.exit(1)

    print(f"📋 Instructions length: {len(instructions)} characters", file=sys.stderr)
    print(f"⏱️  Timeout: {timeout_seconds} seconds", file=sys.stderr)
    print(f"📁 Output directory: {output_dir}", file=sys.stderr)

    # Execute the scenario
    result = await execute_scenario(instructions, timeout_seconds, output_dir)

    # Exit with appropriate code
    # Success or warning (timeout with partial results) = 0
    # Only hard failures = 1
    if result["status"] in ["success", "warning"]:
        if result.get("timed_out"):
            print("⚠️  Test timed out but artifacts were preserved", file=sys.stderr)
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
