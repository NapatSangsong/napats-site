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
    3. drive the Cisco Secure Client GUI (vpncli cannot do the gateway's SAML
       login): dismiss a leftover gateway prompt, put the profile's default
       host in the address box, press Connect
    4. watch the SSO login window (WebView2, only inside the Cisco process
       tree) with UI Automation: fill email/password ONCE, press Next /
       Sign in / Yes, and send the number shown for Microsoft Authenticator
       number matching to LINE; accept the Cisco banner
    5. report connected / failed. Gives up after 5 minutes.
  The password is never written to disk or to the log. Local log:
  %LOCALAPPDATA%\napats-status\vpn-connect.log (stages + UI element names only).
#>
[CmdletBinding()]
param(
    [string]$ConfigDir = (Join-Path $env:LOCALAPPDATA 'napats-status'),
    [int]$TimeoutSec = 300,
    # diagnostics: press Connect in the GUI, dump the login window it opens
    # (element names only), then close the GUI again. No command, no
    # credentials, nothing is sent to LINE.
    [switch]$ProbeOnly
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
    if ($ProbeOnly) { return }
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
if ($ProbeOnly) { $script:cmdId = 'probe'; $user = ''; $pass = '' } else {
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
}

# ---------- 3) Cisco GUI ----------
$cscDir = "${env:ProgramFiles(x86)}\Cisco\Cisco Secure Client"
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

# vpncli cannot do it: the gateway uses SAML ("The requested authentication
# type is not supported in AnyConnect CLI", 2026-11-12), so the GUI is driven
# instead. Its window is a classic Win32 dialog whose controls expose no UIA
# patterns, so they are driven with window messages (WM_SETTEXT / BM_CLICK).
Add-Type -Namespace NapatsVpn -Name W32 -MemberDefinition @'
[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr h, int msg, IntPtr w, string l);
[DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, int msg, IntPtr w, IntPtr l);
'@
$WM_SETTEXT = 0x000C; $BM_CLICK = 0x00F5

function Get-CiscoControls {
    # every control of every Cisco-owned top window: @{ h; cls; name; id; en; top }
    $out = @()
    foreach ($w in (Get-LoginElements)) {
        $top = [string]$w.Current.Name
        foreach ($e in @($w) + @($w.FindAll($TS::Descendants, $AnyCond))) {
            try {
                $c = $e.Current
                if ($c.NativeWindowHandle -eq 0) { continue }
                $out += ,@{ h = [IntPtr]$c.NativeWindowHandle; cls = [string]$c.ClassName; name = [string]$c.Name; id = [string]$c.AutomationId; en = $c.IsEnabled; top = $top }
            } catch { }
        }
    }
    return $out
}
function Click-Win32($ctl) { [void][NapatsVpn.W32]::PostMessage($ctl.h, $BM_CLICK, [IntPtr]::Zero, [IntPtr]::Zero) }

function Start-GuiConnect {
    if (-not (Get-Process csc_ui -ErrorAction SilentlyContinue)) { Start-Process $gui; Log 'started Cisco GUI'; Start-Sleep -Seconds 3 }
    $deadline = (Get-Date).AddSeconds(40)
    $restartAt = (Get-Date).AddSeconds(5)
    $restarted = $false
    while ((Get-Date) -lt $deadline) {
        $ctls = Get-CiscoControls
        # after a connect the GUI sits hidden in the tray (no window to drive):
        # restart it once so its main window opens again
        if (-not $restarted -and (Get-Date) -gt $restartAt -and -not ($ctls | Where-Object { $_.id -eq '1314' })) {
            Get-Process csc_ui -ErrorAction SilentlyContinue | Stop-Process -Force
            Start-Sleep -Seconds 2
            Start-Process $gui
            $restarted = $true
            Log 'GUI window hidden: restarted the GUI'
            Start-Sleep -Seconds 3
            continue
        }
        # leftover "Please enter a secure gateway to connect to." box -> OK
        if ($ctls | Where-Object { $_.name -match 'enter a secure gateway' }) {
            $ok = $ctls | Where-Object { $_.cls -eq 'Button' -and $_.name -eq 'OK' -and $_.en } | Select-Object -First 1
            if ($ok) { Click-Win32 $ok; Log 'dismissed gateway prompt'; Start-Sleep -Seconds 1; continue }
        }
        $combo = $ctls | Where-Object { $_.cls -eq 'ComboBox' -and $_.id -eq '1203' -and $_.en } | Select-Object -First 1
        $btn = $ctls | Where-Object { $_.cls -eq 'Button' -and $_.id -eq '1314' -and $_.en } | Select-Object -First 1
        if ($btn -and $btn.name -match 'Disconnect') { return 'busy' }
        if ($combo -and $btn -and $btn.name -eq 'Connect') {
            [void][NapatsVpn.W32]::SendMessage($combo.h, $WM_SETTEXT, [IntPtr]::Zero, $vpnHost)
            Start-Sleep -Milliseconds 400
            Click-Win32 $btn
            Log 'GUI connect pressed'
            return 'pressed'
        }
        Start-Sleep -Milliseconds 700
    }
    return 'no window'
}

# ---------- 4) SSO window via UI Automation ----------
$A = [System.Windows.Automation.AutomationElement]
$TS = [System.Windows.Automation.TreeScope]
$AnyCond = [System.Windows.Automation.Condition]::TrueCondition
$script:done = @{}
$script:lastNumber = ''
$script:pwFills = 0
$script:pwFilledAt = $null

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
            # the element's name can carry the instructions too ("Open your Authenticator
            # app and approve the request. ... 48") -> keep only the 2-3 digit number
            if (($id -eq 'idRichContext_DisplaySign' -or $id -match 'DisplaySign|displaySign') -and $name -match '(?<!\d)(\d{2,3})\D*$') { $number = $matches[1] }
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
        # press the primary button (Next / Sign in / Yes) at most every 5 s per label
        foreach ($b in $buttons) {
            $c = $b.Current
            $label = "$($c.AutomationId)|$($c.Name)"
            if ($c.AutomationId -eq 'idSIButton9' -or $c.Name -match '^(Next|Sign in|Yes|Continue|Verify|ถัดไป|ลงชื่อเข้าใช้|ใช่)$') {
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
$result = 'timeout'
if ($ProbeOnly) {
    $g = Start-GuiConnect
    Log "probe: GUI $g"
    for ($i = 0; $i -lt 8; $i++) {
        Start-Sleep -Seconds 3
        foreach ($w in $A::RootElement.FindAll($TS::Children, $AnyCond)) {
            try {
                $c = $w.Current; $pn = (Get-Process -Id $c.ProcessId -ErrorAction Stop).ProcessName
                if ($pn -match 'csc|vpn|cisco|acweb|webview') { Log ("probe t+{0}s: '{1}' proc={2} owned={3}" -f (3 * ($i + 1)), ($c.Name -replace '[a-z0-9-]+(\.[a-z0-9-]+){2,}', '<host>'), $pn, (Test-CiscoOwned $c.ProcessId)) }
            } catch { }
        }
        $st = Get-CiscoControls | Where-Object { $_.id -eq '1212' } | Select-Object -First 1
        if ($st) { Log ("probe status: " + ($st.name -replace '[a-z0-9-]+(\.[a-z0-9-]+){2,}', '<host>')) }
    }
    Dump-Ui
    Get-Process csc_ui -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Seconds 2
    Start-Process $gui
    Log 'probe: done, GUI restarted'
    exit 0
}
try {
    $g = Start-GuiConnect
    if ($g -eq 'no window') { $result = 'Cisco window not found or not ready' }
    else {
        if ($g -eq 'busy') { Log 'GUI already connecting' }
        while ($sw.Elapsed.TotalSeconds -lt $TimeoutSec) {
            $r = Step-Login
            if ($r.failed) { $result = $r.failed; break }
            $ctls = Get-CiscoControls
            # banner after login -> Accept
            $acc = $ctls | Where-Object { $_.cls -eq 'Button' -and $_.name -match '^(Accept|ยอมรับ)$' -and $_.en } | Select-Object -First 1
            if ($acc -and -not $script:done['banner']) { Click-Win32 $acc; $script:done['banner'] = Get-Date; Log 'accepted banner' }
            # Cisco reports a failure in its own window
            $bad = $ctls | Where-Object { $_.cls -eq 'Static' -and $_.name -match 'Login failed|Login denied|authentication failed|Connection attempt has failed' } | Select-Object -First 1
            if ($bad) { $result = 'Cisco says: ' + $bad.name; break }
            if (Test-VpnUp) { $result = 'connected'; break }
            Start-Sleep -Milliseconds 700
        }
    }
} catch {
    $result = 'error: ' + $_.Exception.Message
} finally {
    $pass = $null
}

if ($result -eq 'connected') { Report 'connected' }
else {
    Dump-Ui
    Report 'failed' $null $result
}
