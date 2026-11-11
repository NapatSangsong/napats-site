<#
.SYNOPSIS
  Create (or replace) the reporter's bearer token on this ThinkPad.

.DESCRIPTION
  -Generate makes a new random 256-bit token. Without it you are prompted to
  paste one. The token is stored DPAPI-encrypted for the current Windows user in
  %LOCALAPPDATA%\napats-status\token.dpapi, and the folder ACL is reduced to
  that user only. The raw token is never printed; only its SHA-256, which is
  what the worker stores:

    npx wrangler secret put THINKPAD_INGEST_TOKEN_SHA256   (paste the hash)

  Rotating = run this again with -Generate, then update the secret.
#>
[CmdletBinding()]
param(
    [string]$ConfigDir = (Join-Path $env:LOCALAPPDATA 'napats-status'),
    [switch]$Generate
)
$ErrorActionPreference = 'Stop'

New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null
# by SID: %USERDOMAIN% is WORKGROUP in an ssh session on a local account
$me = '*' + [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
# folder: current user only (no inheritance, no Administrators/SYSTEM entries)
& icacls.exe $ConfigDir /inheritance:r /grant:r "$($me):(OI)(CI)F" | Out-Null
if ($LASTEXITCODE -ne 0) { throw "icacls failed ($LASTEXITCODE)" }

if ($Generate) {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes); $rng.Dispose()
    $token = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
} else {
    $secureIn = Read-Host -AsSecureString 'Paste token'
    $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureIn)
    try { $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}
if ($token.Length -lt 16) { throw 'token too short' }

$path = Join-Path $ConfigDir 'token.dpapi'
ConvertTo-SecureString -String $token -AsPlainText -Force | ConvertFrom-SecureString | Set-Content -LiteralPath $path -Encoding ASCII
& icacls.exe $path /inheritance:r /grant:r "$($me):F" | Out-Null

$sha = [Security.Cryptography.SHA256]::Create()
$hex = -join ($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($token)) | ForEach-Object { $_.ToString('x2') })
$sha.Dispose()
$token = $null

Write-Host "Saved $path (DPAPI, current user only)."
Write-Host "THINKPAD_INGEST_TOKEN_SHA256=$hex"
