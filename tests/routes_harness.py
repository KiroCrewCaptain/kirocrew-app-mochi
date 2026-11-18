"""Serve the app's route records the way the gateway's ``RouteRegistry`` does.

:func:`mount` adds each record :func:`register_routes` returns to an aiohttp
application under ``/api/apps/mochi``, calling ``handler(request, ctx)`` as the
registry does, so a suite written against the built-in's aiohttp routes drives
the same handlers through the same table.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from aiohttp import web

from mochi.backend import routes

BASE = "/api/apps/mochi"


def app_context(data_dir: Path) -> Any:
    """The gateway's own app context for ``mochi`` (its ``require_owner`` included)."""
    from kiro_crew.apps.context import AppContext

    return AppContext(name="mochi", data_dir=Path(data_dir))


def mount(app: web.Application, ctx: Any | None = None) -> web.Application:
    """Add the route records to *app* under the app's base path. Returns *app*."""
    ctx = ctx if ctx is not None else app_context(Path("."))
    for record in routes.register_routes(ctx):

        async def _dispatch(request: web.Request, _record: Any = record) -> web.StreamResponse:
            return await _record.handler(request, ctx)

        app.router.add_route(record.method, BASE + record.path, _dispatch)
    return app
