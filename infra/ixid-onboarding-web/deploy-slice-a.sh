#!/usr/bin/env bash
# IX ID Onboarding Web — Slice A deployment
# ==========================================
# Creates the ixid-onboarding-web Cloud Run service.
# Run from the implicitex/ root.
#
# Security boundary (Slice A):
#   --allow-unauthenticated intentionally permits invocation without an IAM token.
#   This is the correct posture for a service behind a public-facing Load Balancer:
#   the LB does not present a Google-signed caller identity, so Cloud Run IAM auth
#   would block all LB traffic. The dark boundary is enforced by two independent
#   mechanisms, not by requiring a caller identity:
#     (1) --ingress=internal-and-cloud-load-balancing blocks direct .run.app access.
#     (2) No app.ixid.me host rule exists in ixid-url-map yet (Slice B).
#   Until Slice B is deployed, no internet path reaches this service.
#   This is the same pattern as ixid-public-web (allUsers → run.invoker + internal ingress).
#
# What this script does NOT do:
#   - Does not modify ixid-url-map (Slice B)
#   - Does not configure Firebase authorized domains (Slice C)
#   - Does not enable Firebase email/password (§1.8 step 7)
#
set -euo pipefail

PROJECT=ixid-prod
REGION=us-central1
SERVICE=ixid-onboarding-web
RUNTIME_SA="${SERVICE}-runtime@${PROJECT}.iam.gserviceaccount.com"
BUILD_CONTEXT="$(pwd)/ixid-onboarding-web"

# Image tagging lifecycle:
#   Local runtime proof  → tag: ixid-onboarding-web:slice-a-review  (not pushed to Artifact Registry)
#   Production deploy    → tag: <git-sha-of-commit-that-contains-slice-a>
#
# This script is the production deployment path. It verifies that the Slice A
# source tree is committed and matches HEAD before deriving the image tag from
# git rev-parse. If Slice A files are untracked or dirty, the script fails before
# any GCP state is mutated.
#
# The cleanliness check is scoped to the two Slice A directories only. Unrelated
# working-tree changes in other paths do not block this deployment.

echo "=== Slice A: ixid-onboarding-web ==="

# ── Pre-flight: container runtime ─────────────────────────────────────────────
# This check runs FIRST — before any GCP or local state is mutated.
# Without a container runtime nothing downstream can succeed; fail now.
echo "[0/4] Pre-flight checks..."

DOCKER_BIN=""
if command -v docker >/dev/null 2>&1; then
  DOCKER_BIN="docker"
elif command -v podman >/dev/null 2>&1; then
  # podman is CLI-compatible with docker for build/push but is NOT automatically
  # configured for Artifact Registry credential helpers. Do not silently substitute.
  echo "  ERROR: 'docker' not found. 'podman' is present but requires separate"
  echo "  Artifact Registry credential configuration before use with this script."
  echo "  Either install Docker or configure podman auth manually, then re-run."
  exit 1
elif command -v nerdctl >/dev/null 2>&1; then
  echo "  ERROR: 'docker' not found. 'nerdctl' is present but requires separate"
  echo "  Artifact Registry credential configuration. Install Docker or configure"
  echo "  nerdctl auth manually, then re-run."
  exit 1
else
  echo "  ERROR: no container runtime found (docker, podman, nerdctl all absent)."
  echo "  Install Docker before running this script:"
  echo "    https://docs.docker.com/engine/install/"
  exit 1
fi
echo "  OK: container runtime '${DOCKER_BIN}' found."

# Verify build context exists
if [[ ! -f "${BUILD_CONTEXT}/Dockerfile" ]]; then
  echo "  ERROR: Dockerfile not found at ${BUILD_CONTEXT}/Dockerfile"
  echo "  Run from the implicitex/ root."
  exit 1
fi
echo "  OK: build context exists."

# Verify Slice A source is committed and matches HEAD.
# Scoped to the two Slice A directories; unrelated working-tree changes are ignored.
# This ensures the Artifact Registry image tag (derived from git rev-parse HEAD)
# actually identifies the code being built.
echo "  Checking Slice A git status..."
SLICE_A_STATUS=$(git status --porcelain -- ixid-onboarding-web/ infra/ixid-onboarding-web/ 2>/dev/null)
if [[ -n "${SLICE_A_STATUS}" ]]; then
  echo "  ERROR: Slice A has uncommitted or untracked files:"
  echo "${SLICE_A_STATUS}"
  echo ""
  echo "  This is a production deployment script. The image tag is derived from"
  echo "  git rev-parse HEAD and must identify the committed code."
  echo "  Commit Slice A first, then run this script."
  echo ""
  echo "  For local runtime proof before committing, build and tag manually:"
  echo "    docker build -t ixid-onboarding-web:slice-a-review ixid-onboarding-web/"
  exit 1
fi
GIT_SHA=$(git rev-parse HEAD)
# Per-service Artifact Registry convention: one repo per service, named after the service.
# Matches ixid-public-web, ixid-public-edge, ixid-projection, ixid-scheduler.
IMAGE="us-central1-docker.pkg.dev/${PROJECT}/${SERVICE}/${SERVICE}:${GIT_SHA}"
echo "  OK: Slice A is committed. Image tag: ${GIT_SHA}"

