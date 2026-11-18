"""The routes reach the runtime the startup hook built, however the gateway loads them.

The gateway loads every hook entry (``backend.lifecycle:on_startup``,
``backend.routes:register_routes``, ``backend.lifecycle:on_shutdown``) by
executing its file into a FRESH module object under the app's synthetic package
(``kiro_crew.apps.module_loader.load_app_module``). A runtime kept as a global of
a hook entry would therefore be invisible to the routes, and every request would
answer 503 ``runtime_not_started`` on an enabled app. The owner loop and its
runtime live in ``hooks.py``, which no hook entry names, so both entries import
one shared copy of it. These tests drive the gateway's own loader and dispatcher.
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

import pytest

APP_ROOT = Path(__file__).resolve().parents[1]
MANIFEST = json.loads((APP_ROOT / "app.json").read_text(encoding="utf-8"))
HOOKS = MANIFEST["backend"]["hooks"]
_LOADED_PREFIX = "_kirocrew_app_mochi"


@pytest.fixture()
def installed_copy(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """A copy of the app tree, as an install lays it out, trusted, and a clean loader.

    The operator's execution grant is what admits an installed app's Python (an
    adoption writes one bound to this repository); the loader asks it through
    ``app_execution_denied``, which this models as granted.
    """
    from kiro_crew.apps import module_loader

    monkeypatch.setattr(module_loader, "app_execution_denied", lambda *a, **k: None)
    root = tmp_path / "apps" / "mochi"
    shutil.copytree(
        APP_ROOT,
        root,
        ignore=shutil.ignore_patterns("tests", "ui", "capture", "docs", ".git", "__pycache__"),
    )
    before = {name for name in sys.modules if name.startswith(_LOADED_PREFIX)}
    yield root
    for name in [n for n in sys.modules if n.startswith(_LOADED_PREFIX) and n not in before]:
        del sys.modules[name]


def test_every_manifest_entry_resolves_through_the_gateway_loader(installed_copy: Path) -> None:
    from kiro_crew.apps.module_loader import load_app_module

    for entry in HOOKS.values():
        assert callable(load_app_module("mochi", installed_copy, entry)), entry


@pytest.mark.asyncio
async def test_routes_loaded_first_see_the_runtime_a_fresh_lifecycle_module_built(
    installed_copy: Path,
) -> None:
    from kiro_crew.apps.context import AppContext
    from kiro_crew.apps.module_loader import load_app_module

    register_routes = load_app_module("mochi", installed_copy, HOOKS["routes"])
    on_startup = load_app_module("mochi", installed_copy, HOOKS["on_startup"])
    on_shutdown = load_app_module("mochi", installed_copy, HOOKS["on_shutdown"])
    data = installed_copy / "data"
    data.mkdir()
    ctx = AppContext(name="mochi", data_dir=data)
    records = register_routes(ctx)
    await on_startup(ctx)
    try:
        routes_module = sys.modules[register_routes.__module__]
        assert routes_module.hooks._runtime is not None
        plan = {(r.method, r.path): r.handler for r in records}[("GET", "/plan")]
        assert plan is not None
    finally:
        await on_shutdown(ctx)
        sys.modules[f"{_LOADED_PREFIX}.hooks"]._runtime = None


@pytest.mark.asyncio
async def test_dispatch_enable_starts_the_runtime(installed_copy: Path, monkeypatch) -> None:
    """End to end through the real dispatcher: enable runs ``on_startup``."""
    from kiro_crew.apps import lifecycle as lc

    monkeypatch.setattr(lc, "app_dir", lambda name: installed_copy)
    # A host whose wheel still ships a built-in Mochi resolves the record from that
    # package until the record is adopted; an adopted record's wheel copy is
    # released, and so is the copy of a host that ships none.
    monkeypatch.setattr(lc, "shipped_builtin_app_root", lambda name: None)
    dispatcher = lc.LifecycleDispatcher()
    app_info = {"name": "mochi", "manifest": MANIFEST}
    try:
        assert await dispatcher.dispatch_enable(app_info) is True
        assert sys.modules[f"{_LOADED_PREFIX}.hooks"]._runtime is not None
    finally:
        await dispatcher.dispatch_disable(app_info)
        sys.modules[f"{_LOADED_PREFIX}.hooks"]._runtime = None
