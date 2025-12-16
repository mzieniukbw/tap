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


# Custom tools for GitHub Actions artifact download
def list_github_workflows(limit: int = 50) -> str:
    """List recent GitHub Actions workflow runs for the current PR's branch.

    Args:
        limit: Number of recent workflow runs to return (default: 50)

    Returns:
        JSON string with workflow run information including IDs, names, status, and URLs
    """
    import json
    import requests

    # Get GitHub credentials and PR context from environment
    token = os.getenv("GITHUB_TOKEN")
    if not token:
        return json.dumps({"error": "GITHUB_TOKEN not available in environment. Please ensure GitHub token is configured in TAP setup."})

    repo_owner = os.getenv("GITHUB_PR_OWNER", "")
    repo_name = os.getenv("GITHUB_PR_REPO", "")
    pr_number = os.getenv("GITHUB_PR_NUMBER", "")

    if not repo_owner or not repo_name or not pr_number:
        return json.dumps({"error": "PR context not available (owner, repo, or PR number missing). This tool requires PR context from test execution."})

    # First, get the PR branch information
    pr_url = f"https://api.github.com/repos/{repo_owner}/{repo_name}/pulls/{pr_number}"
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
    }

    try:
        # Get PR info to extract branch name
        pr_response = requests.get(pr_url, headers=headers, timeout=30)

        if pr_response.status_code != 200:
            return json.dumps({
                "error": f"Failed to fetch PR info: HTTP {pr_response.status_code}",
                "message": pr_response.text[:200]
            })

        pr_data = pr_response.json()
        pr_branch = pr_data["head"]["ref"]

        # Now list workflow runs for this branch
        runs_url = f"https://api.github.com/repos/{repo_owner}/{repo_name}/actions/runs"
        params = {
            "branch": pr_branch,
            "per_page": limit
        }

        runs_response = requests.get(runs_url, headers=headers, params=params, timeout=30)

        if runs_response.status_code == 200:
            data = runs_response.json()
            workflow_runs = data.get("workflow_runs", [])

            # Return simplified workflow run info
            result = {
                "success": True,
                "pr_number": pr_number,
                "pr_branch": pr_branch,
                "repository": f"{repo_owner}/{repo_name}",
                "count": len(workflow_runs),
                "workflow_runs": [
                    {
                        "id": run["id"],
                        "name": run["name"],
                        "status": run["status"],
                        "conclusion": run["conclusion"],
                        "created_at": run["created_at"],
                        "updated_at": run["updated_at"],
                        "head_branch": run["head_branch"],
                        "head_sha": run["head_sha"][:7],  # Short SHA
                        "html_url": run["html_url"]
                    }
                    for run in workflow_runs
                ]
            }
            return json.dumps(result, indent=2)
        else:
            return json.dumps({
                "error": f"GitHub API error: HTTP {runs_response.status_code}",
                "message": runs_response.text[:200]
            })

    except requests.exceptions.Timeout:
        return json.dumps({"error": "Request timed out after 30 seconds. Please try again."})
    except requests.exceptions.RequestException as e:
        return json.dumps({"error": f"Request failed: {str(e)}"})
    except Exception as e:
        return json.dumps({"error": f"Unexpected error: {str(e)}"})


