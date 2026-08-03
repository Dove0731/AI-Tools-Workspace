$ErrorActionPreference = 'Stop'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = $utf8NoBom
[Console]::OutputEncoding = $utf8NoBom
$OutputEncoding = $utf8NoBom

$connectorDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$credentialPath = Join-Path $connectorDir 'credential.clixml'
$configPath = Join-Path $connectorDir 'config.json'
$pythonPath = 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
$serverPath = Join-Path $connectorDir 'kingdee_mcp_server.py'

if (-not (Test-Path -LiteralPath $pythonPath)) {
    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if (-not $pythonCommand) {
        throw 'Python was not found. Reopen Codex or configure pythonPath in launch_mcp.ps1.'
    }
    $pythonPath = $pythonCommand.Source
}

$env:KINGDEE_MCP_CONFIG = $configPath
$env:KINGDEE_PASSWORD = ''
$env:PYTHONUTF8 = '1'

if (Test-Path -LiteralPath $credentialPath) {
    $credential = Import-Clixml -LiteralPath $credentialPath
    $env:KINGDEE_PASSWORD = $credential.GetNetworkCredential().Password
}

try {
    & $pythonPath $serverPath
}
finally {
    $env:KINGDEE_PASSWORD = ''
    Remove-Item Env:KINGDEE_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:PYTHONUTF8 -ErrorAction SilentlyContinue
}
