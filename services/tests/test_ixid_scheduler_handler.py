"""
IX Scheduler HTTP Handler — unit tests.

No Firestore emulator required. All Scheduler batch functions are monkeypatched;
this test file proves HTTP-layer behavior only: routing, header validation,
occurrence-ID derivation, response serialization, and failure mapping.
"""

import json
from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest

import ixid_scheduler_handler as handler
from ixid_scheduler_handler import (
    _derive_occurrence_id,
    _parse_schedule_time,
    _schedule_time_to_iso,
    app,
)
from ixid_scheduler_service import BatchResult, ClaimJobResult


@pytest.fixture()
def client():
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


# ---------------------------------------------------------------------------
# Valid Scheduler headers used across multiple tests
# ---------------------------------------------------------------------------

_JOB_NAME = "projects/ix-id-prod/locations/us-central1/jobs/ixid-recheck"
_SCHEDULE_TIME = "2026-08-17T10:00:00Z"
_SCHEDULER_HEADERS = {
    "X-CloudScheduler-JobName": _JOB_NAME,
    "X-CloudScheduler-ScheduleTime": _SCHEDULE_TIME,
}


def _ok_result() -> BatchResult:
    return BatchResult(processed=3, succeeded=3, failed=0, skipped=0)


# ---------------------------------------------------------------------------
# Occurrence ID derivation
# ---------------------------------------------------------------------------


class TestOccurrenceIdDerivation:
    def test_same_job_same_time_produces_same_id(self):
        id1 = _derive_occurrence_id("projects/p/jobs/j", "2026-08-17T10:00:00Z")
        id2 = _derive_occurrence_id("projects/p/jobs/j", "2026-08-17T10:00:00Z")
        assert id1 == id2

    def test_different_time_produces_different_id(self):
        id1 = _derive_occurrence_id("projects/p/jobs/j", "2026-08-17T10:00:00Z")
        id2 = _derive_occurrence_id("projects/p/jobs/j", "2026-09-17T10:00:00Z")
        assert id1 != id2

    def test_different_job_produces_different_id(self):
        id1 = _derive_occurrence_id("projects/p/jobs/recheck", "2026-08-17T10:00:00Z")
        id2 = _derive_occurrence_id("projects/p/jobs/expire", "2026-08-17T10:00:00Z")
        assert id1 != id2

    def test_occurrence_id_contains_job_name(self):
        oid = _derive_occurrence_id(
            "projects/p/jobs/ixid-recheck", "2026-08-17T10:00:00Z"
        )
        assert "projects/p/jobs/ixid-recheck" in oid

    def test_occurrence_id_contains_schedule_time(self):
        oid = _derive_occurrence_id("projects/p/jobs/j", "2026-08-17T10:00:00Z")
        assert "2026-08-17T10:00:00Z" in oid


# ---------------------------------------------------------------------------
# Schedule time parsing
# ---------------------------------------------------------------------------


class TestParseScheduleTime:
    def test_z_suffix_parsed_as_utc(self):
        dt = _parse_schedule_time("2026-08-17T10:00:00Z")
        assert dt.tzinfo is not None
        assert dt.utcoffset().total_seconds() == 0

    def test_plus_zero_offset_parsed(self):
        dt = _parse_schedule_time("2026-08-17T10:00:00+00:00")
        assert dt.utcoffset().total_seconds() == 0

    def test_fractional_seconds_accepted(self):
        dt = _parse_schedule_time("2026-08-17T10:00:00.123456Z")
        assert dt.second == 0
        assert dt.microsecond == 123456

    def test_malformed_raises_value_error(self):
        with pytest.raises(ValueError):
            _parse_schedule_time("not-a-date")

    def test_no_timezone_raises_value_error(self):
        with pytest.raises(ValueError):
            _parse_schedule_time("2026-08-17T10:00:00")

    def test_schedule_time_to_iso_strips_fractional_seconds(self):
        dt = datetime(2026, 8, 17, 10, 0, 0, 123456, tzinfo=timezone.utc)
        assert _schedule_time_to_iso(dt) == "2026-08-17T10:00:00Z"


