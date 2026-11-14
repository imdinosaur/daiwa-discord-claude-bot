param(
    [Parameter(Mandatory=$true)]
    [string]$BotName,

    # Open Claude Code's session picker to continue a previous session
    [switch]$Resume,

    # Build the scheduled jobs in bots/<BotName>/schedules.json (e.g. stock/gamma reports) at startup
    [switch]$Schedules,

    # Skip the slash command process (scripts/commands.ts)
    [switch]$NoCommands,

    # Send the startup message even if it was already sent today
    [switch]$ForceAnnounce
)

$botDir = Join-Path $PSScriptRoot "bots/$BotName"
if (-not (Test-Path $botDir)) {
    Write-Error "Bot '$BotName' not found. Expected folder: $botDir"
    exit 1
}

# Checked before any startup notification so a bad flag fails quietly
$schedulesFile = Join-Path $botDir "schedules.json"
if ($Schedules -and -not (Test-Path $schedulesFile)) {
    Write-Error "[$BotName] -Schedules was given but $schedulesFile does not exist."
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

# Startup notification: skipped when resuming, and sent at most once per Taipei calendar day per bot
$startupMsgFile = Join-Path $botDir "startup_message.txt"
$announceMarker = Join-Path $PSScriptRoot "memory/last_startup_$BotName.txt"
$today = [DateTimeOffset]::UtcNow.ToOffset([TimeSpan]::FromHours(8)).ToString("yyyy-MM-dd")
$lastAnnounced = if (Test-Path $announceMarker) { (Get-Content $announceMarker -Raw).Trim() } else { "" }
$alreadyAnnounced = ($lastAnnounced -eq $today) -and -not $ForceAnnounce
if ($alreadyAnnounced -and -not $Resume) {
    Write-Host "[$BotName] Startup message already sent today ($today); skipping. Use -ForceAnnounce to send again."
}

if ((Test-Path $startupMsgFile) -and -not $Resume -and -not $alreadyAnnounced) {
    $startupText = (Get-Content $startupMsgFile -Raw -Encoding UTF8).Trim()
    $announced = $false

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
            $announced = $true
        } catch {
            Write-Warning "Failed to send startup message to channel: $_"
        }
    }

    # Channel notification via Bot Token (一般頻道)
    if ($env:DISCORD_BOT_TOKEN) {
        try {
            node (Join-Path $PSScriptRoot "scripts/push_message.js") --channel $startupText --broadcast
            if ($LASTEXITCODE -eq 0) {
                Write-Host "[$BotName] Startup broadcast done."
                $announced = $true
            } else {
                Write-Warning "Startup broadcast exited with code $LASTEXITCODE"
            }
        } catch {
            Write-Warning "Failed to send startup message to 一般: $_"
        }
    }

    # Only mark the day once something actually went out, so a failed send is retried on the next start
    if ($announced) {
        Set-Content -Path $announceMarker -Value $today -Encoding ASCII
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

# Scheduled jobs (CronCreate) live only in the session, so -Schedules rebuilds them from schedules.json on each start
if ($Resume) {
    # --resume without a session ID opens the interactive session picker.
    # A positional prompt here could be taken as the session ID, so schedules are not injected on resume.
    $claudeArgs += "--resume"
    if ($Schedules) {
        Write-Warning "[$BotName] Schedules are not rebuilt on resume. Tell the bot in Discord: reload schedules"
    }
    Write-Host "[$BotName] Starting (resume)..."
} elseif ($Schedules) {
    $relSchedules = "bots/$BotName/schedules.json"
    $claudeArgs += "[startup] Load schedules: follow shared/skills/schedules.md and read $relSchedules."
    Write-Host "[$BotName] Starting with schedules ($relSchedules)..."
} else {
    Write-Host "[$BotName] Starting..."
}

# Slash commands run in their own process beside Claude; output goes to logs/ so it stays out of the Claude UI
$commandsProc = $null
$commandsFile = Join-Path $botDir "commands.json"
if ((Test-Path $commandsFile) -and -not $NoCommands) {
    $logDir = Join-Path $PSScriptRoot "logs"
    New-Item -ItemType Directory -Force $logDir | Out-Null
    $commandsProc = Start-Process node `
        -ArgumentList "`"$(Join-Path $PSScriptRoot 'scripts/commands.ts')`"" `
        -NoNewWindow -PassThru `
        -RedirectStandardOutput (Join-Path $logDir "commands-$BotName.log") `
        -RedirectStandardError (Join-Path $logDir "commands-$BotName.err.log")
    # Config or login errors make it exit right away; say so instead of failing silently
    Start-Sleep -Seconds 3
    if ($commandsProc.HasExited) {
        Write-Warning "[$BotName] Slash command process exited. See logs/commands-$BotName.err.log"
        $commandsProc = $null
    } else {
        Write-Host "[$BotName] Slash commands started (logs/commands-$BotName.log)."
    }
}

try {
    claude @claudeArgs
} finally {
    if ($commandsProc -and -not $commandsProc.HasExited) {
        Stop-Process -Id $commandsProc.Id -Force -ErrorAction SilentlyContinue
    }
}
