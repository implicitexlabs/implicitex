"""
seed_fixture.py — seed or teardown an IX ID + active payment route in the
Firestore emulator for local browser integration testing.

Must be run with FIRESTORE_EMULATOR_HOST=localhost:8080.

Usage:
    python seed_fixture.py seed    # write test fixture
    python seed_fixture.py clean   # remove test fixture
    python seed_fixture.py dump    # print current state of fixture IX ID
"""

import sys
import os
from datetime import datetime, timezone, timedelta

PROJECT = "ix-id-test"
HANDLE  = "test-alice"

# Known test destination address (not a real funded wallet — Polygon testnet)
DEST_ADDRESS = "0xaabbccddaabbccddaabbccddaabbccddaabbccdd"
CLAIM_ID     = "ci-local-proof-001"
CLAIM_ID_B   = "ci-local-proof-002"   # used for stale-route test

ASSET = {
    "symbol":                "USDC",
    "contract":              "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
    "asset_binding_version": "polygon-pos-native-usdc-v1",
}


def get_db():
    from google.cloud import firestore  # noqa: PLC0415
    return firestore.Client(project=PROJECT)


def seed(db):
    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=365)

    # Root IX ID document
    db.collection("ix_ids").document(HANDLE).set({
        "ix_id":                         HANDLE,
        "owner_account_id":              "local-proof-account",
        "ix_id_state":                   "ACTIVE",
        "ix_id_state_version":           0,
        "ix_id_state_changed_at":        now,
        "created_at":                    now,
        "display_name":                  "Test Alice",
        "bio":                           "Local integration test fixture",
        "website_url":                   "https://example.com",
        "active_payment_route_address":  DEST_ADDRESS,
        "active_payment_route_claim_id": CLAIM_ID,
        "routing_suspended":             False,
    })

    # Payment route claim (what the public route endpoint exposes)
    db.collection("ix_ids").document(HANDLE)\
      .collection("verification_claims").document(CLAIM_ID).set({
        "claim_id":    CLAIM_ID,
        "claim_type":  "PAYMENT_ROUTE",
        "status":      "ACTIVE",
        "subject":     DEST_ADDRESS,
        "chain_id":    137,
        "asset":       ASSET,
        "verified_at": now,
        "expires_at":  expires,
    })

    print(f"[seed] ix_ids/{HANDLE} + claim {CLAIM_ID} written to emulator")


def rotate_to_claim_b(db):
    """Rotate the active route to a different address + claim_id (stale-route test)."""
    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=365)
    new_dest = "0x1111111111111111111111111111111111111111"

    db.collection("ix_ids").document(HANDLE).update({
        "active_payment_route_address":  new_dest,
        "active_payment_route_claim_id": CLAIM_ID_B,
    })

    db.collection("ix_ids").document(HANDLE)\
      .collection("verification_claims").document(CLAIM_ID_B).set({
        "claim_id":    CLAIM_ID_B,
        "claim_type":  "PAYMENT_ROUTE",
        "status":      "ACTIVE",
        "subject":     new_dest,
        "chain_id":    137,
        "asset":       ASSET,
        "verified_at": now,
        "expires_at":  expires,
    })

    print(f"[seed] Rotated to claim_B={CLAIM_ID_B} dest={new_dest}")


def restore_to_claim_a(db):
    """Restore original route (undo rotate)."""
    db.collection("ix_ids").document(HANDLE).update({
        "active_payment_route_address":  DEST_ADDRESS,
        "active_payment_route_claim_id": CLAIM_ID,
    })
    print(f"[seed] Restored to claim_A={CLAIM_ID}")


def clean(db):
    ref = db.collection("ix_ids").document(HANDLE)
    for claim in ref.collection("verification_claims").stream():
        claim.reference.delete()
    ref.delete()
    print(f"[seed] ix_ids/{HANDLE} deleted from emulator")


def dump(db):
    doc = db.collection("ix_ids").document(HANDLE).get()
    if not doc.exists:
        print(f"[seed] ix_ids/{HANDLE} does not exist")
        return
    import json
    def _serial(o):
        if hasattr(o, "isoformat"):
            return o.isoformat()
        return str(o)
    print(json.dumps(doc.to_dict(), default=_serial, indent=2))
    for c in db.collection("ix_ids").document(HANDLE).collection("verification_claims").stream():
        print(f"  claim: {c.id}")
        print(json.dumps(c.to_dict(), default=_serial, indent=2))


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "seed"
    emulator = os.environ.get("FIRESTORE_EMULATOR_HOST")
    if not emulator:
        print("ERROR: FIRESTORE_EMULATOR_HOST not set", file=sys.stderr)
        sys.exit(1)
    db = get_db()
    if cmd == "seed":
        seed(db)
    elif cmd == "rotate":
        rotate_to_claim_b(db)
    elif cmd == "restore":
        restore_to_claim_a(db)
    elif cmd == "clean":
        clean(db)
    elif cmd == "dump":
        dump(db)
    else:
        print(f"Unknown command: {cmd}", file=sys.stderr)
        sys.exit(1)