# Verify Artifact Registry repository exists.
# Repository name matches the service name — one repo per service.
echo "  Checking Artifact Registry repository..."
gcloud artifacts repositories describe "${SERVICE}" \
  --location="${REGION}" \
  --project="${PROJECT}" \
  --format="value(name)" > /dev/null 2>&1 || {
    echo "  ERROR: Artifact Registry repository '${SERVICE}' not found in ${REGION}/${PROJECT}."
    echo "  Create it first:"
    echo "    gcloud artifacts repositories create ${SERVICE} \\"
    echo "      --repository-format=docker \\"
    echo "      --location=${REGION} \\"
    echo "      --project=${PROJECT} \\"
    echo "      --description='IX Id onboarding web container images'"
    exit 1
  }
echo "  OK: Artifact Registry repository '${SERVICE}' exists."

# Configure Docker credential helper for Artifact Registry.
# This is required to push. Fail closed if configuration fails.
echo "  Configuring Docker credential helper for Artifact Registry..."
if ! gcloud auth configure-docker "us-central1-docker.pkg.dev" --quiet 2>/dev/null; then
  echo "  ERROR: 'gcloud auth configure-docker' failed."
  echo "  Ensure gcloud is authenticated (gcloud auth login or ADC) and retry."
  exit 1
fi
echo "  OK: Docker credential helper configured."

# ── Step 1: Create runtime service account (idempotent) ──────────────────────
echo "[1/4] Creating runtime service account..."
gcloud iam service-accounts create "${SERVICE}-runtime" \
  --display-name="IX ID Onboarding Web Runtime" \
  --project="${PROJECT}" 2>/dev/null || echo "  SA already exists — skipping create."

# Verify: zero project-level IAM bindings on the SA.
# A newly-created SA has no bindings. Any binding — including basic/primitive roles
# (roles/owner, roles/editor) — would grant authority we have not authorized.
# Note: this checks direct project-level bindings only. Folder/org-level inherited
# policies and conditional bindings require GCP Console verification.
echo "  Verifying zero project-level IAM bindings on runtime SA..."
BINDINGS=$(gcloud projects get-iam-policy "${PROJECT}" \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:${RUNTIME_SA}" \
  --format="value(bindings.role)" 2>/dev/null)

if [[ -n "${BINDINGS}" ]]; then
  echo "  ERROR: runtime SA has unexpected project-level role bindings:"
  echo "  ${BINDINGS}"
  echo "  This SA must have zero project-level bindings. Investigate before deploying."
  exit 1
fi
echo "  OK: runtime SA has zero direct project-level role bindings."

# ── Step 2: Build and push the container image ───────────────────────────────
echo "[2/4] Building container image..."
"${DOCKER_BIN}" build \
  --platform linux/amd64 \
  -t "${IMAGE}" \
  "${BUILD_CONTEXT}"

echo "  Pushing image (${IMAGE})..."
"${DOCKER_BIN}" push "${IMAGE}"

# ── Step 3: Deploy Cloud Run service ─────────────────────────────────────────
echo "[3/4] Deploying Cloud Run service..."
gcloud run deploy "${SERVICE}" \
  --image="${IMAGE}" \
  --region="${REGION}" \
  --project="${PROJECT}" \
  --service-account="${RUNTIME_SA}" \
  --ingress=internal-and-cloud-load-balancing \
  --allow-unauthenticated \
  --port=8080 \
  --min-instances=0 \
  --max-instances=5

# ── Step 4: Verify deployment ─────────────────────────────────────────────────
echo "[4/4] Verifying deployment..."
SERVICE_URL=$(gcloud run services describe "${SERVICE}" \
  --region="${REGION}" \
  --project="${PROJECT}" \
  --format="value(status.url)")

INGRESS=$(gcloud run services describe "${SERVICE}" \
  --region="${REGION}" \
  --project="${PROJECT}" \
  --format="value(metadata.annotations.'run.googleapis.com/ingress')")

if [[ "${INGRESS}" != "internal-and-cloud-load-balancing" ]]; then
  echo "  ERROR: unexpected ingress setting: ${INGRESS}"
  exit 1
fi
echo "  OK: ingress=internal-and-cloud-load-balancing confirmed."

REVISION=$(gcloud run services describe "${SERVICE}" \
  --region="${REGION}" \
  --project="${PROJECT}" \
  --format="value(status.latestReadyRevisionName)")

echo ""
echo "=== Slice A deploy complete ==="
echo ""
echo "Service is deployed DARK (not reachable via app.ixid.me)."
echo "The dark boundary is enforced by ingress restriction and the absence"
echo "of an app.ixid.me host rule in ixid-url-map. No URL map changes were made."
echo "Proceed to Slice B to add the app.ixid.me host rule."
echo ""
echo "Evidence to record:"
printf "  Project:        %s\n" "${PROJECT}"
printf "  Service URL:    %s\n" "${SERVICE_URL}"
printf "  Ingress:        %s\n" "${INGRESS}"
printf "  Revision:       %s\n" "${REVISION}"
printf "  Image:          %s\n" "${IMAGE}"
printf "  Git SHA:        %s\n" "${GIT_SHA}"
