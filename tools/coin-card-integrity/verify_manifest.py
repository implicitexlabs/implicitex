#!/usr/bin/env python3
"""Verify a deterministic Coin Card integrity manifest.

This proof verifier checks manifest structure, manifestHash, and protected asset
hashes. It only accepts signature.mode = unsigned-dev for now; production
signature verification is a future layer.
"""

import argparse
import hashlib
import json
import sys
from pathlib import Path


SCHEMA_VERSION = "coin-card-manifest.v1"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return "sha256:" + digest.hexdigest()


def canonical_json_bytes(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def load_manifest(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"manifest JSON parse failed: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError("manifest root must be an object")
    return data


def expected_manifest_hash(manifest: dict) -> str:
    body = dict(manifest)
    body.pop("manifestHash", None)
    return "sha256:" + hashlib.sha256(canonical_json_bytes(body)).hexdigest()


def verify_manifest(manifest: dict, root: Path) -> list[str]:
    errors = []

    if manifest.get("schemaVersion") != SCHEMA_VERSION:
        errors.append(f"schemaVersion must be {SCHEMA_VERSION!r}")

    for field in (
        "cardId",
        "coinCardVersion",
        "recipient",
        "network",
        "registryStatus",
        "layoutVersion",
        "buildVersion",
        "manifestHash",
    ):
        if not manifest.get(field):
            errors.append(f"{field} is required")

    signature = manifest.get("signature")
    if not isinstance(signature, dict):
        errors.append("signature object is required")
    elif signature.get("mode") != "unsigned-dev":
        errors.append("only signature.mode 'unsigned-dev' is supported by this proof verifier")

    declared_hash = manifest.get("manifestHash")
    computed_hash = expected_manifest_hash(manifest)
    if declared_hash != computed_hash:
        errors.append(f"manifestHash mismatch: expected {declared_hash}, computed {computed_hash}")

    assets = manifest.get("assets")
    if not isinstance(assets, list) or not assets:
        errors.append("assets must be a non-empty list")
        return errors

    seen_paths = set()
    for index, asset in enumerate(assets):
        if not isinstance(asset, dict):
            errors.append(f"assets[{index}] must be an object")
            continue

        rel_path = asset.get("path")
        declared_asset_hash = asset.get("sha256")
        declared_size = asset.get("bytes")
        if not rel_path:
            errors.append(f"assets[{index}].path is required")
            continue
        if rel_path in seen_paths:
            errors.append(f"duplicate asset path: {rel_path}")
        seen_paths.add(rel_path)

        asset_path = (root / rel_path).resolve()
        try:
            asset_path.relative_to(root.resolve())
        except ValueError:
            errors.append(f"asset escapes root: {rel_path}")
            continue

        if not asset_path.exists() or not asset_path.is_file():
            errors.append(f"asset missing: {rel_path}")
            continue

        computed_asset_hash = sha256_file(asset_path)
        if declared_asset_hash != computed_asset_hash:
            errors.append(f"asset hash mismatch for {rel_path}: expected {declared_asset_hash}, computed {computed_asset_hash}")

        actual_size = asset_path.stat().st_size
        if declared_size != actual_size:
            errors.append(f"asset size mismatch for {rel_path}: expected {declared_size}, computed {actual_size}")

    return errors


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True, help="Root directory assets are resolved against.")
    parser.add_argument("manifest", type=Path, help="Manifest JSON path.")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    root = args.root.resolve()
    if not root.exists() or not root.is_dir():
        print(f"ERROR: root does not exist or is not a directory: {root}", file=sys.stderr)
        return 1

    try:
        manifest = load_manifest(args.manifest)
    except ValueError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    errors = verify_manifest(manifest, root)
    if errors:
        for error in errors:
            print(f"FAIL: {error}", file=sys.stderr)
        return 1

    print(f"OK: {args.manifest}")
    print(f"manifestHash {manifest['manifestHash']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
