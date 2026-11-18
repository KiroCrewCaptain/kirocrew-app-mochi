"""The manifest's ``on_startup`` and ``on_shutdown`` entries.

The gateway loads every hook entry by executing its file into a FRESH module
object under the app's synthetic package, so a hook entry cannot hold state:
the module whose ``on_startup`` ran is not the one ``backend/routes.py``
imported. The owner loop and its runtime therefore stay in ``hooks.py``, which
no hook entry names, so it is imported once into the app's package and shared
by this entry and the routes (``tests/test_hook_loading.py``).
"""

from __future__ import annotations

from typing import Any

from .. import hooks


async def on_startup(ctx: Any) -> None:
    """Build the runtime and start the owner loop (``hooks.on_startup``)."""
    await hooks.on_startup(ctx)


async def on_shutdown(ctx: Any) -> None:
    """Stop the owner loop and flush state (``hooks.on_shutdown``)."""
    await hooks.on_shutdown(ctx)
