#!/usr/bin/env bash
# Builds the Android app on EAS with the production profile.
#
#   scripts/eas-production.sh                 build
#   scripts/eas-production.sh --auto-submit   build, then upload to Google Play
set -euo pipefail
cd "$(dirname "$0")/.."

eas build --platform android --profile production "$@"
