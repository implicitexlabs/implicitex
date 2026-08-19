# IX Scheduler Cloud Run service
# ================================
# Production image. Do not run Flask's development server here.
# Cloud Run supplies $PORT; Gunicorn binds to it.
#
# Authentication: Cloud Run IAM (OIDC). No credentials are baked into
# this image. The Cloud Run service identity is used at runtime.
#
# Build: docker build -t ixid-scheduler .
# Run locally: docker run --rm -e PORT=8080 -p 8080:8080 ixid-scheduler

FROM python:3.13-slim

# Non-root application user
RUN adduser --disabled-password --gecos "" appuser

WORKDIR /app

# Install Python dependencies from pinned manifest before copying source
# so layer is cached on dependency changes only.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy only the service modules needed at runtime.
# Test files, emulator state, and development artifacts are excluded
# by .dockerignore.
COPY ixid_scheduler_handler.py .
COPY ixid_scheduler_service.py .
COPY ixid_domain_verification_service.py .
COPY ixid_transition_service.py .

USER appuser

# Cloud Run injects PORT; default to 8080 for local testing.
ENV PORT=8080
EXPOSE 8080

# One worker per container is the Cloud Run default recommendation for
# services that hold per-process Firestore clients. Scale via container
# instances rather than threads.
CMD ["sh", "-c", "exec gunicorn --bind 0.0.0.0:${PORT} --workers 1 --threads 8 --timeout 60 ixid_scheduler_handler:app"]
