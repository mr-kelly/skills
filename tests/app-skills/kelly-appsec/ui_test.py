from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "security-suite-harness"))
from browser import main

if __name__ == "__main__":
    main("kelly-appsec")
