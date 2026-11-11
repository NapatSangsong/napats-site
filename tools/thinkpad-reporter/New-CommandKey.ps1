<#
.SYNOPSIS
  Create the ThinkPad's RSA key for remote commands and print its PUBLIC key (JWK).

.DESCRIPTION
  The worker encrypts a "vpn" command (VPN username/password sent from LINE)
  with this public key the moment it arrives, so the queue in KV only ever
  holds ciphertext. The private key is a persisted, non-exportable CNG key in
  the current user's key store (protected by DPAPI); only this Windows user
  on this machine can decrypt.

    npx wrangler secret put THINKPAD_CMD_PUBLIC_JWK   (paste the JSON line)

  -Force replaces an existing key (old queued commands become unreadable).
#>
[CmdletBinding()]
param(
    [string]$KeyName = 'napats-status-cmd',
    [switch]$Force
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Core

if ([System.Security.Cryptography.CngKey]::Exists($KeyName)) {
    if (-not $Force) {
        $key = [System.Security.Cryptography.CngKey]::Open($KeyName)
    } else {
        [System.Security.Cryptography.CngKey]::Open($KeyName).Delete()
        $key = $null
    }
}
if (-not $key) {
    $p = New-Object System.Security.Cryptography.CngKeyCreationParameters
    $p.ExportPolicy = [System.Security.Cryptography.CngExportPolicies]::None
    $p.KeyUsage = [System.Security.Cryptography.CngKeyUsages]::Decryption
    $p.Parameters.Add((New-Object System.Security.Cryptography.CngProperty('Length', [BitConverter]::GetBytes(2048), [System.Security.Cryptography.CngPropertyOptions]::None)))
    $key = [System.Security.Cryptography.CngKey]::Create([System.Security.Cryptography.CngAlgorithm]::Rsa, $KeyName, $p)
}

$rsa = New-Object System.Security.Cryptography.RSACng($key)
$pub = $rsa.ExportParameters($false)
function B64Url([byte[]]$b) { [Convert]::ToBase64String($b).TrimEnd('=').Replace('+', '-').Replace('/', '_') }
$jwk = [ordered]@{ kty = 'RSA'; n = (B64Url $pub.Modulus); e = (B64Url $pub.Exponent); alg = 'RSA-OAEP-256'; ext = $true; key_ops = @('encrypt') }
Write-Host "THINKPAD_CMD_PUBLIC_JWK=$($jwk | ConvertTo-Json -Compress)"
