$ErrorActionPreference = 'Stop'

$connectorDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$configPath = Join-Path $connectorDir 'config.json'
$credentialPath = Join-Path $connectorDir 'credential.clixml'

Write-Host 'Configure the read-only Kingdee K3Cloud MCP connection.'
$baseUrl = (Read-Host 'Private-cloud root URL, for example https://erp.example.com').Trim().TrimEnd('/')
if ($baseUrl -match '^https?://openapi\.open\.kingdee\.com') {
    throw 'This is the API documentation site, not the private-cloud WebAPI URL.'
}
if ($baseUrl -notmatch '^https?://') {
    throw 'The service URL must start with http:// or https://.'
}

$acctId = (Read-Host 'Existing data-center/account-set ID').Trim()
$usernameDefault = ([string]([char]0x66FE) + [char]0x5FB7 + [char]0x709C)
$username = (Read-Host "API username (Enter for $usernameDefault)").Trim()
if (-not $username) { $username = $usernameDefault }
$lcidText = (Read-Host 'lcid (Enter for Chinese 2052)').Trim()
if (-not $lcidText) { $lcidText = '2052' }

if (-not $acctId) {
    throw 'The data-center/account-set ID is required.'
}

$credential = Get-Credential -UserName $username -Message 'Enter the Kingdee API password'
$credential | Export-Clixml -LiteralPath $credentialPath -Force

$config = [ordered]@{
    base_url = $baseUrl
    acct_id = $acctId
    username = $username
    lcid = [int]$lcidText
    timeout_seconds = 30
}
$config | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8

Write-Host "Configuration saved: $configPath"
Write-Host 'The password is not stored in config.json. Windows encrypts credential.clixml for the current user.'
Write-Host 'Reopen this workspace task, then call test_connection.'
