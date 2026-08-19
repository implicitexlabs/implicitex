"""
IX Scheduler HTTP Handler
=========================
Cloud Run entry point for the three IX Scheduler batch operations.

Authentication boundary
-----------------------
Cloud Run IAM validates the OIDC token before this handler is reached.
The dedicated scheduler service account holds only roles/run.invoker on
this service. No second credential check is performed here.

Occurrence identity
-------------------
X-CloudScheduler-JobName and X-CloudScheduler-ScheduleTime are the
authoritative source for idempotency. ScheduleTime is set by Cloud
Scheduler at job dispatch and remains constant across retries; the
application never trusts caller-supplied timing data for occurrence
identity. Derivation:

    job_name + schedule_time_iso → scheduler_occurrence_id

The stable scheduler_occurrence_id is passed as the `_now` argument
to the frozen Scheduler batch functions, ensuring per-claim run_ids are
also stable across retries.

Retry semantics
---------------
Invalid requests (missing headers, malformed time) → 400: not retried.
Valid requests whose batch function raises                → 500: retried
  by Cloud Scheduler's configured retry policy.
Valid requests whose batch function returns BatchResult  → 200: not
  retried even if BatchResult.failed > 0; per-claim failures are
  recorded in the result and surfaced via alerting, not HTTP retries.

Frozen invariants:
  - No claim-state, DNS, transition, expiry, repair, or trust policy logic.
  - X-CloudScheduler-ScheduleTime is the sole occurrence-time authority.
  - Non-2xx status on all retryable failures.
  - Occurrence ID is deterministic: same job + same schedule time = same ID.
"""

import json
import logging
import os
from datetime import datetime, timezone

from flask import Flask, Response, request
from google.cloud import firestore

from ixid_scheduler_service import (
    BatchResult,
    run_expiration_batch,
    run_recheck_batch,
    run_repair_sweep,
)

logger = logging.getLogger(__name__)

app = Flask(__name__)

# ---------------------------------------------------------------------------
# Header constants
# ---------------------------------------------------------------------------

_HEADER_JOB_NAME = "X-CloudScheduler-JobName"
_HEADER_SCHEDULE_TIME = "X-CloudScheduler-ScheduleTime"

# ---------------------------------------------------------------------------
# Firestore client — one instance per container process
# ---------------------------------------------------------------------------

_db: firestore.Client | None = None


def _get_db() -> firestore.Client:
    global _db
    if _db is None:
        _db = firestore.Client()
    return _db


# ---------------------------------------------------------------------------
# Occurrence identity
# ---------------------------------------------------------------------------


def _derive_occurrence_id(job_name: str, schedule_time_iso: str) -> str:
    """
    Deterministic occurrence ID derived from authenticated Scheduler metadata.

    job_name is the full resource name:
        projects/{project}/locations/{location}/jobs/{job}

    schedule_time_iso is the RFC3339 ScheduleTime normalised to ISO format
    (fractional seconds stripped; always UTC Z suffix).

    The occurrence ID is stable: the same job fired at the same scheduled
    time always produces the same ID, regardless of which retry it is.
    """
    return f"{job_name}::{schedule_time_iso}"


def _parse_schedule_time(raw: str) -> datetime:
    """
    Parse an RFC3339 schedule-time string into a timezone-aware UTC datetime.

    Cloud Scheduler emits times in the form:
        2026-08-17T10:00:00Z
        2026-08-17T10:00:00+00:00
        2026-08-17T10:00:00.000000Z   (with fractional seconds)

    Returns a UTC-aware datetime.
    Raises ValueError if the string cannot be parsed.
    """
    # Normalise trailing Z to +00:00 for fromisoformat compatibility on 3.10.
    normalised = raw.strip()
    if normalised.endswith("Z"):
        normalised = normalised[:-1] + "+00:00"
    dt = datetime.fromisoformat(normalised)
    if dt.tzinfo is None:
        raise ValueError(f"Schedule time has no timezone info: {raw!r}")
    return dt.astimezone(timezone.utc)


def _schedule_time_to_iso(dt: datetime) -> str:
    """
    Normalise a UTC datetime to a compact ISO string without fractional seconds.
    Used as the stable component of the occurrence ID.
    """
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------------------
# Request validation
# ---------------------------------------------------------------------------


