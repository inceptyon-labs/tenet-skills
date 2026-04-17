#!/usr/bin/env bash
# upload.sh — Reference script for uploading a Tenet report to the dashboard.
# Usage: ./upload.sh <report-json-path>
#
# Requires:
#   HEALTHCHECK_DASHBOARD_URL — base URL of the Tenet dashboard (default: http://localhost:8787)
#   HEALTHCHECK_API_TOKEN     — bearer token for authentication
#
# This script is provided as a reference for manual retries. The orchestrator
# skill handles uploads automatically during normal operation.

set -euo pipefail

REPORT_PATH="${1:?Usage: upload.sh <report.json>}"
DASHBOARD_URL="${HEALTHCHECK_DASHBOARD_URL:-http://localhost:8787}"
API_TOKEN="${HEALTHCHECK_API_TOKEN:?HEALTHCHECK_API_TOKEN is not set}"

if [ ! -f "$REPORT_PATH" ]; then
  echo "Error: Report file not found: $REPORT_PATH" >&2
  exit 1
fi

# Validate JSON
if ! jq empty "$REPORT_PATH" 2>/dev/null; then
  echo "Error: Invalid JSON in $REPORT_PATH" >&2
  exit 1
fi

echo "Uploading report to ${DASHBOARD_URL}/api/v1/reports ..."

HTTP_CODE=$(curl -s -o /tmp/tenet-upload-response.json -w "%{http_code}" \
  -X POST \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d @"$REPORT_PATH" \
  "${DASHBOARD_URL}/api/v1/reports")

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
  echo "Upload successful (HTTP ${HTTP_CODE})"
  SLUG=$(jq -r '.project.slug' "$REPORT_PATH")
  echo "View report: ${DASHBOARD_URL}/projects/${SLUG}"
else
  echo "Upload failed (HTTP ${HTTP_CODE})" >&2
  echo "Response:" >&2
  cat /tmp/tenet-upload-response.json >&2
  echo "" >&2
  echo "Report saved at: $REPORT_PATH" >&2
  echo "Retry manually with:" >&2
  echo "  curl -X POST -H 'Authorization: Bearer TOKEN_HERE' -H 'Content-Type: application/json' -d @${REPORT_PATH} ${DASHBOARD_URL}/api/v1/reports" >&2
  exit 1
fi

rm -f /tmp/tenet-upload-response.json
