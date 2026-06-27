#!/usr/bin/env python3
"""verify-manifest.py — Coin Card manifest validator

Usage:
    python verify-manifest.py [manifest.json ...]

Validates one or more manifest files against the Coin Card manifest schema.
Exits 0 if all pass, 1 on any failure.

Checks beyond JSON Schema:
  - Ethereum address checksum format
  - feeBps range (0–10000)
  - chainId/token combination against known network list
  - amountMode consistency (locked requires lockedAmount)
  - allowedParentOrigins entry format
"""

import json
import re
import sys
from pathlib import Path

try:
    import jsonschema
except ImportError:
    print("ERROR: jsonschema not installed. Run: pip install jsonschema", file=sys.stderr)
    sys.exit(1)

# ── Paths ──────────────────────────────────────────────────────────────────────
SCRIPT_DIR   = Path(__file__).parent
SCHEMA_PATH  = SCRIPT_DIR / "manifest.schema.json"
DEFAULT_MANIFESTS = [
    SCRIPT_DIR.parent / "frontend/public/registry/coincards/cc_demo_implicitex.json",
]

# ── Known valid chainId / token combinations ───────────────────────────────────
KNOWN_CHAINS = {
    1:     {"name": "Ethereum",       "tokens": ["USDC", "USDT", "WETH"]},
    137:   {"name": "Polygon",        "tokens": ["USDC", "USDT", "WMATIC"]},
    80002: {"name": "Polygon Amoy",   "tokens": ["USDC"]},
    8453:  {"name": "Base",           "tokens": ["USDC"]},
}

# ── Ethereum address pattern ────────────────────────────────────────────────────
ETH_ADDRESS_RE = re.compile(r"^0x[0-9a-fA-F]{40}$")

# ── Allowed parent origin pattern ───────────────────────────────────────────────
ORIGIN_RE = re.compile(r"^(\*|https?://[^\s/$.?#].[^\s]*)$")

FAIL = "\033[91m FAIL\033[0m"
OK   = "\033[92m  OK\033[0m"


def load_json(path: Path):
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError as e:
        print(f"  [{FAIL}] JSON parse error: {e}")
        return None


def validate(manifest_path: Path, schema: dict) -> bool:
    print(f"\n── {manifest_path} ──")
    data = load_json(manifest_path)
    if data is None:
        return False

    errors = []

    # 1. JSON Schema validation
    validator = jsonschema.Draft7Validator(schema)
    schema_errors = sorted(validator.iter_errors(data), key=lambda e: list(e.absolute_path))
    for e in schema_errors:
        path = " → ".join(str(p) for p in e.absolute_path) or "(root)"
        errors.append(f"Schema [{path}]: {e.message}")

    # 2. Ethereum address format
    recipient = data.get("recipient", "")
    if recipient and not ETH_ADDRESS_RE.match(recipient):
        errors.append(f"recipient: not a valid EVM address: {recipient!r}")

    # 3. feeBps range
    fee_bps = data.get("feeBps")
    if fee_bps is not None:
        if not isinstance(fee_bps, int) or fee_bps < 0 or fee_bps > 10000:
            errors.append(f"feeBps: must be integer 0–10000, got {fee_bps!r}")

    # 4. chainId / token combination
    chain_id = data.get("chainId")
    token    = (data.get("token") or "").upper()
    if chain_id is not None and token:
        if chain_id in KNOWN_CHAINS:
            if token not in KNOWN_CHAINS[chain_id]["tokens"]:
                errors.append(
                    f"chainId {chain_id} ({KNOWN_CHAINS[chain_id]['name']}): "
                    f"token {token!r} not in known list "
                    f"{KNOWN_CHAINS[chain_id]['tokens']}"
                )
        # Unknown chainId is a warning, not an error (forward compatibility)

    # 5. amountMode consistency
    amount_mode    = data.get("amountMode", "sender_input")
    locked_amount  = data.get("lockedAmount")
    valid_modes    = {"sender_input", "locked", "suggested"}
    if amount_mode not in valid_modes:
        errors.append(f"amountMode: {amount_mode!r} is not a valid value; expected one of {sorted(valid_modes)}")
    if amount_mode == "locked" and locked_amount is None:
        errors.append("amountMode is 'locked' but lockedAmount is absent")
    if amount_mode in ("sender_input", "suggested") and locked_amount is not None:
        errors.append(f"amountMode is {amount_mode!r} but lockedAmount is set (ambiguous)")

    # 6. allowedParentOrigins entry format
    origins = data.get("allowedParentOrigins", [])
    for i, o in enumerate(origins):
        if not ORIGIN_RE.match(str(o)):
            errors.append(f"allowedParentOrigins[{i}]: {o!r} is not a valid origin or '*'")

    # 7. Status / revokedAt consistency
    status     = data.get("status")
    revoked_at = data.get("revokedAt")
    if status == "revoked" and revoked_at is None:
        errors.append("status is 'revoked' but revokedAt is null")
    if status == "active" and revoked_at is not None:
        errors.append("status is 'active' but revokedAt is set")

    if errors:
        for e in errors:
            print(f"  [{FAIL}] {e}")
        return False

    # Summary of key fields
    print(f"  [{OK} ] schema:     {data.get('schema')}")
    print(f"  [{OK} ] cardId:     {data.get('cardId')}")
    print(f"  [{OK} ] status:     {data.get('status')}")
    print(f"  [{OK} ] owner:      {data.get('owner', {}).get('name')} · {data.get('owner', {}).get('domain')}")
    print(f"  [{OK} ] recipient:  {recipient[:10]}…{recipient[-6:]}" if len(recipient) > 16 else f"  [{OK} ] recipient:  {recipient}")
    print(f"  [{OK} ] chain:      {chain_id} ({data.get('chainName', '?')}) / {token}")
    print(f"  [{OK} ] feeBps:     {fee_bps if fee_bps is not None else '(chain default)'}")
    print(f"  [{OK} ] amountMode: {amount_mode}")
    print(f"  [{OK} ] origins:    {origins}")
    return True


def main():
    schema = load_json(SCHEMA_PATH)
    if schema is None:
        print(f"ERROR: could not load schema from {SCHEMA_PATH}", file=sys.stderr)
        sys.exit(1)

    paths = [Path(p) for p in sys.argv[1:]] if len(sys.argv) > 1 else DEFAULT_MANIFESTS

    results = []
    for p in paths:
        if not p.exists():
            print(f"\n── {p} ──")
            print(f"  [{FAIL}] file not found")
            results.append(False)
        else:
            results.append(validate(p, schema))

    print()
    passed = sum(results)
    total  = len(results)
    if passed == total:
        print(f"All {total} manifest(s) passed.")
        sys.exit(0)
    else:
        print(f"{total - passed}/{total} manifest(s) failed.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
