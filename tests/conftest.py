"""Fixtures shared by the ported suites.

``backend/routes.py`` reaches the owner gate through the app context the
gateway's ``RouteRegistry`` hands each handler (``ctx.require_owner``). The
built-in's suites call handlers directly, as aiohttp handlers, so every test runs
with the context a registry dispatch would carry: the gateway's own
``AppContext`` for ``mochi``, whose ``require_owner`` is the host's owner gate.
A test that dispatches through :func:`routes_harness.mount` gets the same one.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Iterator

import pytest

TESTS = Path(__file__).resolve().parent
if str(TESTS) not in sys.path:
    sys.path.insert(0, str(TESTS))


@pytest.fixture(autouse=True)
def _registry_ctx(tmp_path_factory: pytest.TempPathFactory) -> Iterator[object]:
    from routes_harness import app_context

    from mochi.backend import routes

    ctx = app_context(tmp_path_factory.mktemp("mochi-ctx"))
    token = routes._request_ctx.set(ctx)
    try:
        yield ctx
    finally:
        routes._request_ctx.reset(token)
