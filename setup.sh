#!/usr/bin/env bash
set -e

echo "=== Claude Bot Setup ==="

# Step 1: Install bun
if command -v bun &>/dev/null; then
  echo "[✓] bun already installed ($(bun --version))"
else
  echo "[*] Installing bun..."
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
  echo "[✓] bun installed"
fi

# Step 2: Claude plugin setup instructions
echo ""
echo "=== Next: Claude Plugin Setup ==="
echo "Run the following commands inside Claude Code:"
echo ""
echo "  /plugin marketplace add anthropics/claude-plugins-official"
echo "  /plugin install discord@claude-plugins-official"
echo ""
echo "After that, start the bot with:"
echo "  npm start"
echo "  (or: claude --channels plugin:discord@claude-plugins-official)"