def list_github_artifacts(workflow_run_id: str) -> str:
    """List all artifacts for a GitHub Actions workflow run.

    Args:
        workflow_run_id: Workflow run ID or GitHub Actions URL (e.g., "1234567890")

    Returns:
        JSON string with artifact list including IDs, names, sizes, and expiration status
    """
    import json
    import re
    import requests

    # Get GitHub credentials from environment
    token = os.getenv("GITHUB_TOKEN")
    if not token:
        return json.dumps({"error": "GITHUB_TOKEN not available in environment. Please ensure GitHub token is configured in TAP setup."})

    # Get PR context from environment
    repo_owner = os.getenv("GITHUB_PR_OWNER", "")
    repo_name = os.getenv("GITHUB_PR_REPO", "")

    if not repo_owner or not repo_name:
        return json.dumps({"error": "Repository context not available. Owner and repo must be set. This tool requires PR context from test execution."})

    # Parse workflow run ID from URL or use directly
    run_id = workflow_run_id
    if "github.com" in workflow_run_id:
        # Extract run ID from URL like: https://github.com/owner/repo/actions/runs/123456
        match = re.search(r'/actions/runs/(\d+)', workflow_run_id)
        if match:
            run_id = match.group(1)
        else:
            return json.dumps({"error": f"Could not parse workflow run ID from URL: {workflow_run_id}. Expected format: https://github.com/owner/repo/actions/runs/ID"})

    # Call GitHub API
    url = f"https://api.github.com/repos/{repo_owner}/{repo_name}/actions/runs/{run_id}/artifacts"
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
    }

    try:
        response = requests.get(url, headers=headers, timeout=30)

        if response.status_code == 200:
            data = response.json()
            artifacts = data.get("artifacts", [])

            # Return simplified artifact info
            result = {
                "success": True,
                "workflow_run_id": run_id,
                "repository": f"{repo_owner}/{repo_name}",
                "count": len(artifacts),
                "artifacts": [
                    {
                        "id": artifact["id"],
                        "name": artifact["name"],
                        "size_bytes": artifact["size_in_bytes"],
                        "expired": artifact["expired"],
                        "created_at": artifact["created_at"]
                    }
                    for artifact in artifacts
                ]
            }
            return json.dumps(result, indent=2)
        elif response.status_code == 404:
            return json.dumps({
                "error": f"Workflow run not found: {run_id}",
                "message": f"Please verify the workflow run ID exists in {repo_owner}/{repo_name}"
            })
        elif response.status_code in [401, 403]:
            return json.dumps({
                "error": f"GitHub API authentication failed: HTTP {response.status_code}",
                "message": "Please verify your GitHub token has 'repo' scope permissions"
            })
        else:
            return json.dumps({
                "error": f"GitHub API error: HTTP {response.status_code}",
                "message": response.text[:200]
            })
    except requests.exceptions.Timeout:
        return json.dumps({"error": "Request timed out after 30 seconds. Please try again."})
    except requests.exceptions.RequestException as e:
        return json.dumps({"error": f"Request failed: {str(e)}"})
    except Exception as e:
        return json.dumps({"error": f"Unexpected error: {str(e)}"})


