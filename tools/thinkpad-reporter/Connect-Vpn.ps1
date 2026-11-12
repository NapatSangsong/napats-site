<#
.SYNOPSIS
  Connect the Cisco Secure Client VPN on request from LINE (owner approved 2026-11-11).

.DESCRIPTION
  Started by the on-demand task "napats-vpn-connect" after Send-Status.ps1
  saves a command from the worker to pending-command.json. Steps:
    1. decrypt {u,p} with the non-exportable CNG key (New-CommandKey.ps1); the
       command file is deleted right away; the user name (not the password) is
       remembered DPAPI-protected for "vpn <password>"
    2. already connected? -> report and stop
    3. start `vpncli -s` connect to the profile's default host and answer its
       prompts (Username / Password / accept banner); if the GUI blocks the CLI,
       close the GUI, retry, and reopen it afterwards
    4. meanwhile watch the SSO login window (WebView2) with UI Automation:
       fill email/password, press Next / Sign in / Yes, and send the number
       shown for Microsoft Authenticator number matching to LINE
    5. report connected / failed. Gives up after 5 minutes.
  The password is never written to disk or to the log. Local log:
  %LOCALAPPDATA%\napats-status\vpn-connect.log (stages + UI element names only).
#>
[CmdletBinding()]
param(
    [string]$ConfigDir = (Join-Path $env:LOCALAPPDATA 'napats-status'),
    [int]$TimeoutSec = 300
)
$ErrorActionPreference = 'Stop'

$log = Join-Path $ConfigDir 'vpn-connect.log'
function Log([string]$m) { try { Add-Content -LiteralPath $log -Value ('{0} {1}' -f (Get-Date -Format s), $m) -Encoding UTF8 } catch { } }

$cfg = Get-Content -LiteralPath (Join-Path $ConfigDir 'config.json') -Raw | ConvertFrom-Json
$statusUrl = ([string]$cfg.endpoint) -replace '/report$', '/command-status'
$adapterMatch = 'Cisco|AnyConnect'
if ($cfg.PSObject.Properties.Name -contains 'vpn_adapter_match' -and $cfg.vpn_adapter_match) { $adapterMatch = [string]$cfg.vpn_adapter_match }

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.Net.Http, System.Core, UIAutomationClient, UIAutomationTypes

function Read-Token {
    $secure = (Get-Content -LiteralPath (Join-Path $ConfigDir 'token.dpapi') -Raw).Trim() | ConvertTo-SecureString
    $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}

$script:cmdId = 'unknown'
function Report([string]$stage, [string]$number = $null, [string]$detail = $null) {
    Log "report $stage $number $detail"
    try {
        $o = [ordered]@{ id = $script:cmdId; stage = $stage }
        if ($number) { $o.number = $number }
        if ($detail) {
            $d = ($detail -replace "[^A-Za-z0-9 _:()'\-,]", ' ')
            $o.detail = $d.Substring(0, [Math]::Min(160, $d.Length))
        }
        $http = New-Object System.Net.Http.HttpClient
        $http.Timeout = [TimeSpan]::FromSeconds(10)
        $req = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Post, $statusUrl)
        $req.Headers.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue('Bearer', (Read-Token))
        $req.Content = New-Object System.Net.Http.StringContent(($o | ConvertTo-Json -Compress), [Text.Encoding]::UTF8, 'application/json')
        $http.SendAsync($req).GetAwaiter().GetResult().Dispose()
        $http.Dispose()
    } catch { Log ("report failed: " + $_.Exception.Message) }
}

function Test-VpnUp {
    $a = @(Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.InterfaceDescription -match $adapterMatch -and $_.Status -eq 'Up' }) | Select-Object -First 1
    if (-not $a) { return $false }
    return @(Get-NetIPAddress -InterfaceIndex $a.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.AddressState -eq 'Preferred' }).Count -gt 0
}

# ---------- 1) command ----------
$cmdFile = Join-Path $ConfigDir 'pending-command.json'
if (-not (Test-Path -LiteralPath $cmdFile)) { Log 'no pending command'; exit 0 }
$cmd = Get-Content -LiteralPath $cmdFile -Raw | ConvertFrom-Json
Remove-Item -LiteralPath $cmdFile -Force
$script:cmdId = [string]$cmd.id
Log "command $($script:cmdId) $($cmd.type)"

