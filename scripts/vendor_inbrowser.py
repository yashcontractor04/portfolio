#!/usr/bin/env python3
"""Copy the source of every `in-browser` project into projects/<slug>/src/.

The site never loads Python code from another repo at runtime. Instead, this
script copies the code at the exact commit named in the manifest (`in_browser.
source.ref`) into this repo, where it is reviewed like any other change.

Run after adding or re-pinning an in-browser project:
    pip install pyyaml && python scripts/vendor_inbrowser.py
"""
from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
ALLOWED_SUFFIXES = {".py", ".txt", ".md", ".json", ".csv"}
MAX_FILE_BYTES = 200_000


def main() -> int:
    clones: dict[tuple[str, str], Path] = {}
    with tempfile.TemporaryDirectory() as tmp:
        for manifest in sorted((ROOT / "projects").glob("*/project.yaml")):
            data = yaml.safe_load(manifest.read_text())
            if data.get("type") != "in-browser":
                continue
            src = data["in_browser"]["source"]
            key = (src["repo"], src["ref"])
            if key not in clones:
                dest = Path(tmp) / str(len(clones))
                subprocess.run(["git", "init", "-q", str(dest)], check=True)
                subprocess.run(["git", "-C", str(dest), "fetch", "-q", "--depth", "1", src["repo"], src["ref"]], check=True)
                subprocess.run(["git", "-C", str(dest), "checkout", "-q", "FETCH_HEAD"], check=True)
                clones[key] = dest
            source_dir = (clones[key] / src["path"]).resolve()
            if not source_dir.is_relative_to(clones[key].resolve()) or not source_dir.is_dir():
                print(f"ERROR {manifest.parent.name}: bad source path {src['path']}")
                return 1
            target = manifest.parent / "src"
            shutil.rmtree(target, ignore_errors=True)
            target.mkdir()
            copied = 0
            for file in sorted(source_dir.iterdir()):  # top level only, on purpose
                if file.is_file() and file.suffix in ALLOWED_SUFFIXES and file.stat().st_size <= MAX_FILE_BYTES:
                    shutil.copy2(file, target / file.name)
                    copied += 1
            if not (target / data["in_browser"]["entry"]).is_file():
                print(f"ERROR {manifest.parent.name}: entry file not found after copy")
                return 1
            print(f"{manifest.parent.name}: {copied} files from {src['path']} @ {src['ref'][:7]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
