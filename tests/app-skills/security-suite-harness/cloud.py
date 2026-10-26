"""Reuse the existing real Cloud OAuth test; do not manufacture Cloud success."""

from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path


def main(skill: str) -> None:
    root = Path(__file__).resolve().parents[3]
    path = root / "tests/app-skills/kelly-audit/cloud_oauth_test.py"
    spec = importlib.util.spec_from_file_location("shared_cloud_oauth_acceptance", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.APP_ROOT = root / "skills" / skill / "content" / f"{skill}-app"
    config = module.load_config()
    if config is None:
        print(json.dumps({"skill": skill, "cloudOAuth": "skipped", "liveCustomerApi": "not-contacted", "liveAws": "skipped", "reason": "No dedicated Cloud test identity configured; local OSS and controlled fixtures are verified separately."}))
        return
    config = {**config, "allow_mutation": False}
    module.run_cloud_oauth(config)
    print(json.dumps({"skill": skill, "cloudOAuth": "passed", "mode": "OAuth-only", "cloudMutations": False, "liveAws": "skipped"}))
