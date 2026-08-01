#!/usr/bin/env python3
"""Generate a deterministic Coin Card integrity manifest.

This is a proof tool, not production signing infrastructure. It hashes declared
assets, builds a canonical manifest, and writes an unsigned development manifest
that verify_manifest.py can validate.
"""

import argparse
import hashlib
import json
import sys
from pathlib import Path


SCHEMA_VERSION = "coin-card-manifest.v1"
MANIFEST_SCOPE = "coin-card-runtime-package"
DEFAULT_VERSION = "coin-card.v1"
DEFAULT_LAYOUT_VERSION = "coin-card-layout.v1"
DEFAULT_BUILD_VERSION = "dev"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return "sha256:" + digest.hexdigest()


def canonical_json_bytes(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def normalize_asset_path(root: Path, asset: Path) -> str:
    try:
        return asset.resolve().relative_to(root.resolve()).as_posix()
    except ValueError as exc:
        raise ValueError(f"asset is outside root: {asset}") from exc


def build_manifest(args: argparse.Namespace) -> dict:
    root = args.root.resolve()
    if not root.exists() or not root.is_dir():
        raise ValueError(f"root does not exist or is not a directory: {root}")

    assets = []
    for raw_asset in args.asset:
        asset_path = (root / raw_asset).resolve()
        if not asset_path.exists() or not asset_path.is_file():
            raise ValueError(f"asset does not exist or is not a file: {raw_asset}")
        rel_path = normalize_asset_path(root, asset_path)
        assets.append({
            "path": rel_path,
            "sha256": sha256_file(asset_path),
            "bytes": asset_path.stat().st_size,
        })

    assets.sort(key=lambda item: item["path"])

    manifest = {
        "schemaVersion": SCHEMA_VERSION,
        "scope": MANIFEST_SCOPE,
        "coinCardVersion": args.coin_card_version,
        "layoutVersion": args.layout_version,
        "buildVersion": args.build_version,
        "assets": assets,
        "signature": {
            "mode": "unsigned-dev",
            "algorithm": None,
            "value": None,
        },
    }
    manifest["manifestHash"] = "sha256:" + hashlib.sha256(canonical_json_bytes(manifest)).hexdigest()
    return manifest


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True, help="Root directory assets are resolved against.")
    parser.add_argument("--asset", action="append", default=[], help="Asset path relative to --root. Repeatable.")
    parser.add_argument("--out", type=Path, required=True, help="Manifest output path.")
    parser.add_argument("--coin-card-version", default=DEFAULT_VERSION)
    parser.add_argument("--layout-version", default=DEFAULT_LAYOUT_VERSION)
    parser.add_argument("--build-version", default=DEFAULT_BUILD_VERSION)
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    if not args.asset:
        print("ERROR: at least one --asset is required", file=sys.stderr)
        return 1

    try:
        manifest = build_manifest(args)
    except ValueError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"Wrote {args.out}")
    print(f"manifestHash {manifest['manifestHash']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
