"""Only ``_host.py`` reaches Kiro Crew, and only by name.

The gateway's public surface for an app is the ``AppContext`` its hooks get and
the structural route records the registry accepts. Mochi also uses host modules
no App Kit seam provides yet (see PORTING.md), and those are resolved from the
running gateway in ``_host.py`` alone, through ``importlib`` by name, so a missing
one refuses the operation instead of breaking the module load. No other app
module may import ``kiro_crew`` in any form, and ``_host.py`` has no ``kiro_crew``
import statement either.
"""

from __future__ import annotations

import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
_NOT_APP_SOURCE = frozenset({"tests", "capture", "ui", "conftest.py"})


def _app_sources() -> list[Path]:
    return [
        p
        for p in sorted(ROOT.rglob("*.py"))
        if p.relative_to(ROOT).parts[0] not in _NOT_APP_SOURCE
    ]


def _host_imports(path: Path) -> list[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    found: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            found += [a.name for a in node.names if a.name.split(".")[0] == "kiro_crew"]
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            if node.module.split(".")[0] == "kiro_crew":
                found.append(node.module)
        elif isinstance(node, ast.Call):
            name = getattr(node.func, "attr", None) or getattr(node.func, "id", None)
            if name in {"import_module", "__import__"} and node.args:
                arg = node.args[0]
                if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
                    if arg.value.split(".")[0] == "kiro_crew":
                        found.append(arg.value)
    return found


def _names_the_host_package(path: Path) -> bool:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    return any(
        isinstance(node, ast.Constant) and node.value == "kiro_crew" for node in ast.walk(tree)
    )


def test_the_app_ships_python() -> None:
    names = {p.name for p in _app_sources()}
    assert {"hooks.py", "routes.py", "mcp_server.py", "_host.py"} <= names


def test_no_app_module_imports_kiro_crew() -> None:
    offenders = {str(p.relative_to(ROOT)): _host_imports(p) for p in _app_sources()}
    assert {k: v for k, v in offenders.items() if v} == {}


def test_only_the_host_shim_names_the_host_package() -> None:
    naming = [str(p.relative_to(ROOT)) for p in _app_sources() if _names_the_host_package(p)]
    assert naming == ["_host.py"]
