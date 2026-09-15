#!/bin/bash
set -e

echo ">>> EAS pre-install: configuring workspace for mobile build..."
echo ">>> Working directory: $(pwd)"
echo ">>> Contents: $(ls -la)"

if [ -f "../../pnpm-workspace.yaml" ]; then
  echo ">>> Found pnpm-workspace.yaml at monorepo root"
  cd ../..
fi

echo ">>> Project root: $(pwd)"

cat > pnpm-workspace.yaml << 'EOF'
packages:
  - artifacts/megacity
  - lib/*
EOF

cat > .npmrc << 'EOF'
auto-install-peers=true
strict-peer-dependencies=false
frozen-lockfile=false
EOF

rm -f pnpm-lock.yaml

sed -i 's/"preinstall":.*/"preinstall": "echo skipping preinstall",/' package.json

echo ">>> EAS pre-install: done"
