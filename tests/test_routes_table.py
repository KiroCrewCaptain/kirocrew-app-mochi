"""The route table is the built-in's, method for method and in the same order.

The desktop shell's built-in pet, panel, settings and avatar windows (served by
Kiro Crew at ``/app-windows/mochi/``) and the dashboard page call these paths, so
an adopted copy serves every one the built-in served, under the same base.
"""

from __future__ import annotations

from mochi.backend import routes

#: The built-in's ``register_routes`` table (Kiro Crew ``apps/builtins/mochi``).
BUILTIN_TABLE = [
    ("GET", "/watchlist"),
    ("POST", "/watchlist/update"),
    ("POST", "/watchlist/clear-completed"),
    ("GET", "/stats"),
    ("GET", "/bg-usage"),
    ("POST", "/presence"),
    ("GET", "/pinned"),
    ("GET", "/packs/{pack_id}/export"),
    ("POST", "/packs/content"),
    ("POST", "/packs/import"),
    ("POST", "/reset"),
    ("POST", "/walk-done"),
    ("POST", "/walk-distance"),
    ("POST", "/peeking"),
    ("POST", "/stat"),
    ("POST", "/displays"),
    ("POST", "/pinned/unpin"),
    ("POST", "/pinned/mark-seen"),
    ("GET", "/soul"),
    ("GET", "/pet-state"),
    ("POST", "/pet-event"),
    ("POST", "/quiet"),
    ("GET", "/plan"),
    ("GET", "/activity"),
    ("GET", "/settings"),
    ("POST", "/settings"),
    ("GET", "/packs"),
    ("POST", "/packs"),
    ("GET", "/packs/{pack_id}"),
    ("DELETE", "/packs/{pack_id}"),
    ("GET", "/packs/{pack_id}/file/{filename}"),
    ("GET", "/petdex/installed"),
    ("POST", "/petdex/import"),
    ("POST", "/mcp-tools/{name}"),
]


def test_the_route_table_is_the_built_ins(_registry_ctx) -> None:
    table = [(r.method, r.path) for r in routes.register_routes(_registry_ctx)]
    assert table == BUILTIN_TABLE


def test_every_handler_takes_the_registry_arguments(_registry_ctx) -> None:
    import inspect

    for record in routes.register_routes(_registry_ctx):
        params = list(inspect.signature(record.handler, follow_wrapped=False).parameters)
        assert params[:2] == ["request", "ctx"], (record.method, record.path)