$user = ''; $pass = ''
try {
    $rsa = New-Object System.Security.Cryptography.RSACng([System.Security.Cryptography.CngKey]::Open('napats-status-cmd'))
    $plain = [Text.Encoding]::UTF8.GetString($rsa.Decrypt([Convert]::FromBase64String([string]$cmd.enc), [System.Security.Cryptography.RSAEncryptionPadding]::OaepSHA256))
    $obj = $plain | ConvertFrom-Json
    $plain = $null
    $user = [string]$obj.u; $pass = [string]$obj.p; $obj = $null
} catch {
    Report 'failed' $null 'cannot decrypt the command'
    exit 1
}
$userFile = Join-Path $ConfigDir 'vpn-user.dpapi'
if ($user) {
    ConvertTo-SecureString -String $user -AsPlainText -Force | ConvertFrom-SecureString | Set-Content -LiteralPath $userFile -Encoding ASCII
} elseif (Test-Path -LiteralPath $userFile) {
    $s = (Get-Content -LiteralPath $userFile -Raw).Trim() | ConvertTo-SecureString
    $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
    try { $user = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}

# ---------- 2) already up? ----------
if (Test-VpnUp) { Report 'already_connected'; $pass = $null; exit 0 }
Report 'started'

# ---------- 3) vpncli ----------
$cscDir = "${env:ProgramFiles(x86)}\Cisco\Cisco Secure Client"
$vpncli = Join-Path $cscDir 'vpncli.exe'
$gui = Join-Path $cscDir 'UI\csc_ui.exe'
$vpnHost = ''
foreach ($prefs in @("$env:LOCALAPPDATA\Cisco\Cisco Secure Client\VPN\preferences.xml", "$env:LOCALAPPDATA\Cisco\Cisco AnyConnect Secure Mobility Client\preferences.xml")) {
    if ($vpnHost -or -not (Test-Path -LiteralPath $prefs)) { continue }
    try {
        $x = [xml](Get-Content -LiteralPath $prefs -Raw)
        foreach ($n in 'DefaultHostName', 'DefaultHostAddress') {
            $v = $x.SelectSingleNode("//*[local-name()='$n']")
            if (-not $vpnHost -and $v -and $v.InnerText.Trim()) { $vpnHost = $v.InnerText.Trim() }
        }
    } catch { }
}
if (-not $vpnHost) { Report 'failed' $null 'no default VPN host in Secure Client preferences'; exit 1 }

$script:cli = $null
$script:cliOut = $null
$script:pending = $null
$script:buf = New-Object char[] 4096
function Start-Cli {
    $psi = New-Object System.Diagnostics.ProcessStartInfo($vpncli, '-s')
    $psi.UseShellExecute = $false
    $psi.RedirectStandardInput = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true
    $script:cli = [System.Diagnostics.Process]::Start($psi)
    $script:cliOut = New-Object System.Text.StringBuilder
    $script:pending = $script:cli.StandardOutput.ReadAsync($script:buf, 0, 4096)
    $script:cli.StandardInput.WriteLine("connect $vpnHost")
    $script:cli.StandardInput.Flush()
    Log 'vpncli connect started'
}
function Read-Cli {
    # non-blocking drain of whatever vpncli printed so far
    if (-not $script:cli) { return '' }
    $text = ''
    while ($script:pending -and $script:pending.IsCompleted) {
        $n = $script:pending.Result
        if ($n -le 0) { $script:pending = $null; break }
        $text += (New-Object string($script:buf, 0, $n))
        $script:pending = $script:cli.StandardOutput.ReadAsync($script:buf, 0, 4096)
    }
    return $text
}
function Send-Cli([string]$line) { try { $script:cli.StandardInput.WriteLine($line); $script:cli.StandardInput.Flush() } catch { } }

# ---------- 4) SSO window via UI Automation ----------
$A = [System.Windows.Automation.AutomationElement]
$TS = [System.Windows.Automation.TreeScope]
$AnyCond = [System.Windows.Automation.Condition]::TrueCondition
$script:done = @{}
$script:lastNumber = ''
$script:pwFills = 0
$script:pwFilledAt = $null
$script:cliPwSent = $false

# Only windows that belong to the Cisco client may be touched. Other apps
# (LinkedIn, Teams, Outlook, ...) also host msedgewebview2 and show "Sign in"
# pages: a WebView2 window counts only when its parent chain leads to a Cisco
# process. (2026-11-12: the first version matched any WebView2 window and
# typed the VPN login into the LinkedIn app.)
$script:owned = @{}
function Test-CiscoOwned([int]$procId) {
    for ($i = 0; $i -lt 6 -and $procId -gt 0; $i++) {
        $p = Get-CimInstance Win32_Process -Filter "ProcessId=$procId" -ErrorAction SilentlyContinue
        if (-not $p) { return $false }
        if ($p.Name -match '^(csc_ui|vpnui|acwebhelper|vpndownloader)\.exe$') { return $true }
        if ($p.Name -ne 'msedgewebview2.exe') { return $false }
        $procId = [int]$p.ParentProcessId
    }
    return $false
}
function Get-LoginElements {
    $out = @()
    foreach ($w in $A::RootElement.FindAll($TS::Children, $AnyCond)) {
        try {
            $procId = [int]$w.Current.ProcessId
            if (-not $script:owned.ContainsKey($procId)) { $script:owned[$procId] = Test-CiscoOwned $procId }
            if ($script:owned[$procId]) { $out += ,$w }
        } catch { }
    }
    return $out
}

function Invoke-El($e) {
    try { ($e.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)).Invoke(); return $true } catch { return $false }
}
function Set-El($e, [string]$v) {
    try { $e.SetFocus() } catch { }
    try { ($e.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)).SetValue($v); return $true } catch { return $false }
}

