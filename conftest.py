"""Make the app root importable as the package ``mochi`` for the tests.

The gateway loads the app's hook files into a synthetic package named after the
app, whose root is this directory, so ``hooks``, ``queue_file`` and the other
modules are siblings and ``backend`` is a subpackage; their relative imports
(``from . import queue_file``, ``from .. import hooks``) resolve inside the app.
A plain pytest run has no such loader, so this registers the same shape under
the app's name before any test module is imported: the root is a package whose
``__path__`` is this directory. Nothing here is on ``sys.path``, so no app module
can shadow a top-level module.

The data home is a throwaway directory for the whole session, set before any
test imports the gateway (Kiro Crew is a pinned test dependency, see
``tests/requirements.txt``), so no test can read or write a real data home.
"""

from __future__ import annotations

import atexit
import os
import shutil
import sys
import tempfile
import types
from pathlib import Path

PACKAGE = "mochi"
APP_ROOT = Path(__file__).resolve().parent

if PACKAGE not in sys.modules:
    _root = types.ModuleType(PACKAGE)
    _root.__path__ = [str(APP_ROOT)]  # type: ignore[attr-defined]
    _root.__package__ = PACKAGE
    _root.__file__ = None
    sys.modules[PACKAGE] = _root

_SESSION_HOME = Path(tempfile.mkdtemp(prefix="mochi-app-tests-"))
atexit.register(shutil.rmtree, _SESSION_HOME, ignore_errors=True)
for _var, _sub in (
    ("KIROCREW_HOME", "crew"),
    ("KIRO_HOME", "kiro"),
    ("HOME", "home"),
    ("USERPROFILE", "home"),
):
    (_SESSION_HOME / _sub).mkdir(parents=True, exist_ok=True)
    os.environ[_var] = str(_SESSION_HOME / _sub)
os.environ.setdefault("KIROCREW_SKIP_MODEL_DOWNLOAD", "1")