def create_download_artifact_tool(computer):
    """Factory function to create download tool with access to Computer instance"""

    async def download_github_artifact(artifact_id: str, destination_filename: str = None) -> str:
        """Download a GitHub Actions artifact and upload it to the container.

        Args:
            artifact_id: Artifact ID from list_github_artifacts
            destination_filename: Custom filename (default: artifact-{id}.zip)

        Returns:
            JSON string with download status and file path accessible in the container
        """
        import json
        import requests

        # Get GitHub credentials from environment
        token = os.getenv("GITHUB_TOKEN")
        if not token:
            return json.dumps({"error": "GITHUB_TOKEN not available in environment. Please ensure GitHub token is configured in TAP setup."})

        # Get PR context from environment
        repo_owner = os.getenv("GITHUB_PR_OWNER", "")
        repo_name = os.getenv("GITHUB_PR_REPO", "")

        if not repo_owner or not repo_name:
            return json.dumps({"error": "Repository context not available. Owner and repo must be set. This tool requires PR context from test execution."})

        filename = destination_filename or f"artifact-{artifact_id}.zip"

        # Call GitHub API to download artifact
        url = f"https://api.github.com/repos/{repo_owner}/{repo_name}/actions/artifacts/{artifact_id}/zip"
        headers = {
            "Authorization": f"token {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28"
        }

        try:
            response = requests.get(url, headers=headers, timeout=120)

            if response.status_code == 200:
                # Get file content in memory
                file_content = response.content
                file_size = len(file_content)

                # Write directly to container using Computer's file operations
                container_path = f"/tmp/{filename}"

                try:
                    # Create /tmp directory if needed (should already exist)
                    await computer.interface.write_bytes(container_path, file_content)

                    return json.dumps({
                        "success": True,
                        "artifact_id": artifact_id,
                        "repository": f"{repo_owner}/{repo_name}",
                        "container_path": container_path,
                        "filename": filename,
                        "size_bytes": file_size,
                        "message": f"Artifact downloaded and uploaded to container.",
                        "instructions": f"The file is now available at: {container_path}\nUse terminal commands to extract and work with it. For example:\n  cd /tmp && unzip {filename}"
                    }, indent=2)

                except Exception as write_error:
                    return json.dumps({
                        "error": f"Failed to write file to container: {str(write_error)}",
                        "message": "File was downloaded but could not be written to container filesystem."
                    })
            elif response.status_code == 404:
                return json.dumps({
                    "error": f"Artifact not found: {artifact_id}",
                    "message": f"Please verify the artifact ID exists in {repo_owner}/{repo_name}"
                })
            elif response.status_code in [401, 403]:
                return json.dumps({
                    "error": f"GitHub API authentication failed: HTTP {response.status_code}",
                    "message": "Please verify your GitHub token has 'repo' scope permissions"
                })
            elif response.status_code == 410:
                return json.dumps({
                    "error": f"Artifact has expired: {artifact_id}",
                    "message": "GitHub Actions artifacts expire after 90 days by default"
                })
            else:
                return json.dumps({
                    "error": f"GitHub API error: HTTP {response.status_code}",
                    "message": response.text[:200]
                })
        except requests.exceptions.Timeout:
            return json.dumps({"error": "Download timed out after 120 seconds. Please try again or check your network connection."})
        except requests.exceptions.RequestException as e:
            return json.dumps({"error": f"Download failed: {str(e)}"})
        except Exception as e:
            return json.dumps({"error": f"Unexpected error: {str(e)}"})

    return download_github_artifact


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
        # Save directly to cua-results directory to avoid duplication
        scenario_id = os.getenv("CUA_SCENARIO_ID", "unknown-scenario")
        cua_results_dir = os.path.join(output_dir, "cua-results", scenario_id)
        os.makedirs(cua_results_dir, exist_ok=True)

        trace_name = f"tap_trace_{os.getpid()}"
        print(f"📸 Starting trace (screenshots + video): {trace_name}", file=sys.stderr)
        print(f"📁 Trace artifacts will be saved to: {cua_results_dir}", file=sys.stderr)

        # Setup dual logging: console (INFO) + file (DEBUG)
        log_file = os.path.join(cua_results_dir, "execution.log")

        # File handler - captures everything at DEBUG level
        file_handler = logging.FileHandler(log_file, mode='w', encoding='utf-8')
        file_handler.setLevel(logging.DEBUG)
        file_handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))

        # Console handler - shows INFO level for progress visibility
        console_handler = logging.StreamHandler(sys.stderr)
        console_handler.setLevel(logging.INFO)
        console_handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))

        # Configure loggers with both handlers
        for logger_name in ["agent", "agent.ComputerAgent", "computer"]:
            logger = logging.getLogger(logger_name)
            logger.handlers = []  # Clear existing handlers
            logger.addHandler(console_handler)  # Add console at INFO
            logger.addHandler(file_handler)     # Add file at DEBUG
            logger.setLevel(logging.DEBUG)      # Logger must be DEBUG to allow file handler to capture everything
            logger.propagate = False

        print(f"📝 Full execution log: {log_file}", file=sys.stderr)

        await computer.tracing.start({
            'screenshots': True,
            'video': True,
            'name': trace_name,
            'path': cua_results_dir
        })

        # Create download artifact tool with access to Computer instance
        download_github_artifact = create_download_artifact_tool(computer)

        # Initialize CUA agent with Claude Sonnet 4.5 and custom GitHub artifact tools
        # CUA automatically reads ANTHROPIC_API_KEY from environment
        agent = ComputerAgent(
            model="anthropic/claude-haiku-4-5-20251001",
            tools=[computer, list_github_workflows, list_github_artifacts, download_github_artifact],
            telemetry_enabled=False,
            only_n_most_recent_images=3,
            use_prompt_caching=True,
            max_trajectory_budget=2.0,  # Budget in dollars
            max_tokens=4096,  # Limit response size to reduce overall request size
            max_retries=1,
            verbosity=verbosity,
        )

        # Debug: Print registered tools and verify they're accessible
        print(f"🔧 Registered {len([computer, list_github_workflows, list_github_artifacts, download_github_artifact])} tools with CUA agent", file=sys.stderr)
        print(f"   - computer (Computer instance)", file=sys.stderr)
        print(f"   - list_github_workflows (callable: {callable(list_github_workflows)})", file=sys.stderr)
        print(f"   - list_github_artifacts (callable: {callable(list_github_artifacts)})", file=sys.stderr)
        print(f"   - download_github_artifact (callable: {callable(download_github_artifact)})", file=sys.stderr)

        # Check if agent has tools and print their schemas
        if hasattr(agent, 'tool_schemas'):
            print(f"\n🔍 Tool schemas being sent to Anthropic API:", file=sys.stderr)
            for schema in agent.tool_schemas:
                if schema.get('type') == 'computer':
                    print(f"   ✓ computer tool (type: {schema['type']})", file=sys.stderr)
                elif schema.get('type') == 'function':
                    func = schema.get('function', {})
                    print(f"   ✓ {func.get('name')} (type: function)", file=sys.stderr)
                    print(f"      Description: {func.get('description', '')[:60]}...", file=sys.stderr)
                    params = func.get('parameters', {}).get('properties', {})
                    print(f"      Parameters: {list(params.keys())}", file=sys.stderr)
            print(f"   Total schemas: {len(agent.tool_schemas)}\n", file=sys.stderr)
        else:
            print(f"   ⚠️  Warning: agent.tool_schemas not found!", file=sys.stderr)

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

                # Organize trace artifacts into subdirectories (already in cua-results)
                if trace_path and os.path.exists(trace_path):
                    try:
                        print(f"📁 Organizing trace artifacts in: {trace_path}", file=sys.stderr)
                        import glob as glob_module
                        import shutil

                        # Create subdirectories for organization
                        screenshots_dir = os.path.join(trace_path, "screenshots")
                        videos_dir = os.path.join(trace_path, "videos")
                        metadata_dir = os.path.join(trace_path, "metadata")

                        os.makedirs(screenshots_dir, exist_ok=True)
                        os.makedirs(videos_dir, exist_ok=True)
                        os.makedirs(metadata_dir, exist_ok=True)

                        # Find all artifacts in the root trace directory (not subdirectories)
                        screenshots = glob_module.glob(os.path.join(trace_path, "*.png"))
                        videos = glob_module.glob(os.path.join(trace_path, "*.mp4"))
                        webm_videos = glob_module.glob(os.path.join(trace_path, "*.webm"))
                        metadata_files = glob_module.glob(os.path.join(trace_path, "*.json"))

                        all_videos = videos + webm_videos
                        total_artifacts = len(screenshots) + len(all_videos) + len(metadata_files)

                        if total_artifacts > 0:
                            print(f"📋 Found {total_artifacts} artifact(s): {len(screenshots)} screenshots, {len(all_videos)} videos, {len(metadata_files)} metadata files", file=sys.stderr)

                            # Move screenshots to screenshots/
                            moved_screenshots = 0
                            for screenshot in screenshots:
                                try:
                                    dest_path = os.path.join(screenshots_dir, os.path.basename(screenshot))
                                    shutil.move(screenshot, dest_path)
                                    moved_screenshots += 1
                                except Exception as move_err:
                                    print(f"⚠️  Failed to move {os.path.basename(screenshot)}: {move_err}", file=sys.stderr)

                            # Move videos to videos/
                            moved_videos = 0
                            for video in all_videos:
                                try:
                                    dest_path = os.path.join(videos_dir, os.path.basename(video))
                                    shutil.move(video, dest_path)
                                    moved_videos += 1
                                except Exception as move_err:
                                    print(f"⚠️  Failed to move {os.path.basename(video)}: {move_err}", file=sys.stderr)

                            # Move metadata files to metadata/
                            moved_metadata = 0
                            for metadata_file in metadata_files:
                                try:
                                    dest_path = os.path.join(metadata_dir, os.path.basename(metadata_file))
                                    shutil.move(metadata_file, dest_path)
                                    moved_metadata += 1
                                except Exception as move_err:
                                    print(f"⚠️  Failed to move {os.path.basename(metadata_file)}: {move_err}", file=sys.stderr)

                            print(f"✅ Organized artifacts in: {trace_path}", file=sys.stderr)
                            print(f"   📸 {moved_screenshots} screenshot(s) → screenshots/", file=sys.stderr)
                            print(f"   🎥 {moved_videos} video(s) → videos/", file=sys.stderr)
                            print(f"   📄 {moved_metadata} metadata file(s) → metadata/", file=sys.stderr)

                            # Show first few screenshots
                            if moved_screenshots > 0:
                                organized_screenshots = glob_module.glob(os.path.join(screenshots_dir, "*.png"))
                                if organized_screenshots:
                                    print(f"   Screenshots:", file=sys.stderr)
                                    for screenshot in organized_screenshots[:3]:
                                        print(f"     - {os.path.basename(screenshot)}", file=sys.stderr)
                                    if len(organized_screenshots) > 3:
                                        print(f"     ... and {len(organized_screenshots) - 3} more", file=sys.stderr)
                        else:
                            print(f"⚠️  No artifacts found in trace directory", file=sys.stderr)
                            print(f"   (Video recording may not be supported yet)", file=sys.stderr)
                    except Exception as e:
                        print(f"⚠️  Could not organize trace artifacts: {e}", file=sys.stderr)

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