function Step-Login {
    foreach ($w in (Get-LoginElements)) {
        $all = $w.FindAll($TS::Descendants, $AnyCond)
        $edits = @(); $buttons = @(); $number = $null; $err = $null
        foreach ($e in $all) {
            $c = $e.Current
            $type = $c.ControlType.ProgrammaticName
            $id = [string]$c.AutomationId; $name = [string]$c.Name
            if ($type -eq 'ControlType.Edit' -and $c.IsEnabled -and $c.IsOffscreen -eq $false) { $edits += ,$e }
            elseif ($type -eq 'ControlType.Button' -and $c.IsEnabled) { $buttons += ,$e }
            if ($id -eq 'idRichContext_DisplaySign' -or ($type -eq 'ControlType.Text' -and $name -match '^\d{2,3}$' -and $id -match 'DisplaySign|displaySign')) { $number = $name.Trim() }
            if ($id -match '^(passwordError|usernameError|idTD_Error|errorText)$' -and $name) { $err = $name }
        }
        if ($err) { return @{ failed = 'sign-in error shown on the login page' } }
        if ($number -and $number -ne $script:lastNumber) {
            $script:lastNumber = $number
            Report 'need_number' $number
        }
        $filled = $false
        foreach ($e in $edits) {
            $c = $e.Current
            $val = ''
            try { $val = ($e.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)).Current.Value } catch { }
            if ($c.IsPassword) {
                # the password goes in ONCE per command: a password field that is still
                # (or again) there 15 s after submitting means a wrong password or an
                # unexpected page -> stop rather than risk locking the account
                if (-not $val -and $pass) {
                    if ($script:pwFills -ge 1) {
                        if (((Get-Date) - $script:pwFilledAt).TotalSeconds -lt 15) { continue }
                        return @{ failed = 'password asked again (wrong password) - stopped to avoid account lockout' }
                    }
                    if (Set-El $e $pass) { $script:pwFills++; $script:pwFilledAt = Get-Date; $filled = $true; Log 'filled password field' }
                }
            } elseif ($c.AutomationId -match 'i0116|loginfmt|email|user' -or $c.Name -match 'email|phone|user|ผู้ใช้|อีเมล') {
                if (-not $val -and $user) { if (Set-El $e $user) { $filled = $true; Log 'filled user field' } }
            }
        }
        # press the primary button (Next / Sign in / Yes / Accept / Connect) at most every 5 s per label
        foreach ($b in $buttons) {
            $c = $b.Current
            $label = "$($c.AutomationId)|$($c.Name)"
            if ($c.AutomationId -eq 'idSIButton9' -or $c.Name -match '^(Next|Sign in|Yes|Accept|Continue|Connect|OK|Verify|ถัดไป|ลงชื่อเข้าใช้|ใช่|ยอมรับ|เชื่อมต่อ)$') {
                if ($c.Name -match '^(No|Cancel|Back|ไม่|ยกเลิก)$') { continue }
                $last = $script:done[$label]
                if ($filled -or -not $last -or ((Get-Date) - $last).TotalSeconds -gt 5) {
                    if (Invoke-El $b) { $script:done[$label] = Get-Date; Log "pressed '$($c.Name)'" }
                }
            }
        }
    }
    return @{}
}