def _extract_scheduler_metadata() -> tuple[str, datetime] | Response:
    """
    Extract and validate Cloud Scheduler headers.

    Returns (job_name, schedule_dt) on success.
    Returns a 400 Response on any validation failure.
    Only called from POST routes; method enforcement is handled by Flask.
    """
    job_name = request.headers.get(_HEADER_JOB_NAME)
    if not job_name:
        return _bad_request(f"Missing required header: {_HEADER_JOB_NAME}")

    schedule_time_raw = request.headers.get(_HEADER_SCHEDULE_TIME)
    if not schedule_time_raw:
        return _bad_request(f"Missing required header: {_HEADER_SCHEDULE_TIME}")

    try:
        schedule_dt = _parse_schedule_time(schedule_time_raw)
    except ValueError as exc:
        return _bad_request(f"Malformed {_HEADER_SCHEDULE_TIME}: {exc}")

    return job_name, schedule_dt


# ---------------------------------------------------------------------------
# Response helpers
# ---------------------------------------------------------------------------


@app.errorhandler(405)
def _method_not_allowed(exc) -> Response:
    logger.warning("Method not allowed: %s %s", request.method, request.path)
    return Response(
        json.dumps({"error": f"Method not allowed: {request.method}"}),
        status=405,
        content_type="application/json",
    )


def _bad_request(message: str) -> Response:
    logger.warning("Bad request: %s", message)
    return Response(
        json.dumps({"error": message}),
        status=400,
        content_type="application/json",
    )


def _server_error(message: str) -> Response:
    logger.error("Batch failed (retryable): %s", message)
    return Response(
        json.dumps({"error": message}),
        status=500,
        content_type="application/json",
    )


def _batch_result_response(
    result: BatchResult,
    occurrence_id: str,
) -> Response:
    body = {
        "occurrence_id": occurrence_id,
        "processed": result.processed,
        "succeeded": result.succeeded,
        "failed": result.failed,
        "skipped": result.skipped,
        "errors": result.errors,
    }
    return Response(
        json.dumps(body),
        status=200,
        content_type="application/json",
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.route("/scheduler/recheck", methods=["POST"])
def handle_recheck() -> Response:
    metadata = _extract_scheduler_metadata()
    if isinstance(metadata, Response):
        return metadata
    job_name, schedule_dt = metadata

    occurrence_id = _derive_occurrence_id(job_name, _schedule_time_to_iso(schedule_dt))
    logger.info("recheck batch: occurrence=%s", occurrence_id)

    try:
        result = run_recheck_batch(_get_db(), _now=lambda: schedule_dt)
    except Exception as exc:  # noqa: BLE001
        return _server_error(f"recheck batch raised: {exc}")

    return _batch_result_response(result, occurrence_id)


@app.route("/scheduler/expire", methods=["POST"])
def handle_expire() -> Response:
    metadata = _extract_scheduler_metadata()
    if isinstance(metadata, Response):
        return metadata
    job_name, schedule_dt = metadata

    occurrence_id = _derive_occurrence_id(job_name, _schedule_time_to_iso(schedule_dt))
    logger.info("expire batch: occurrence=%s", occurrence_id)

    try:
        result = run_expiration_batch(_get_db(), _now=lambda: schedule_dt)
    except Exception as exc:  # noqa: BLE001
        return _server_error(f"expire batch raised: {exc}")

    return _batch_result_response(result, occurrence_id)


@app.route("/scheduler/repair", methods=["POST"])
def handle_repair() -> Response:
    metadata = _extract_scheduler_metadata()
    if isinstance(metadata, Response):
        return metadata
    job_name, schedule_dt = metadata

    occurrence_id = _derive_occurrence_id(job_name, _schedule_time_to_iso(schedule_dt))
    logger.info("repair sweep: occurrence=%s", occurrence_id)

    try:
        result = run_repair_sweep(_get_db(), _now=lambda: schedule_dt)
    except Exception as exc:  # noqa: BLE001
        return _server_error(f"repair sweep raised: {exc}")

    return _batch_result_response(result, occurrence_id)


# ---------------------------------------------------------------------------
# Entry point (gunicorn targets `app`; this block is for local debugging only)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    app.run(host="0.0.0.0", port=port, debug=False)
