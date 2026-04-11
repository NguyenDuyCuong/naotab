#!/bin/bash
# build.sh — Package naoTab into a distributable .zip
# Version is read from manifest.json automatically

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Read version from manifest.json
VERSION=$(grep '"version"' manifest.json | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/')

if [ -z "$VERSION" ]; then
  echo "❌ Could not read version from manifest.json"
  exit 1
fi

OUTPUT="naotab-v${VERSION}.zip"

echo "📦 Building naoTab v${VERSION}..."

# Remove old build if exists
rm -f "$OUTPUT"

# Create zip with only the files needed to run the extension
zip -r "$OUTPUT" \
  manifest.json \
  popup.html popup.css popup.js \
  app.html app.js \
  settings.html settings.js \
  schema.js storage.js ai.js export.js \
  d3.min.js \
  jszip.min.js \
  icons/

echo "✅ Built: $OUTPUT"
echo "   $(du -sh "$OUTPUT" | cut -f1) — ready to upload to GitHub Releases"
echo ""
echo "To install:"
echo "  1. Unzip $OUTPUT"
echo "  2. Go to chrome://extensions → Enable Developer Mode"
echo "  3. Click 'Load unpacked' → select the unzipped folder"
