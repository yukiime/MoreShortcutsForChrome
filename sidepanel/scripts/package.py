"""Delegate public source and both extension packages to the repository packager."""
from pathlib import Path
import runpy

runpy.run_path(str(Path(__file__).resolve().parents[2] / 'scripts/package.py'), run_name='__main__')
