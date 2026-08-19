#!/usr/bin/env bash
# IX ID Wildcard Public Ingress v0.1 — Production Verification Script
# ====================================================================
# READ-ONLY. Makes no mutations to GCP, DNS, or Cloud Run.
# Run after any change to ingress resources to confirm the slice is intact.
#
# Prerequisites: gcloud (authenticated), curl, dig, openssl
#
# Usage:
#   ./infra/ixid-public-ingress/verify-v0.1.sh
#   ./infra/ixid-public-ingress/verify-v0.1.sh --resolve   # forced-host mode (pre-DNS)
#
# Exit code 0 = all checks passed. Non-zero = at least one check failed.

set -euo pipefail

PROJECT=ixid-prod
LB_IP=8.232.10.66
PROBE_HOST=gate-test.ixid.me
EXPECTED_CNAME="991ac447-bc70-439f-aea2-9fc941db4356.11.authorize.certificatemanager.goog."
EXPECTED_CERT_CN="*.ixid.me"

RESOLVE_MODE=false
if [[ "${1:-}" == "--resolve" ]]; then
  RESOLVE_MODE=true
fi

PASS=0
FAIL=0

pass() { echo "  PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }

section() { echo ""; echo "=== $1 ==="; }

# ---------------------------------------------------------------------------
section "Certificate Manager"

cert_state=$(gcloud certificate-manager certificates describe ixid-wildcard-cert \
  --project="$PROJECT" --format="value(managed.state)" 2>/dev/null)
auth_state=$(gcloud certificate-manager certificates describe ixid-wildcard-cert \
  --project="$PROJECT" --format="value(managed.authorizationAttemptInfo[0].state)" 2>/dev/null)

[[ "$cert_state" == "ACTIVE" ]] && pass "ixid-wildcard-cert state=ACTIVE" \
  || fail "ixid-wildcard-cert state=$cert_state (expected ACTIVE)"
[[ "$auth_state" == "AUTHORIZED" ]] && pass "DNS authorization state=AUTHORIZED" \
  || fail "DNS authorization state=$auth_state (expected AUTHORIZED)"

# ---------------------------------------------------------------------------
section "DNS — cert authorization CNAME"

for ns in nsd1 nsd2 nsd3 nsd4; do
  result=$(dig @${ns}.squarespacedns.com _acme-challenge.ixid.me CNAME +short 2>/dev/null)
  if [[ "$result" == "$EXPECTED_CNAME" ]]; then
    pass "_acme-challenge CNAME on ${ns}.squarespacedns.com"
  else
    fail "_acme-challenge CNAME on ${ns}.squarespacedns.com: got '$result'"
  fi
done

# ---------------------------------------------------------------------------
section "DNS — wildcard A record"

if [[ "$RESOLVE_MODE" == "false" ]]; then
  for ns in nsd1 nsd2 nsd3 nsd4; do
    result=$(dig @${ns}.squarespacedns.com "$PROBE_HOST" A +short 2>/dev/null)
    if [[ "$result" == "$LB_IP" ]]; then
      pass "wildcard A on ${ns}.squarespacedns.com → $LB_IP"
    else
      fail "wildcard A on ${ns}.squarespacedns.com: got '$result' (expected $LB_IP)"
    fi
  done

  public_result=$(dig "$PROBE_HOST" A +short 2>/dev/null)
  [[ "$public_result" == "$LB_IP" ]] \
    && pass "public DNS $PROBE_HOST → $LB_IP" \
    || fail "public DNS $PROBE_HOST → '$public_result' (expected $LB_IP)"
else
  echo "  (skipped — --resolve mode, pre-wildcard-DNS)"
fi

# ---------------------------------------------------------------------------
section "TLS certificate"

CURL_RESOLVE=""
if [[ "$RESOLVE_MODE" == "true" ]]; then
  CURL_RESOLVE="--resolve ${PROBE_HOST}:443:${LB_IP}"
fi

cert_cn=$(echo | openssl s_client \
  -connect "${LB_IP}:443" \
  -servername "$PROBE_HOST" 2>/dev/null \
  | openssl x509 -noout -subject 2>/dev/null \
  | sed 's/.*CN = //')

[[ "$cert_cn" == "$EXPECTED_CERT_CN" ]] \
  && pass "TLS cert CN=$cert_cn" \
  || fail "TLS cert CN='$cert_cn' (expected $EXPECTED_CERT_CN)"

# ---------------------------------------------------------------------------
section "Web route — GET /"

web_response=$(curl $CURL_RESOLVE -si --max-time 15 "https://${PROBE_HOST}/" 2>/dev/null)
web_status=$(echo "$web_response" | head -1 | grep -o 'HTTP/[0-9]* [0-9]*' | awk '{print $2}')
web_cc=$(echo "$web_response" | grep -i '^cache-control:' | tr -d '\r')
web_has_page=$(echo "$web_response" | grep -c 'IxIdentity.bootstrap' || true)

[[ "$web_status" == "200" ]] && pass "GET / → HTTP $web_status" \
  || fail "GET / → HTTP $web_status (expected 200)"
[[ "$web_cc" == *"no-store"* ]] && pass "GET / Cache-Control: no-store" \
  || fail "GET / Cache-Control missing no-store: '$web_cc'"
[[ "$web_has_page" -gt 0 ]] && pass "GET / body contains IxIdentity.bootstrap" \
  || fail "GET / body does not contain IxIdentity.bootstrap"

# ---------------------------------------------------------------------------
section "API route — GET /api/public/identity/ix_nonexistent_probe"

api_url="https://${PROBE_HOST}/api/public/identity/ix_nonexistent_probe"
api_response=$(curl $CURL_RESOLVE -si --max-time 15 "$api_url" 2>/dev/null)
api_status=$(echo "$api_response" | head -1 | grep -o 'HTTP/[0-9]* [0-9]*' | awk '{print $2}')
api_cc=$(echo "$api_response" | grep -i '^cache-control:' | tr -d '\r')
api_body=$(echo "$api_response" | tail -1)

[[ "$api_status" == "404" ]] && pass "GET /api/... → HTTP $api_status" \
  || fail "GET /api/... → HTTP $api_status (expected 404)"
[[ "$api_cc" == *"no-store"* ]] && pass "GET /api/... Cache-Control: no-store" \
  || fail "GET /api/... Cache-Control missing no-store: '$api_cc'"
[[ "$api_body" == *"ix_nonexistent_probe"* ]] \
  && pass "GET /api/... edge canonical 404 body: $api_body" \
  || fail "GET /api/... unexpected body: $api_body"

# ---------------------------------------------------------------------------
section "Direct .run.app bypass — must be blocked"

web_direct_url=$(gcloud run services describe ixid-public-web \
  --region=us-central1 --project="$PROJECT" --format="value(status.url)" 2>/dev/null)
edge_direct_url=$(gcloud run services describe ixid-public-edge \
  --region=us-central1 --project="$PROJECT" --format="value(status.url)" 2>/dev/null)

web_direct_status=$(curl -si --max-time 10 "${web_direct_url}/" 2>/dev/null \
  | head -1 | grep -o 'HTTP/[0-9]* [0-9]*' | awk '{print $2}')
edge_direct_status=$(curl -si --max-time 10 "${edge_direct_url}/public/identity/probe" 2>/dev/null \
  | head -1 | grep -o 'HTTP/[0-9]* [0-9]*' | awk '{print $2}')

[[ "$web_direct_status" != "200" ]] \
  && pass "ixid-public-web direct run.app blocked (HTTP $web_direct_status)" \
  || fail "ixid-public-web direct run.app NOT blocked (HTTP $web_direct_status)"

[[ "$edge_direct_status" != "200" ]] \
  && pass "ixid-public-edge direct run.app blocked (HTTP $edge_direct_status)" \
  || fail "ixid-public-edge direct run.app NOT blocked (HTTP $edge_direct_status)"

# ---------------------------------------------------------------------------
section "Cloud Run ingress settings"

web_ingress=$(gcloud run services describe ixid-public-web \
  --region=us-central1 --project="$PROJECT" \
  --format="value(metadata.annotations['run.googleapis.com/ingress'])" 2>/dev/null)
edge_ingress=$(gcloud run services describe ixid-public-edge \
  --region=us-central1 --project="$PROJECT" \
  --format="value(metadata.annotations['run.googleapis.com/ingress'])" 2>/dev/null)

[[ "$web_ingress" == "internal-and-cloud-load-balancing" ]] \
  && pass "ixid-public-web ingress=internal-and-cloud-load-balancing" \
  || fail "ixid-public-web ingress='$web_ingress'"
[[ "$edge_ingress" == "internal-and-cloud-load-balancing" ]] \
  && pass "ixid-public-edge ingress=internal-and-cloud-load-balancing" \
  || fail "ixid-public-edge ingress='$edge_ingress'"

# ---------------------------------------------------------------------------
echo ""
echo "================================"
echo "Results: $PASS passed, $FAIL failed"
echo "================================"

[[ $FAIL -eq 0 ]] && exit 0 || exit 1
