#!/usr/bin/env python3
"""Trusted bridge to the official webull-openapi-python-sdk.

Node has no first-party Webull SDK — the retired lib/data-provider/webull.ts
adapter itself never implemented the raw HTTP/signature layer; it only
documented the SDK method names to call (get_account_list(),
get_account_balance(account_id), get_account_positions(account_id)) because
"the exact REST JSON is behind the SDK" and must be verified against live
responses. scripts/sync_webull.mjs shells out to this script rather than
guessing at an unpublished wire-level signing scheme.

Called with WEBULL_APP_KEY / WEBULL_APP_SECRET / WEBULL_REGION /
WEBULL_BASE_URL in the environment. Prints exactly one JSON object to stdout:
  {"accounts": [...raw account/balance dicts...], "positions": [...raw position dicts, each tagged with account_id...]}
or on failure:
  {"error": "human-readable reason"}

Requires: pip install webull-openapi-python-sdk (confirm the exact PyPI
package/import name against https://developer.webull.com/apis/docs/sdk/
before first live use — Webull's wire-level signing is not publicly
documented outside the SDK, so this bridge intentionally never reimplements
it by hand).
"""
from __future__ import annotations

import json
import os
import sys


def emit_error(message: str) -> None:
    print(json.dumps({"error": message}))


def main() -> None:
    app_key = os.environ.get("WEBULL_APP_KEY", "")
    app_secret = os.environ.get("WEBULL_APP_SECRET", "")
    region = os.environ.get("WEBULL_REGION", "us")

    if not app_key or not app_secret:
        emit_error("WEBULL_APP_KEY/WEBULL_APP_SECRET not set")
        sys.exit(1)

    try:
        # Import name is unverified against a live install in this sandboxed
        # environment (no network access to PyPI / Webull's OpenAPI host) —
        # confirm against the official SDK docs before relying on this path.
        from webullsdktrade.api_client import ApiClient  # type: ignore
        from webullsdktrade.client import TradeClient  # type: ignore
    except ImportError as error:
        emit_error(
            "webull-openapi-python-sdk is not installed or the import path has "
            f"drifted ({error}). Install/verify it, or pass --fixture to "
            "scripts/sync_webull.mjs for an offline dry run."
        )
        sys.exit(1)

    try:
        api_client = ApiClient(app_key, app_secret, region)
        trade_client = TradeClient(api_client)

        raw_accounts = trade_client.account_v2.get_account_list() or []
        accounts: list[dict] = []
        positions: list[dict] = []
        for raw_account in raw_accounts:
            account_id = raw_account.get("account_id") or raw_account.get("accountId")
            balance = trade_client.account_v2.get_account_balance(account_id) or {}
            accounts.append({**raw_account, **balance})

            raw_positions = trade_client.account_v2.get_account_position(account_id) or []
            for raw_position in raw_positions:
                positions.append({**raw_position, "account_id": account_id})

        print(json.dumps({"accounts": accounts, "positions": positions}))
    except Exception as error:  # noqa: BLE001 - surface any SDK/network failure to the caller
        emit_error(f"Webull API call failed: {error}")
        sys.exit(1)


if __name__ == "__main__":
    main()
