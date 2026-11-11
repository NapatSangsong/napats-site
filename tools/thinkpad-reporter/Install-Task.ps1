<#
.SYNOPSIS
  Install the every-minute Scheduled Task for the /thinkpad reporter (no admin needed).

.DESCRIPTION
  Copies Send-Status.ps1 into %LOCALAPPDATA%\napats-status and registers task
  "napats-status-reporter" for the current user:
    - runs while the user is logged on (Interactive, not elevated)
    - every 1 minute, indefinitely; a missed run starts when possible
    - never two at once (IgnoreNew); killed if it runs over 1 minute
    - started through "conhost --headless" so no console window flashes
  Requires config.json and token.dpapi (Set-Token.ps1) in that folder first.
  Remove with Uninstall-Task.ps1.
#>
[CmdletBinding()]
param([string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'napats-status'))
$ErrorActionPreference = 'Stop'

$TaskName = 'napats-status-reporter'
foreach ($f in 'config.json', 'token.dpapi') {
    if (-not (Test-Path -LiteralPath (Join-Path $InstallDir $f))) { throw "$f missing in $InstallDir" }
}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Send-Status.ps1') -Destination (Join-Path $InstallDir 'Send-Status.ps1') -Force

$script = Join-Path $InstallDir 'Send-Status.ps1'
$action = New-ScheduledTaskAction `
    -Execute (Join-Path $env:WINDIR 'System32\conhost.exe') `
    -Argument "--headless powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$script`"" `
    -WorkingDirectory $InstallDir
# -Once + RepetitionInterval with no RepetitionDuration = repeat indefinitely
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
$settings = New-ScheduledTaskSettingsSet `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 1) `
    -StartWhenAvailable `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -Hidden
$principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
    -Description 'Heartbeat to ai.napats.dev/thinkpad (read-only status reporter)' -Force | Out-Null

$t = Get-ScheduledTask -TaskName $TaskName
$rep = $t.Triggers[0].Repetition
Write-Host ("Installed '{0}': state={1} interval={2} duration={3}" -f $TaskName, $t.State, $rep.Interval, $(if ($rep.Duration) { $rep.Duration } else { 'indefinite' }))
