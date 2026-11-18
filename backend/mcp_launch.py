"""Start Mochi's stdio MCP server: ``python3 backend/mcp_launch.py``.

The gateway resolves a stdio entry whose ``command`` is a bare ``python3`` and
whose first argument is a ``.py`` file inside the app to that file's absolute
path, and starts it with the gateway's own interpreter. Run as a script, this
file has no package, so it gives the app's tree one: it registers the app root as
a package under a name no other code uses, then imports ``mcp_server`` from it,
whose relative imports (``from . import queue_file``) then resolve inside the app
as they do under the gateway's hook loader.

``sys.path[0]`` is this file's directory when it runs as a script. It is removed
before anything is imported, so a module here (``routes.py``) can never shadow a
top-level module the gateway or the standard library imports.

An installed copy lives in its record's directory, ``<data home>/apps/mochi/``. The
MCP host may start this server without the gateway's environment, and so without
``KIROCREW_HOME``: the built-in's launch pinned it, an installed app's launch
carries none. The server's data directory, its audit of every tool call and its
sensitive-path rules all resolve the data home through the gateway's own modules,
so before any of them is imported the launcher names the data home the record is
in, unless the host named one.
"""

from __future__ import annotations

import importlib
import os
import sys
import types
from pathlib import Path

#: The package the app root is registered under in this process.
PACKAGE = "_kirocrew_app_mochi_mcp"


def _register_app_package() -> str:
    here = Path(__file__).resolve().parent
    if sys.path and Path(sys.path[0] or ".").resolve() == here:
        sys.path.pop(0)
    if PACKAGE not in sys.modules:
        root = types.ModuleType(PACKAGE)
        root.__path__ = [str(here.parent)]  # type: ignore[attr-defined]
        root.__package__ = PACKAGE
        sys.modules[PACKAGE] = root
    return PACKAGE


def _pin_data_home(app_root: Path) -> None:
    """``KIROCREW_HOME`` for an installed record started without the gateway's env."""
    if (app_root / "installed.json").is_file() and app_root.parent.name == "apps":
        os.environ.setdefault("KIROCREW_HOME", str(app_root.parent.parent))


def main() -> None:
    _pin_data_home(Path(__file__).resolve().parent.parent)
    package = _register_app_package()
    importlib.import_module(f"{package}.mcp_server").run_mcp_server()


if __name__ == "__main__":
    main()
