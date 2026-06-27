#!/usr/bin/env python3
"""check-card-js.py — Static contract check for card.js

Verifies that card.js contains the required postMessage identifiers,
state machine tokens, and security terms. This is a grep-level check,
not a runtime test. It catches accidental renames and source-field drift.

Usage:
    python check-card-js.py [path/to/card.js]

Exit 0 if all checks pass, 1 on any failure.
"""

import sys
from pathlib import Path

SCRIPT_DIR  = Path(__file__).parent
DEFAULT_JS  = SCRIPT_DIR.parent / "frontend/public/card/card.js"

FAIL = "\033[91mFAIL\033[0m"
OK   = "\033[92m OK \033[0m"

# Each entry: (label, required_string, description)
REQUIRED = [
    # Outbound source identifier
    ("outbound source",         "source:  'implicitex-coincard'",
     "Outbound postMessage must use source 'implicitex-coincard'"),

    # Inbound source identifier
    ("inbound source filter",   "msg.source !== 'coincard-host'",
     "Inbound listener must filter on source 'coincard-host'"),

    # Origin security
    ("allowedParentOrigins ref","allowedParentOrigins",
     "Manifest field allowedParentOrigins must be referenced"),
    ("trustedParentOrigin set", "state.trustedParentOrigin = event.origin",
     "trustedParentOrigin must be recorded from validated host messages"),
    ("trustedParentOrigin use", "state.trustedParentOrigin",
     "trustedParentOrigin must be used in outbound targeting"),

    # State machine completeness
    ("TRANSFER_INTENT_READY",   "'TRANSFER_INTENT_READY'",
     "State TRANSFER_INTENT_READY must be present"),
    ("MANIFEST_LOADING",        "'MANIFEST_LOADING'",
     "State MANIFEST_LOADING must be present"),
    ("REVOKED state",           "transition('REVOKED')",
     "REVOKED transition must be present"),

    # amountMode enum
    ("sender_input mode",       "sender_input",
     "amountMode 'sender_input' must be the default/referenced value"),
    ("locked mode",             "'locked'",
     "amountMode 'locked' must be handled"),

    # payload key (not data)
    ("payload key outbound",    "payload: payload",
     "Outbound postMessage must use 'payload:' not 'data:'"),

    # Pre-manifest drop guard
    ("pre-manifest drop",       "if (!state.manifest) return",
     "Inbound messages must be dropped before manifest loads"),
]


def main():
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_JS

    if not path.exists():
        print(f"ERROR: {path} not found", file=sys.stderr)
        sys.exit(1)

    text = path.read_text()
    print(f"Checking: {path}\n")

    failures = []
    for label, needle, description in REQUIRED:
        found = needle in text
        status = OK if found else FAIL
        print(f"  [{status}] {label}")
        if not found:
            failures.append(f"  Missing: {needle!r}\n  → {description}")

    print()
    if failures:
        for f in failures:
            print(f)
        print(f"\n{len(failures)} check(s) failed.", file=sys.stderr)
        sys.exit(1)

    print(f"All {len(REQUIRED)} checks passed.")
    sys.exit(0)


if __name__ == "__main__":
    main()
