import os

# Never hit Yahoo Finance from tests: prices come from the bundled snapshot.
os.environ.setdefault("PORTLAB_OFFLINE", "1")