function Dump-Ui {
    try {
        $lines = @()
        foreach ($w in (Get-LoginElements)) {
            $lines += "WINDOW '$($w.Current.Name)' class=$($w.Current.ClassName)"
            foreach ($e in $w.FindAll($TS::Descendants, $AnyCond)) {
                $c = $e.Current; $n = [string]$c.Name; if ($c.IsPassword) { $n = '<password>' }
                if ($n.Length -gt 60) { $n = $n.Substring(0, 60) }
                $lines += "  $($c.ControlType.ProgrammaticName.Replace('ControlType.','')) '$n' id=$($c.AutomationId)"
            }
        }
        $lines | Set-Content -LiteralPath (Join-Path $ConfigDir 'vpn-ui-dump.txt') -Encoding UTF8
    } catch { }
}

# ---------- main loop ----------
$sw = [Diagnostics.Stopwatch]::StartNew()
$guiClosed = $false
$result = 'timeout'
try {
    Start-Cli
    while ($sw.Elapsed.TotalSeconds -lt $TimeoutSec) {
        $out = Read-Cli
        if ($out) {
            [void]$script:cliOut.Append($out)
            foreach ($l in ($out -split "`r?`n")) { if ($l.Trim()) { Log ("cli: " + ($l.Trim() -replace '[a-z0-9-]+(\.[a-z0-9-]+)+', '<host>')) } }
            if ($out -match 'Username:\s*(\[.*\])?\s*$') { Send-Cli $user }
            if ($out -match 'Password:\s*$') {
                if ($script:cliPwSent) { $result = 'password asked again (wrong password) - stopped to avoid account lockout'; break }
                Send-Cli $pass; $script:cliPwSent = $true
            }
            if ($out -match 'accept\?\s*\[y/n\]|\[y/n\]:\s*$') { Send-Cli 'y' }
            if ($out -match 'another .*application is running|Connect not available|Connect capability is unavailable|application acquired it' -and -not $guiClosed) {
                Log 'GUI blocks vpncli: closing GUI and retrying'
                Get-Process csc_ui -ErrorAction SilentlyContinue | Stop-Process -Force
                $guiClosed = $true
                try { $script:cli.Kill() } catch { }
                Start-Sleep -Seconds 2
                Start-Cli
            }
            if ($out -match 'Login failed|authentication failed|Login denied') { $result = 'login failed'; break }
        }
        $r = Step-Login
        if ($r.failed) { $result = $r.failed; break }
        if (Test-VpnUp) { $result = 'connected'; break }
        Start-Sleep -Milliseconds 700
    }
} catch {
    $result = 'error: ' + $_.Exception.Message
} finally {
    $pass = $null
    if ($script:cli -and -not $script:cli.HasExited) { Send-Cli 'exit'; Start-Sleep -Milliseconds 500; try { if (-not $script:cli.HasExited) { $script:cli.Kill() } } catch { } }
    if ($guiClosed -and (Test-Path $gui)) { Start-Process $gui }
}

if ($result -eq 'connected') { Report 'connected' }
else {
    Dump-Ui
    Report 'failed' $null $result
}
