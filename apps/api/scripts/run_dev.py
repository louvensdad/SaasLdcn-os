"""Dev server launcher used by scripts/dev.mjs.

Calls uvicorn's Python API directly instead of `python -m uvicorn ...`.
Click's CLI entrypoint auto-expands glob-like args on Windows (its
`windows_expand_args` compat shim for shells that don't glob) since
`--reload-exclude app/data/*` matches real files in that directory --
Click was expanding the pattern into literal filenames and uvicorn's
own parser then rejected them as unexpected extra arguments. The
Python API takes reload_excludes as a real list, bypassing that CLI
parsing path entirely.
"""

import os
import sys

import uvicorn

if __name__ == "__main__":
    # `python scripts/run_dev.py` puts scripts/ on sys.path[0], not the cwd
    # (apps/api) -- add it so `app.main:app` resolves the same as it did
    # when uvicorn was launched via `python -m uvicorn` from apps/api.
    sys.path.insert(0, os.getcwd())
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=8001,
        reload=True,
        reload_excludes=["app/data/*"],
    )