# ---------------------------------------------------------------------------
# Method enforcement
# ---------------------------------------------------------------------------


class TestMethodEnforcement:
    @pytest.mark.parametrize("method", ["GET", "PUT", "PATCH", "DELETE"])
    def test_non_post_rejected_on_recheck(self, client, method):
        resp = client.open(
            "/scheduler/recheck",
            method=method,
            headers=_SCHEDULER_HEADERS,
        )
        assert resp.status_code == 405

    @pytest.mark.parametrize("method", ["GET", "PUT", "PATCH", "DELETE"])
    def test_non_post_rejected_on_expire(self, client, method):
        resp = client.open(
            "/scheduler/expire",
            method=method,
            headers=_SCHEDULER_HEADERS,
        )
        assert resp.status_code == 405

    @pytest.mark.parametrize("method", ["GET", "PUT", "PATCH", "DELETE"])
    def test_non_post_rejected_on_repair(self, client, method):
        resp = client.open(
            "/scheduler/repair",
            method=method,
            headers=_SCHEDULER_HEADERS,
        )
        assert resp.status_code == 405

    def test_405_body_is_json_with_error_key(self, client):
        resp = client.get("/scheduler/recheck", headers=_SCHEDULER_HEADERS)
        assert resp.status_code == 405
        body = json.loads(resp.data)
        assert "error" in body

    def test_non_post_does_not_call_batch(self, client, monkeypatch):
        mock = MagicMock()
        monkeypatch.setattr(handler, "run_recheck_batch", mock)
        monkeypatch.setattr(handler, "_get_db", lambda: MagicMock())
        client.open("/scheduler/recheck", method="GET", headers=_SCHEDULER_HEADERS)
        mock.assert_not_called()


# ---------------------------------------------------------------------------
# Header validation
# ---------------------------------------------------------------------------


class TestHeaderValidation:
    def test_missing_job_name_returns_400(self, client):
        resp = client.post(
            "/scheduler/recheck",
            headers={"X-CloudScheduler-ScheduleTime": _SCHEDULE_TIME},
        )
        assert resp.status_code == 400

    def test_missing_schedule_time_returns_400(self, client):
        resp = client.post(
            "/scheduler/recheck",
            headers={"X-CloudScheduler-JobName": _JOB_NAME},
        )
        assert resp.status_code == 400

    def test_malformed_schedule_time_returns_400(self, client):
        resp = client.post(
            "/scheduler/recheck",
            headers={
                "X-CloudScheduler-JobName": _JOB_NAME,
                "X-CloudScheduler-ScheduleTime": "not-a-date",
            },
        )
        assert resp.status_code == 400

    def test_missing_headers_do_not_call_batch(self, client, monkeypatch):
        mock = MagicMock()
        monkeypatch.setattr(handler, "run_recheck_batch", mock)
        client.post("/scheduler/recheck", headers={})
        mock.assert_not_called()

    def test_400_body_is_json_with_error_key(self, client):
        resp = client.post("/scheduler/recheck", headers={})
        body = json.loads(resp.data)
        assert "error" in body


# ---------------------------------------------------------------------------
# Endpoint routing: correct batch function is invoked per route
# ---------------------------------------------------------------------------


