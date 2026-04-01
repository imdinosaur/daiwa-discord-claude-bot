Write-Host "=== Claude Bot Setup ==="

# Step 1: Install bun
if (Get-Command bun -ErrorAction SilentlyContinue) {
    Write-Host "[OK] bun already installed ($(bun --version))"
} else {
    Write-Host "[*] Installing bun..."
    irm bun.sh/install.ps1 | iex
    Write-Host "[OK] bun installed"
}

Write-Host ""
Write-Host "=== Next: Claude Plugin Setup ==="
Write-Host "Run the following commands inside Claude Code:"
Write-Host ""
Write-Host "  /plugin marketplace add anthropics/claude-plugins-official"
Write-Host "  /plugin install discord@claude-plugins-official"
Write-Host ""
Write-Host "After that, start the bot with:"
Write-Host "  npm start"
Write-Host "  (or: claude --channels plugin:discord@claude-plugins-official)"
