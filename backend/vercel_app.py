"""Vercel entry point.

Vercel installs the dependencies from pyproject.toml but not this package itself, so the
`src/` layout is put on the import path here. Locally and in Docker the package is installed
and `portlab_api.main:app` is used directly.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from portlab_api.main import app

__all__ = ["app"]