class TestRouting:
    def test_recheck_route_calls_run_recheck_batch(self, client, monkeypatch):
        mock = MagicMock(return_value=_ok_result())
        monkeypatch.setattr(handler, "run_recheck_batch", mock)
        monkeypatch.setattr(handler, "_get_db", lambda: MagicMock())
        resp = client.post("/scheduler/recheck", headers=_SCHEDULER_HEADERS)
        assert resp.status_code == 200
        mock.assert_called_once()

    def test_expire_route_calls_run_expiration_batch(self, client, monkeypatch):
        mock = MagicMock(return_value=_ok_result())
        monkeypatch.setattr(handler, "run_expiration_batch", mock)
        monkeypatch.setattr(handler, "_get_db", lambda: MagicMock())
        resp = client.post("/scheduler/expire", headers=_SCHEDULER_HEADERS)
        assert resp.status_code == 200
        mock.assert_called_once()

    def test_repair_route_calls_run_repair_sweep(self, client, monkeypatch):
        mock = MagicMock(return_value=_ok_result())
        monkeypatch.setattr(handler, "run_repair_sweep", mock)
        monkeypatch.setattr(handler, "_get_db", lambda: MagicMock())
        resp = client.post("/scheduler/repair", headers=_SCHEDULER_HEADERS)
        assert resp.status_code == 200
        mock.assert_called_once()

    def test_recheck_does_not_call_expire_or_repair(self, client, monkeypatch):
        monkeypatch.setattr(
            handler, "run_recheck_batch", MagicMock(return_value=_ok_result())
        )
        expire_mock = MagicMock()
        repair_mock = MagicMock()
        monkeypatch.setattr(handler, "run_expiration_batch", expire_mock)
        monkeypatch.setattr(handler, "run_repair_sweep", repair_mock)
        monkeypatch.setattr(handler, "_get_db", lambda: MagicMock())
        client.post("/scheduler/recheck", headers=_SCHEDULER_HEADERS)
        expire_mock.assert_not_called()
        repair_mock.assert_not_called()


# ---------------------------------------------------------------------------
# Occurrence identity flows through to batch _now
# ---------------------------------------------------------------------------


class TestOccurrenceIdentityFlowThrough:
    def test_schedule_time_passed_as_now_to_recheck(self, client, monkeypatch):
        captured: list[datetime] = []

        def fake_recheck(db, _now=None):
            if _now is not None:
                captured.append(_now())
            return _ok_result()

        monkeypatch.setattr(handler, "run_recheck_batch", fake_recheck)
        monkeypatch.setattr(handler, "_get_db", lambda: MagicMock())
        client.post("/scheduler/recheck", headers=_SCHEDULER_HEADERS)

        assert len(captured) == 1
        assert captured[0] == datetime(2026, 8, 17, 10, 0, 0, tzinfo=timezone.utc)

    def test_same_schedule_time_retry_passes_same_now(self, client, monkeypatch):
        captured: list[datetime] = []

        def fake_recheck(db, _now=None):
            if _now is not None:
                captured.append(_now())
            return _ok_result()

        monkeypatch.setattr(handler, "run_recheck_batch", fake_recheck)
        monkeypatch.setattr(handler, "_get_db", lambda: MagicMock())
        # Two "retries" with the same headers
        client.post("/scheduler/recheck", headers=_SCHEDULER_HEADERS)
        client.post("/scheduler/recheck", headers=_SCHEDULER_HEADERS)

        assert len(captured) == 2
        assert captured[0] == captured[1]


# ---------------------------------------------------------------------------
# BatchResult serialization
# ---------------------------------------------------------------------------


