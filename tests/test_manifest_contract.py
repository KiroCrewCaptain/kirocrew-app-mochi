"""What an existing user's copy of the built-in needs from this repository.

Kiro Crew adopts a user's built-in record onto this repository in place, at a
pinned commit, with no consent dialog, so the tree must be something it can take
over unchanged:

- the same name, permissions, platform and ``defaultEnabled`` as the built-in
  (``tests/fixtures/builtin-app.json`` is its manifest at the commit this was
  ported from). A widened grant would be held back or force the app off, and
  adoption refuses that. The version may move forward, never back;
- the same agents, the same skills and the same MCP server name, the server
  started from this tree's own launcher and asking for nothing the built-in's
  declaration did not (adoption carries a stdio server only within it);
- NO ``desktop`` block. Desktop shells released before the window host learned
  to stand a built-in's shell code down (Kiro Crew 0.13.0-rc.1 to rc.3 and the
  ``release/0.13.0`` line) would host a declared pet beside the built-in pet
  they still draw, and a newer one would take the built-in's global shortcuts
  away. Without the block, every shell keeps drawing Mochi's windows from the
  pages Kiro Crew ships at ``/app-windows/mochi/``, over this app's routes
  (PORTING.md, "The desktop windows");
- nothing that needs a build at install time, and no symlinks or file names a
  Windows checkout cannot hold;
- a committed UI bundle that imports only the modules the dashboard provides and
  its own chunks, and from the two SDK modules only names every supported host
  exports (a named import of a missing export fails the whole bundle at load).
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parents[1]
DIST = APP_ROOT / "ui" / "dist"

HOST_MODULES = {
    "react",
    "react-dom",
    "react/jsx-runtime",
    "lucide-react",
    "@tanstack/react-query",
    "@kirocrew/app-sdk",
    "@kirocrew/app-sdk/ui",
}

# What a host BEFORE App Kit level 1 exports from each SDK module (its
# public/vendor/*.mjs stubs). A named import from these modules must stay in this
# set; a newer name is read off a namespace import behind an `in` check.
LEVEL0_EXPORTS = {
    "@kirocrew/app-sdk": {
        "useAppApi",
        "useAppEvents",
        "useTheme",
        "useAppInfo",
        "useNavigate",
        "useNotify",
        "useNavBadge",
        "useChatLauncher",
        "AppApiProvider",
        "useImeGuard",
        "useLanguageGeneration",
        "activeLocale",
        "fmtNumber",
        "fmtDate",
        "fmtTime",
        "fmtDateTime",
        "fmtRelative",
        "compareText",
    },
    "@kirocrew/app-sdk/ui": {
        "Card",
        "CardTitle",
        "Btn",
        "SendBtn",
        "Input",
        "SearchInput",
        "Badge",
        "SourceBadge",
        "StatCard",
        "Skeleton",
        "ContentSkeleton",
        "EmptyState",
        "PageHeader",
        "Toggle",
        "InfoTip",
        "SegmentedControl",
        "MarkdownRenderer",
        "Clickable",
        "Modal",
        "ErrorNotice",
        "SettingsSection",
        "SettingsCard",
        "SettingsInput",
        "SettingsToggle",
        "SettingsSelect",
    },
}

# Directories git ignores here (see .gitignore): never part of a clone.
_UNTRACKED_DIRS = {".git", "node_modules", "__pycache__", ".pytest_cache", ".venv"}
_WINDOWS_RESERVED = re.compile(r"^(con|prn|aux|nul|com[1-9]|lpt[1-9])$", re.IGNORECASE)
_STATIC_IMPORT = re.compile(
    r"^(?:import|export)\s+(?:(?P<clause>[^'\"]+?)\s+from\s+)?[\"'](?P<spec>[^\"']+)[\"'];?\s*$",
    re.MULTILINE,
)


def _manifest() -> dict:
    return json.loads((APP_ROOT / "app.json").read_text(encoding="utf-8"))


def _builtin() -> dict:
    return json.loads((APP_ROOT / "tests" / "fixtures" / "builtin-app.json").read_text("utf-8"))


def _bundles() -> list[Path]:
    return sorted(DIST.rglob("*.mjs"))


def _imports(path: Path) -> list[tuple[str, str]]:
    text = path.read_text(encoding="utf-8")
    return [(m["spec"], (m["clause"] or "").strip()) for m in _STATIC_IMPORT.finditer(text)]


def _named(clause: str) -> set[str]:
    """The imported names of ``{ a, b as c }``; empty for a namespace import."""
    match = re.search(r"\{([^}]*)\}", clause)
    if not match:
        return set()
    return {part.split(" as ")[0].strip() for part in match.group(1).split(",") if part.strip()}


def _tree() -> list[Path]:
    files: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(APP_ROOT):
        dirnames[:] = [d for d in dirnames if d not in _UNTRACKED_DIRS]
        files += [Path(dirpath) / name for name in filenames]
        files += [Path(dirpath) / d for d in dirnames if (Path(dirpath) / d).is_symlink()]
    return files


def _version(text: str) -> tuple[int, ...]:
    return tuple(int(part) for part in text.split("."))


# ── what adoption compares ──────────────────────────────────────────────────


def test_identity_and_grants_are_the_built_ins() -> None:
    mine, builtin = _manifest(), _builtin()
    for key in ("name", "permissions", "platform", "defaultEnabled", "agents", "skills"):
        assert mine[key] == builtin[key], key
    assert mine["defaultEnabled"] is False


def test_the_version_never_moves_back() -> None:
    assert _version(_manifest()["version"]) >= _version(_builtin()["version"])


def test_the_display_fields_are_the_built_ins() -> None:
    mine, builtin = _manifest(), _builtin()
    for key in (
        "displayName",
        "description",
        "author",
        "tags",
        "highlights",
        "useCases",
        "configuration",
    ):
        assert mine[key] == builtin[key], key


def test_no_desktop_block() -> None:
    assert "desktop" not in _manifest()


def test_the_mcp_server_is_the_built_ins_started_from_this_tree() -> None:
    """Adoption's ceiling: the wheel copy's server names, env, auto-approve and switch."""
    mine = _manifest()["mcpServers"]
    builtin = _builtin()["mcpServers"]
    assert set(mine) == set(builtin) == {"mochi"}
    server = mine["mochi"]
    assert set(server) <= {"command", "args", "env", "autoApprove", "disabled"}
    assert server["command"] == "python3"
    assert server["args"] == ["backend/mcp_launch.py"]
    assert (APP_ROOT / server["args"][0]).is_file()
    assert server.get("env", {}) == builtin["mochi"].get("env", {})
    assert set(server.get("autoApprove", [])) <= set(builtin["mochi"].get("autoApprove", []))
    assert bool(server.get("disabled")) == bool(builtin["mochi"].get("disabled"))


def test_every_declared_agent_and_skill_is_shipped() -> None:
    manifest = _manifest()
    for agent in manifest["agents"]:
        assert json.loads((APP_ROOT / agent).read_text(encoding="utf-8"))["name"]
    for skill in manifest["skills"]:
        assert (APP_ROOT / skill / "SKILL.md").is_file(), skill


def test_the_hook_entries_name_shipped_callables() -> None:
    hooks = _manifest()["backend"]["hooks"]
    assert set(hooks) == {"routes", "on_startup", "on_shutdown"}
    for entry in hooks.values():
        module, _, name = entry.partition(":")
        path = APP_ROOT / (module.replace(".", "/") + ".py")
        assert path.is_file(), entry
        assert re.search(rf"^(async )?def {name}\(", path.read_text("utf-8"), re.M), entry


def test_the_store_art_is_shipped() -> None:
    manifest = _manifest()
    for key in ("iconPath", "heroImage"):
        assert (APP_ROOT / manifest[key]).is_file(), key
    for shot in manifest["screenshots"]:
        assert (APP_ROOT / shot).is_file(), shot


# ── what an install needs from the tree ─────────────────────────────────────


def test_no_build_input_at_the_root() -> None:
    for name in ("package.json", "pyproject.toml", "setup.py", "requirements.txt", ".gitattributes"):
        assert not (APP_ROOT / name).exists(), name


def test_no_symlink_and_no_name_windows_cannot_hold() -> None:
    for path in _tree():
        assert not path.is_symlink(), path
        stem = path.name.split(".")[0]
        assert not _WINDOWS_RESERVED.match(stem), path
        assert not re.search(r'[<>:"|?*]', path.name), path


# ── the committed bundle ─────────────────────────────────────────────────────


def test_the_page_entry_is_committed() -> None:
    assert (APP_ROOT / "ui" / _manifest()["ui"]["entry"]).is_file()


def test_the_bundles_import_only_host_modules_and_their_own_chunks() -> None:
    bundles = _bundles()
    assert bundles
    for path in bundles:
        for spec, _clause in _imports(path):
            if spec.startswith("."):
                assert (path.parent / spec).resolve().is_file(), (path.name, spec)
            else:
                assert spec in HOST_MODULES, (path.name, spec)


def test_named_sdk_imports_are_level0_exports() -> None:
    for path in _bundles():
        for spec, clause in _imports(path):
            if spec in LEVEL0_EXPORTS:
                extra = _named(clause) - LEVEL0_EXPORTS[spec]
                assert not extra, (path.name, spec, sorted(extra))
