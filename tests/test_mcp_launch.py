"""The manifest's MCP launch starts the server from this tree, as the gateway does.

The gateway starts ``python3 backend/mcp_launch.py`` with its own interpreter and
the launch target resolved to its absolute path inside the installed app. This
starts the same file with the test interpreter (Kiro Crew is a test dependency),
speaks MCP over stdio, and checks the server answers from the app's data
directory: the tool list the built-in served, and a plan written there read back
through ``get_plan``.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parents[1]
LAUNCH = APP_ROOT / json.loads((APP_ROOT / "app.json").read_text("utf-8"))["mcpServers"]["mochi"][
    "args"
][0]

BUILTIN_TOOLS = {
    "get_plan",
    "update_plan",
    "perform_pet_action",
    "get_watchlist",
    "update_watchlist",
    "pin_file",
    "unpin_file",
    "read_mochi_file",
}


def _frames(*messages: dict) -> str:
    return "".join(json.dumps(m) + "\n" for m in messages)


def test_the_launcher_serves_the_built_in_tools_from_the_app_data_dir(tmp_path: Path) -> None:
    home = tmp_path / "crew"
    data = home / "apps" / "mochi" / "data"
    data.mkdir(parents=True)
    queue = {
        "tasks": [],
        "planned_at": "2026-11-18T09:00:00Z",
        "planned_until": "2026-11-18T21:00:00Z",
        "summary": "a quiet morning",
    }
    (data / "mochi-queue.json").write_text(json.dumps(queue), encoding="utf-8")
    env = {**os.environ, "KIROCREW_HOME": str(home), "PYTHONIOENCODING": "utf-8"}
    stdin = _frames(
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "t"}},
        },
        {"jsonrpc": "2.0", "method": "notifications/initialized"},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
        {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "get_plan", "arguments": {}}},
    )
    proc = subprocess.run(
        [sys.executable, str(LAUNCH)],
        input=stdin,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env,
        cwd=str(tmp_path),
        timeout=60,
    )
    replies = {}
    for line in proc.stdout.splitlines():
        if line.strip():
            message = json.loads(line)
            if "id" in message:
                replies[message["id"]] = message
    assert replies[1]["result"]["serverInfo"]["name"] == "mochi", proc.stderr
    assert {t["name"] for t in replies[2]["result"]["tools"]} == BUILTIN_TOOLS
    text = replies[3]["result"]["content"][0]["text"]
    assert json.loads(text)["planned_until"] == queue["planned_until"], text
