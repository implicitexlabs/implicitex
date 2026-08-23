# IX ID Onboarding Web — Cloud Run static service
# ================================================
# Serves the ixid-onboarding-web/public/ static application.
# No Firestore/Datastore authority. No application logic.
#
# The runtime identity (ixid-onboarding-web-runtime) holds zero database permissions.
# This container serves static files and nothing else.
#
# Path contract (from Load Balancer — Slice B, not yet active):
#   app.ixid.me /*             → this service (default)
#   app.ixid.me /api/holder/*  → ixid-holder-backend (frozen M1 rewrite)
#   app.ixid.me /api/*         → ixid-edge-backend (frozen M1 rewrite)
#
# Slice A: this service is deployed dark (internal-and-cloud-load-balancing ingress).
# It becomes reachable only after Slice B adds the app.ixid.me host rule to ixid-url-map.
#
# Build:
#   docker build -t ixid-onboarding-web .

# nginx 1.30.4 — stable branch as of August 2026, includes July 15 security fixes.
# Pinned to an explicit patch release. After the local container test, record
# the immutable image digest (docker inspect --format='{{index .RepoDigests 0}}')
# and consider pinning the production Dockerfile to that digest.
FROM nginx:1.30.4-alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# nginx config: listen on $PORT (Cloud Run injects PORT=8080), serve /app
COPY nginx.conf /etc/nginx/conf.d/app.conf.template

# Copy the static application
COPY public/ /usr/share/nginx/html/

EXPOSE 8080

# Substitute $PORT into the nginx config at container start, then run nginx
CMD ["/bin/sh", "-c", \
  "envsubst '$PORT' < /etc/nginx/conf.d/app.conf.template > /etc/nginx/conf.d/app.conf && \
   nginx -g 'daemon off;'"]
