param(
    [Parameter(Mandatory=$true)]
    [string]$BotName,

    # Open Claude Code's session picker to continue a previous session
    [switch]$Resume
)

$botDir = Join-Path $PSScriptRoot "bots/$BotName"
if (-not (Test-Path $botDir)) {
    Write-Error "Bot '$BotName' not found. Expected folder: $botDir"
    exit 1
}

# Load token from official plugin's config
$pluginEnv = "$HOME\.claude\channels\discord\.env"
if (Test-Path $pluginEnv) {
    Get-Content $pluginEnv | Where-Object { $_ -notmatch '^#' -and $_ -match '=' } | ForEach-Object {
        $parts = $_ -split '=', 2
        [System.Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim())
    }
}

# Load shared project env
$projectEnv = Join-Path $PSScriptRoot ".env"
if (Test-Path $projectEnv) {
    Get-Content $projectEnv | Where-Object { $_ -notmatch '^#' -and $_ -match '=' } | ForEach-Object {
        $parts = $_ -split '=', 2
        [System.Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim())
    }
}

# Load bot-specific env (optional)
$botEnv = Join-Path $botDir ".env"
if (Test-Path $botEnv) {
    Get-Content $botEnv | Where-Object { $_ -notmatch '^#' -and $_ -match '=' } | ForEach-Object {
        $parts = $_ -split '=', 2
        [System.Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim())
    }
}

# Marks this as a bot session; scripts/hooks/outside_project_guard.js only acts when set
$env:CLAUDE_BOT_NAME = $BotName

if (-not $env:DISCORD_BOT_TOKEN) {
    Write-Error "ERROR: DISCORD_BOT_TOKEN not found. Run /discord:configure in Claude Code first."
    exit 1
}

# Fetch bot user ID for @mention
$botUserId = $null
try {
    $meResponse = Invoke-RestMethod `
        -Uri "https://discord.com/api/v10/users/@me" `
        -Headers @{ "Authorization" = "Bot $env:DISCORD_BOT_TOKEN" }
    $botUserId = $meResponse.id
} catch {}

# Send startup notification via webhook (channel); skipped when resuming
$startupMsgFile = Join-Path $botDir "startup_message.txt"
if ((Test-Path $startupMsgFile) -and -not $Resume) {
    $startupText = (Get-Content $startupMsgFile -Raw -Encoding UTF8).Trim()

    # Channel notification via Webhook
    if ($env:DISCORD_WEBHOOK_URL) {
        $onlineText = "$([char]0x5DF2)$([char]0x7D93)$([char]0x4E0A)$([char]0x7DDA)"
        $channelText = if ($botUserId) { "<@$botUserId> $onlineText" } else { $onlineText }
        $escaped = $channelText -replace '\\', '\\\\' -replace '"', '\"'
        $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes("{`"content`":`"$escaped`"}")
        try {
            Invoke-RestMethod `
                -Uri $env:DISCORD_WEBHOOK_URL `
                -Method Post `
                -Body $bodyBytes `
                -ContentType "application/json; charset=utf-8" | Out-Null
            Write-Host "[$BotName] Startup message sent to channel."
        } catch {
            Write-Warning "Failed to send startup message to channel: $_"
        }
    }

    # Channel notification via Bot Token (一般頻道)
    if ($env:DISCORD_BOT_TOKEN) {
        try {
            node (Join-Path $PSScriptRoot "scripts/push_message.js") --channel $startupText --broadcast
            Write-Host "[$BotName] Startup broadcast done."
        } catch {
            Write-Warning "Failed to send startup message to 一般: $_"
        }
    }
}

# Build system prompt: character + all skills
$systemPrompt = Get-Content (Join-Path $botDir "character.md") -Raw -Encoding UTF8

# Optional voice-line corpus, kept separate so character.md stays readable
$voiceLinesFile = Join-Path $botDir "voice_lines.md"
if (Test-Path $voiceLinesFile) {
    $systemPrompt += "`n`n---`n`n" + (Get-Content $voiceLinesFile -Raw -Encoding UTF8)
}

$skillsDir = Join-Path $botDir "skills"
if (Test-Path $skillsDir) {
    Get-ChildItem $skillsDir -Filter "*.md" | ForEach-Object {
        $skill = Get-Content $_.FullName -Raw -Encoding UTF8
        $systemPrompt += "`n`n---`n`n" + $skill
    }
}

$sharedSkillsDir = Join-Path $PSScriptRoot "shared/skills"
if (Test-Path $sharedSkillsDir) {
    Get-ChildItem $sharedSkillsDir -Filter "*.md" | ForEach-Object {
        $skill = Get-Content $_.FullName -Raw -Encoding UTF8
        $systemPrompt += "`n`n---`n`n" + $skill
    }
}

# The prompt is passed on the command line; Windows caps a command line at 32767 chars
$PROMPT_WARN_LENGTH = 28000
if ($systemPrompt.Length -gt $PROMPT_WARN_LENGTH) {
    Write-Warning "[$BotName] System prompt is $($systemPrompt.Length) chars; Windows command-line limit is 32767. Trim character.md / voice_lines.md / skills."
}

$claudeArgs = @("--channels", "plugin:discord@claude-plugins-official", "--system-prompt", $systemPrompt)
if ($Resume) {
    # --resume without a session ID opens the interactive session picker
    $claudeArgs += "--resume"
    Write-Host "[$BotName] Starting (resume)..."
} else {
    Write-Host "[$BotName] Starting..."
}
claude @claudeArgs