class TestBatchResultSerialization:
    def test_200_body_contains_expected_keys(self, client, monkeypatch):
        monkeypatch.setattr(
            handler,
            "run_recheck_batch",
            MagicMock(
                return_value=BatchResult(processed=5, succeeded=4, failed=1, skipped=0)
            ),
        )
        monkeypatch.setattr(handler, "_get_db", lambda: MagicMock())
        resp = client.post("/scheduler/recheck", headers=_SCHEDULER_HEADERS)
        body = json.loads(resp.data)
        assert body["processed"] == 5
        assert body["succeeded"] == 4
        assert body["failed"] == 1
        assert body["skipped"] == 0
        assert "errors" in body
        assert "occurrence_id" in body

    def test_errors_list_populated(self, client, monkeypatch):
        result = BatchResult(processed=1, succeeded=0, failed=1, skipped=0)
        result.jobs.append(
            ClaimJobResult(
                claim_id="c1",
                ix_id="ix1",
                run_id="r1",
                outcome="ERROR",
                error="DNS timeout",
            )
        )
        monkeypatch.setattr(
            handler, "run_recheck_batch", MagicMock(return_value=result)
        )
        monkeypatch.setattr(handler, "_get_db", lambda: MagicMock())
        resp = client.post("/scheduler/recheck", headers=_SCHEDULER_HEADERS)
        body = json.loads(resp.data)
        assert body["errors"] == ["DNS timeout"]

    def test_occurrence_id_in_response_matches_derivation(self, client, monkeypatch):
        monkeypatch.setattr(
            handler, "run_recheck_batch", MagicMock(return_value=_ok_result())
        )
        monkeypatch.setattr(handler, "_get_db", lambda: MagicMock())
        resp = client.post("/scheduler/recheck", headers=_SCHEDULER_HEADERS)
        body = json.loads(resp.data)
        expected = _derive_occurrence_id(_JOB_NAME, "2026-08-17T10:00:00Z")
        assert body["occurrence_id"] == expected

    def test_partial_failure_still_returns_200(self, client, monkeypatch):
        # Per-claim failures are in BatchResult; the batch itself succeeded.
        # Cloud Scheduler should not retry for per-claim errors.
        result = BatchResult(processed=3, succeeded=2, failed=1, skipped=0)
        monkeypatch.setattr(
            handler, "run_recheck_batch", MagicMock(return_value=result)
        )
        monkeypatch.setattr(handler, "_get_db", lambda: MagicMock())
        resp = client.post("/scheduler/recheck", headers=_SCHEDULER_HEADERS)
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Retryable failure → non-2xx
# ---------------------------------------------------------------------------


class TestRetryableFailure:
    def test_batch_exception_returns_500(self, client, monkeypatch):
        monkeypatch.setattr(
            handler,
            "run_recheck_batch",
            MagicMock(side_effect=RuntimeError("Firestore unavailable")),
        )
        monkeypatch.setattr(handler, "_get_db", lambda: MagicMock())
        resp = client.post("/scheduler/recheck", headers=_SCHEDULER_HEADERS)
        assert resp.status_code == 500

    def test_500_body_contains_error_key(self, client, monkeypatch):
        monkeypatch.setattr(
            handler,
            "run_expiration_batch",
            MagicMock(side_effect=RuntimeError("timeout")),
        )
        monkeypatch.setattr(handler, "_get_db", lambda: MagicMock())
        resp = client.post("/scheduler/expire", headers=_SCHEDULER_HEADERS)
        body = json.loads(resp.data)
        assert "error" in body

    def test_repair_batch_exception_returns_500(self, client, monkeypatch):
        monkeypatch.setattr(
            handler,
            "run_repair_sweep",
            MagicMock(side_effect=ConnectionError("network error")),
        )
        monkeypatch.setattr(handler, "_get_db", lambda: MagicMock())
        resp = client.post("/scheduler/repair", headers=_SCHEDULER_HEADERS)
        assert resp.status_code == 500


# ---------------------------------------------------------------------------
# No Firestore / domain / transition logic in handler
# ---------------------------------------------------------------------------


class TestHandlerContainmentInvariants:
    def test_handler_module_does_not_import_firestore_query_primitives(self):
        import ixid_scheduler_handler as h

        # The handler imports firestore for the client type only.
        # It must not import FieldFilter, collection_group, or domain/transition symbols.
        assert not hasattr(h, "FieldFilter")
        assert not hasattr(h, "run_domain_recheck")
        assert not hasattr(h, "execute_transition")
        assert not hasattr(h, "ClaimStatus")
        assert not hasattr(h, "TriggerType")
