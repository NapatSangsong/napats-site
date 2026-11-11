<#
.SYNOPSIS
  Remove the /thinkpad reporter task. -RemoveFiles also deletes
  %LOCALAPPDATA%\napats-status (config.json, token.dpapi, log, script).
#>
[CmdletBinding()]
param(
    [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'napats-status'),
    [switch]$RemoveFiles
)
$ErrorActionPreference = 'Stop'
$TaskName = 'napats-status-reporter'

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Removed task '$TaskName'."
} else {
    Write-Host "Task '$TaskName' not found."
}
if (Get-ScheduledTask -TaskName 'napats-vpn-connect' -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName 'napats-vpn-connect' -Confirm:$false
    Write-Host "Removed task 'napats-vpn-connect'."
}
if ($RemoveFiles -and (Test-Path -LiteralPath $InstallDir)) {
    Remove-Item -LiteralPath $InstallDir -Recurse -Force
    Write-Host "Deleted $InstallDir."
}
