#!/usr/bin/env python3
"""Validate every projects/<slug>/project.yaml against projects/project.schema.json.

Run locally:  pip install pyyaml jsonschema && python scripts/validate_manifests.py
CI runs this on every push, so a broken manifest can never reach the site.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parent.parent
SLUG = re.compile(r"^[a-z0-9][a-z0-9-]{1,62}$")


def main() -> int:
    schema = json.loads((ROOT / "projects" / "project.schema.json").read_text())
    validator = Draft202012Validator(schema)
    errors: list[str] = []
    manifests = sorted((ROOT / "projects").glob("*/project.yaml"))
    for path in manifests:
        slug = path.parent.name
        if not SLUG.match(slug):
            errors.append(f"{slug}: folder name must be lowercase letters, digits and dashes")
        data = yaml.safe_load(path.read_text())
        for err in validator.iter_errors(data):
            where = "/".join(str(p) for p in err.absolute_path) or "(root)"
            errors.append(f"{slug}: {where}: {err.message}")
        if not isinstance(data, dict):
            continue
        # Files a manifest points to must exist next to it.
        for key in ("how_it_works",):
            if key in data and not (path.parent / data[key]).is_file():
                errors.append(f"{slug}: {key} file '{data[key]}' not found")
        content = (data.get("static") or {}).get("content")
        if content and not (path.parent / content).is_file():
            errors.append(f"{slug}: static.content file '{content}' not found")
        # Demo params must only use declared inputs.
        runner = data.get("runner") or {}
        names = {i["name"] for i in runner.get("inputs", []) if isinstance(i, dict) and "name" in i}
        for extra in sorted(set((runner.get("demo") or {}).get("params", {})) - names):
            errors.append(f"{slug}: runner.demo.params has unknown input '{extra}'")
    for line in errors:
        print(f"ERROR {line}")
    print(f"{len(manifests)} manifest(s) checked, {len(errors)} error(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
