<#
.SYNOPSIS
  Heartbeat reporter for https://ai.napats.dev/thinkpad (runs every minute from Task Scheduler).

.DESCRIPTION
  READ-ONLY. It never connects/disconnects the VPN, never calls vpncli, never
  enables/disables an adapter and never touches routes or DNS. It only reads:
  uptime, power/battery, sleep-on-AC (powercfg /query), the Cisco adapter state,
  and whether each target in config.json resolves / accepts TCP / answers HTTPS.

  Host names live only in %LOCALAPPDATA%\napats-status\config.json on this
  machine. The payload carries labels, booleans, latencies and HTTP status codes
  - never a host name or IP (the server rejects anything else).

.PARAMETER DryRun
  Print the JSON payload and exit; nothing is sent and no token is read.
#>
[CmdletBinding()]
param(
    [string]$ConfigDir = (Join-Path $env:LOCALAPPDATA 'napats-status'),
    [switch]$DryRun,
    [string]$Endpoint
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2

$DnsTcpBudgetMs = 3500   # DNS + TCP must finish within this
$TotalBudgetMs  = 6500   # HTTPS checks must finish within this (one target is ~4 s)
$SendTimeoutS   = 10

$logPath = Join-Path $ConfigDir 'reporter.log'
function Write-Log([string]$msg) {
    try {
        $line = '{0} {1}' -f (Get-Date -Format 's'), $msg
        Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
        if ((Get-Item -LiteralPath $logPath).Length -gt 256KB) {
            $keep = Get-Content -LiteralPath $logPath -Tail 1000
            Set-Content -LiteralPath $logPath -Value $keep -Encoding UTF8
        }
    } catch { }
}

function Test-TaskOk($task) {
    return ($null -ne $task) -and $task.IsCompleted -and (-not $task.IsFaulted) -and (-not $task.IsCanceled)
}

function Get-AcIndexSeconds([string]$sub, [string]$setting) {
    # powercfg /query is read-only; returns the AC value in seconds (0 = Never)
    try {
        $out = (& powercfg.exe /query SCHEME_CURRENT $sub $setting 2>$null) -join "`n"
        $m = [regex]::Match($out, 'Current AC Power Setting Index:\s*0x([0-9a-fA-F]+)')
        if ($m.Success) { return [int][Convert]::ToInt64($m.Groups[1].Value, 16) }
    } catch { }
    return $null
}

function Read-Token {
    $path = Join-Path $ConfigDir 'token.dpapi'
    if (-not (Test-Path -LiteralPath $path)) { throw "token.dpapi not found - run Set-Token.ps1" }
    # DPAPI, CurrentUser scope: only this Windows user on this machine can decrypt
    $secure = (Get-Content -LiteralPath $path -Raw).Trim() | ConvertTo-SecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

# One run at a time even if started by hand while the task runs.
$mutex = New-Object System.Threading.Mutex($false, 'Local\napats-status-reporter')
if (-not $mutex.WaitOne(0)) { exit 0 }

$http = $null
$checks = @()
try {
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $cfg = Get-Content -LiteralPath (Join-Path $ConfigDir 'config.json') -Raw | ConvertFrom-Json
    if (-not $Endpoint) { $Endpoint = [string]$cfg.endpoint }
    $adapterMatch = 'Cisco|AnyConnect'
    if ($cfg.PSObject.Properties.Name -contains 'vpn_adapter_match' -and $cfg.vpn_adapter_match) { $adapterMatch = [string]$cfg.vpn_adapter_match }

    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Add-Type -AssemblyName System.Net.Http

    # ---- 1) start every network check at once ----
    $handler = New-Object System.Net.Http.HttpClientHandler
    $handler.AllowAutoRedirect = $false
    $http = New-Object System.Net.Http.HttpClient($handler)
    $http.Timeout = [TimeSpan]::FromMilliseconds($TotalBudgetMs)

    foreach ($t in @($cfg.targets)) {
        $c = [pscustomobject]@{
            label = [string]$t.label; kind = [string]$t.kind; expect = @()
            dns = $null; tcp = $null; tcpClient = $null; web = $null
            dnsMs = $null; tcpMs = $null; webMs = $null
        }
        if ($t.PSObject.Properties.Name -contains 'expect_status') { $c.expect = @($t.expect_status | ForEach-Object { [int]$_ }) }
        try { $c.dns = [Net.Dns]::GetHostAddressesAsync([string]$t.host) } catch { }
        try {
            $c.tcpClient = New-Object Net.Sockets.TcpClient
            $c.tcp = $c.tcpClient.ConnectAsync([string]$t.host, [int]$t.port)
        } catch { }
        if ($c.kind -eq 'https') {
            try { $c.web = $http.GetAsync([string]$t.url, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead) } catch { }
        }
        $checks += $c
    }

    # ---- 2) watch them finish (25 ms resolution) until done or out of budget ----
    $t0 = $sw.ElapsedMilliseconds
    while ($true) {
        $elapsed = $sw.ElapsedMilliseconds - $t0
        $pending = $false
        foreach ($c in $checks) {
            if ($null -eq $c.dnsMs -and $null -ne $c.dns -and $c.dns.IsCompleted) { $c.dnsMs = $elapsed }
            if ($null -eq $c.tcpMs -and $null -ne $c.tcp -and $c.tcp.IsCompleted) { $c.tcpMs = $elapsed }
            if ($null -eq $c.webMs -and $null -ne $c.web -and $c.web.IsCompleted) { $c.webMs = $elapsed }
            if ($elapsed -lt $DnsTcpBudgetMs) {
                if (($null -ne $c.dns -and $null -eq $c.dnsMs) -or ($null -ne $c.tcp -and $null -eq $c.tcpMs)) { $pending = $true }
            }
            if ($null -ne $c.web -and $null -eq $c.webMs) { $pending = $true }
        }
        if (-not $pending -or $elapsed -ge $TotalBudgetMs) { break }
        Start-Sleep -Milliseconds 25
    }

    $results = @()
    foreach ($c in $checks) {
        $dnsOk = (Test-TaskOk $c.dns) -and (@($c.dns.Result).Count -gt 0)
        $tcpOk = (Test-TaskOk $c.tcp) -and $c.tcpClient.Connected
        $status = $null
        if (Test-TaskOk $c.web) { $status = [int]$c.web.Result.StatusCode; $c.web.Result.Dispose() }
        if ($c.kind -eq 'https') {
            $ok = ($null -ne $status) -and (($c.expect.Count -eq 0) -or ($c.expect -contains $status))
            $lat = if ($null -ne $status) { [int]$c.webMs } else { $null }
        } else {
            $ok = $tcpOk
            $lat = if ($tcpOk) { [int]$c.tcpMs } else { $null }
        }
        $results += [ordered]@{
            label = $c.label; kind = $c.kind; ok = [bool]$ok; dns_ok = [bool]$dnsOk; tcp_ok = [bool]$tcpOk
            latency_ms = $lat; http_status = $status
        }
        if ($null -ne $c.tcpClient) { $c.tcpClient.Dispose() }
    }

    # ---- 3) local state (read-only) ----
    $os = Get-CimInstance Win32_OperatingSystem -OperationTimeoutSec 5
    $uptime = [int][Math]::Max(0, ((Get-Date) - $os.LastBootUpTime).TotalSeconds)

    $bat = @(Get-CimInstance Win32_Battery -OperationTimeoutSec 5 -ErrorAction SilentlyContinue)
    $onAc = $null
    try {
        Add-Type -AssemblyName System.Windows.Forms
        $line = [System.Windows.Forms.SystemInformation]::PowerStatus.PowerLineStatus
        if ($line -eq 'Online') { $onAc = $true } elseif ($line -eq 'Offline') { $onAc = $false }
    } catch { }

    $adapters = @(Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.InterfaceDescription -match $adapterMatch })
    $upAdapter = @($adapters | Where-Object { $_.Status -eq 'Up' }) | Select-Object -First 1
    $hasIpv4 = $false
    if ($upAdapter) {
        $hasIpv4 = @(Get-NetIPAddress -InterfaceIndex $upAdapter.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object { $_.AddressState -eq 'Preferred' }).Count -gt 0
    }

    # Windows Update restart state (registry, read-only)
    $wu = $null
    try {
        $rebootReq = (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired') -or
                     (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending')
        $ah = $null
        $ux = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings' -ErrorAction SilentlyContinue
        if ($ux -and ($ux.PSObject.Properties.Name -contains 'ActiveHoursStart') -and ($ux.PSObject.Properties.Name -contains 'ActiveHoursEnd')) {
            $ah = [ordered]@{ start = [int]$ux.ActiveHoursStart; end = [int]$ux.ActiveHoursEnd }
        }
        $wu = [ordered]@{ reboot_required = [bool]$rebootReq; active_hours = $ah }
    } catch { }

    # Wi-Fi link quality (no SSID is sent)
    $wifi = $null
    try {
        $wl = (& netsh.exe wlan show interfaces 2>$null) -join "`n"
        if ($wl -match '(?m)^\s*State\s*:\s*(\S+)') {
            $connected = ($Matches[1] -eq 'connected')
            $sig = $null; $rx = $null
            if ($wl -match '(?m)^\s*Signal\s*:\s*(\d+)%') { $sig = [int]$Matches[1] }
            if ($wl -match '(?m)^\s*Receive rate \(Mbps\)\s*:\s*([\d.]+)') { $rx = [int][double]$Matches[1] }
            $wifi = [ordered]@{ connected = $connected; signal_pct = $sig; rx_mbps = $rx }
        }
    } catch { }

    # machine health (read-only)
    $health = $null
    try {
        $disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$($env:SystemDrive)'" -OperationTimeoutSec 5
        $cpu = @(Get-CimInstance Win32_Processor -OperationTimeoutSec 5 | ForEach-Object { $_.LoadPercentage } | Where-Object { $null -ne $_ })
        $memUsed = $null
        if ($os.TotalVisibleMemorySize -gt 0) { $memUsed = [Math]::Round((1 - $os.FreePhysicalMemory / $os.TotalVisibleMemorySize) * 100, 1) }
        $health = [ordered]@{
            disk_free_gb  = $(if ($disk -and $disk.Size) { [Math]::Round($disk.FreeSpace / 1GB, 1) } else { $null })
            disk_free_pct = $(if ($disk -and $disk.Size) { [Math]::Round($disk.FreeSpace / $disk.Size * 100, 1) } else { $null })
            mem_used_pct  = $memUsed
            cpu_pct       = $(if ($cpu.Count -gt 0) { [Math]::Round(($cpu | Measure-Object -Average).Average, 1) } else { $null })
        }
    } catch { }

    $payload = [ordered]@{
        v           = 1
        reported_at = (Get-Date).ToUniversalTime().ToString('o')
        uptime_s    = $uptime
        power       = [ordered]@{
            on_ac           = $onAc
            battery_present = ($bat.Count -gt 0)
            battery_pct     = $(if ($bat.Count -gt 0) { [int]$bat[0].EstimatedChargeRemaining } else { $null })
            sleep_ac_s      = (Get-AcIndexSeconds 'SUB_SLEEP' 'STANDBYIDLE')
            hibernate_ac_s  = (Get-AcIndexSeconds 'SUB_SLEEP' 'HIBERNATEIDLE')
        }
        vpn         = [ordered]@{
            adapter_found = ($adapters.Count -gt 0)
            up            = [bool]$upAdapter
            has_ipv4      = [bool]$hasIpv4
        }
        checks      = @($results)
        duration_ms = [int]$sw.ElapsedMilliseconds
    }
    if ($null -ne $wu) { $payload['windows_update'] = $wu }
    if ($null -ne $wifi) { $payload['wifi'] = $wifi }
    if ($null -ne $health) { $payload['health'] = $health }
    $json = $payload | ConvertTo-Json -Depth 5 -Compress

    $fails = (@($results | Where-Object { -not $_.ok } | ForEach-Object { $_.label }) -join ',')
    $summary = 'vpn={0} fail=[{1}] {2}ms' -f $(if ($payload.vpn.up -and $hasIpv4) { 'up' } else { 'down' }), $fails, $payload.duration_ms

    if ($DryRun) {
        $json
        Write-Host $summary
        exit 0
    }

    # ---- 4) send ----
    $token = Read-Token
    $send = New-Object System.Net.Http.HttpClient
    $send.Timeout = [TimeSpan]::FromSeconds($SendTimeoutS)
    try {
        $req = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Post, $Endpoint)
        $req.Headers.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue('Bearer', $token)
        $req.Content = New-Object System.Net.Http.StringContent($json, [Text.Encoding]::UTF8, 'application/json')
        $resp = $send.SendAsync($req).GetAwaiter().GetResult()
        $code = [int]$resp.StatusCode
        $body = $resp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        $resp.Dispose()
        if ($code -ge 200 -and $code -lt 300) {
            Write-Log "sent $code $summary"
            # a remote command (encrypted) may ride back on the response -> hand it to the connect task
            try {
                $respObj = $body | ConvertFrom-Json
                if ($respObj.PSObject.Properties.Name -contains 'command' -and $respObj.command) {
                    $c = $respObj.command
                    if ([string]$c.type -eq 'vpn_connect' -and [string]$c.id -match '^[A-Za-z0-9-]{1,40}$') {
                        ($c | ConvertTo-Json -Compress) | Set-Content -LiteralPath (Join-Path $ConfigDir 'pending-command.json') -Encoding ASCII
                        Start-ScheduledTask -TaskName 'napats-vpn-connect'
                        Write-Log "command $($c.id) handed to napats-vpn-connect"
                    }
                }
            } catch { Write-Log ("command hand-off failed: " + $_.Exception.Message) }
        }
        else {
            $short = ($body -replace '\s+', ' ')
            if ($short.Length -gt 200) { $short = $short.Substring(0, 200) }
            Write-Log "server $code $summary $short"; exit 1
        }
    } finally {
        $token = $null
        $send.Dispose()
    }
} catch {
    Write-Log ("error: " + $_.Exception.Message)
    exit 1
} finally {
    foreach ($c in $checks) { if ($null -ne $c.tcpClient) { try { $c.tcpClient.Dispose() } catch { } } }
    if ($null -ne $http) { $http.Dispose() }
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}
