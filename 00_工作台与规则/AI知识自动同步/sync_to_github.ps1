param([switch]$NoPush)
$ErrorActionPreference = 'Stop'
$vault = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$git = 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe'
if (-not (Test-Path $git)) { $git = 'git' }
$python = 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
if (-not (Test-Path $python)) { $python = 'python' }
$lockPath = Join-Path $vault '.ai-sync\sync.lock'
New-Item -ItemType Directory -Force (Split-Path $lockPath) | Out-Null
$lock = [System.IO.File]::Open($lockPath, 'OpenOrCreate', 'ReadWrite', 'None')
try {
    & $python (Join-Path $PSScriptRoot 'sync_knowledge.py') --vault $vault
    if ($LASTEXITCODE -ne 0) { throw 'Knowledge extraction failed.' }
    $blocked = Get-ChildItem $vault -Recurse -File -Force | Where-Object {
        $_.FullName -notmatch '\\.git\\|\\.md-sync\.git\\|\\node_modules\\|\\.codex_tmp\\|\\tmp\\' -and
        $_.Name -ne 'credential.clixml' -and
        ($_.Name -match '^(\.env($|\.)|.*\.(key|pem|pfx|p12|clixml)$)' -or ($_.Length -gt 20MB -and $_.Extension -ne '.xlsx'))
    }
    if ($blocked) { throw ('Safety check blocked: ' + (($blocked.FullName | Select-Object -First 10) -join ', ')) }
    Push-Location $vault
    try {
        & $git pull --rebase --autostash origin main
        if ($LASTEXITCODE -ne 0) { throw 'Git pull/rebase failed.' }
        & $git add -A
        $pending = & $git diff --cached --name-only
        if (-not $pending) { Write-Output 'No changes to sync.'; return }
        $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm'
        & $git commit -m "Automated knowledge sync $stamp"
        if ($LASTEXITCODE -ne 0) { throw 'Git commit failed.' }
        if (-not $NoPush) {
            & $git push origin main
            if ($LASTEXITCODE -ne 0) { throw 'GitHub push failed; local commit retained.' }
        }
    } finally { Pop-Location }
} finally { $lock.Dispose() }
