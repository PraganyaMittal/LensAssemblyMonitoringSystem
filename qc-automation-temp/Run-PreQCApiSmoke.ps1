param(
    [string]$BaseUrl = "http://127.0.0.1:5000",
    [int]$TimeoutSeconds = 45
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "== $Message ==" -ForegroundColor Cyan
}

function Assert-Condition {
    param(
        [bool]$Condition,
        [string]$Message
    )

    if (-not $Condition) {
        throw $Message
    }
}

function Invoke-ApiJson {
    param(
        [string]$Path,
        [int[]]$AllowedStatusCodes = @(200)
    )

    $uri = "$BaseUrl$Path"
    try {
        $response = Invoke-WebRequest -Uri $uri -Method GET -UseBasicParsing -TimeoutSec $TimeoutSeconds
    }
    catch {
        if ($_.Exception.Response -ne $null) {
            $statusCode = [int]$_.Exception.Response.StatusCode
            if ($AllowedStatusCodes -contains $statusCode) {
                return @{
                    StatusCode = $statusCode
                    Json = $null
                    Raw = $null
                }
            }
        }

        throw "GET $Path failed: $($_.Exception.Message)"
    }

    Assert-Condition ($AllowedStatusCodes -contains $response.StatusCode) "GET $Path returned HTTP $($response.StatusCode). Expected: $($AllowedStatusCodes -join ', ')"

    $json = $null
    if (-not [string]::IsNullOrWhiteSpace($response.Content)) {
        try {
            $json = $response.Content | ConvertFrom-Json
        }
        catch {
            throw "GET $Path returned non-JSON content: $($_.Exception.Message)"
        }
    }

    return @{
        StatusCode = $response.StatusCode
        Json = $json
        Raw = $response.Content
    }
}

function Assert-HasProperty {
    param(
        [object]$Object,
        [string]$PropertyName,
        [string]$Context
    )

    Assert-Condition ($null -ne $Object) "$Context returned null JSON."
    $property = $Object.PSObject.Properties[$PropertyName]
    Assert-Condition ($null -ne $property) "$Context missing JSON property '$PropertyName'."
}

function Assert-IsArrayLike {
    param(
        [object]$Value,
        [string]$Context
    )

    Assert-Condition ($null -ne $Value) "$Context returned null JSON."
    Assert-Condition ($Value -is [System.Array] -or $Value -is [System.Collections.IEnumerable]) "$Context did not return an array-like JSON value."
}

Write-Step "Checking API is reachable"
$swagger = Invoke-ApiJson -Path "/swagger/v1/swagger.json"
Assert-HasProperty -Object $swagger.Json -PropertyName "paths" -Context "Swagger JSON"
Write-Host "Swagger JSON reachable" -ForegroundColor Green

Write-Step "Checking dashboard/read APIs"
$versions = Invoke-ApiJson -Path "/api/Api/versions"
Assert-IsArrayLike -Value @($versions.Json) -Context "Versions"
Write-Host "Versions OK" -ForegroundColor Green

$lines = Invoke-ApiJson -Path "/api/Api/lines"
Assert-IsArrayLike -Value @($lines.Json) -Context "Lines"
Write-Host "Lines OK" -ForegroundColor Green

$pcs = Invoke-ApiJson -Path "/api/Api/pcs"
Assert-HasProperty -Object $pcs.Json -PropertyName "total" -Context "PC list"
Assert-HasProperty -Object $pcs.Json -PropertyName "online" -Context "PC list"
Assert-HasProperty -Object $pcs.Json -PropertyName "offline" -Context "PC list"
Assert-HasProperty -Object $pcs.Json -PropertyName "lines" -Context "PC list"
Write-Host "PC list OK" -ForegroundColor Green

$stats = Invoke-ApiJson -Path "/api/Api/stats"
Assert-HasProperty -Object $stats.Json -PropertyName "totalPCs" -Context "Network stats"
Assert-HasProperty -Object $stats.Json -PropertyName "onlinePCs" -Context "Network stats"
Assert-HasProperty -Object $stats.Json -PropertyName "offlinePCs" -Context "Network stats"
Assert-HasProperty -Object $stats.Json -PropertyName "runningApps" -Context "Network stats"
Write-Host "Network stats OK" -ForegroundColor Green

Write-Step "Checking software update read APIs"
$packages = Invoke-ApiJson -Path "/api/Updates/packages"
Assert-HasProperty -Object $packages.Json -PropertyName "packages" -Context "Update packages"
Assert-HasProperty -Object $packages.Json -PropertyName "totalCount" -Context "Update packages"
Assert-HasProperty -Object $packages.Json -PropertyName "page" -Context "Update packages"
Assert-HasProperty -Object $packages.Json -PropertyName "pageSize" -Context "Update packages"
Write-Host "Update packages OK" -ForegroundColor Green

$schedules = Invoke-ApiJson -Path "/api/Updates/schedules"
Assert-HasProperty -Object $schedules.Json -PropertyName "schedules" -Context "Update schedules"
Assert-HasProperty -Object $schedules.Json -PropertyName "totalCount" -Context "Update schedules"
Assert-HasProperty -Object $schedules.Json -PropertyName "page" -Context "Update schedules"
Assert-HasProperty -Object $schedules.Json -PropertyName "pageSize" -Context "Update schedules"
Write-Host "Update schedules OK" -ForegroundColor Green

$archived = Invoke-ApiJson -Path "/api/Updates/packages/archived"
Assert-HasProperty -Object $archived.Json -PropertyName "packages" -Context "Archived packages"
Assert-HasProperty -Object $archived.Json -PropertyName "retentionDays" -Context "Archived packages"
Write-Host "Archived packages OK" -ForegroundColor Green

Write-Step "Checking model/yield/shift read APIs"
$modelLibrary = Invoke-ApiJson -Path "/api/ModelLibrary"
Assert-IsArrayLike -Value @($modelLibrary.Json) -Context "Model library"
Write-Host "Model library OK" -ForegroundColor Green

$yieldSummary = Invoke-ApiJson -Path "/api/Yield/summary"
Assert-Condition ($null -ne $yieldSummary.Json) "Yield summary returned null JSON."
Write-Host "Yield summary OK" -ForegroundColor Green

$yieldSettings = Invoke-ApiJson -Path "/api/YieldAlert/settings"
Assert-Condition ($null -ne $yieldSettings.Json) "Yield alert settings returned null JSON."
Write-Host "Yield alert settings OK" -ForegroundColor Green

$activeAlerts = Invoke-ApiJson -Path "/api/YieldAlert/active"
Assert-IsArrayLike -Value @($activeAlerts.Json) -Context "Active yield alerts"
Write-Host "Active yield alerts OK" -ForegroundColor Green

$currentShift = Invoke-ApiJson -Path "/api/Shift/current"
Assert-Condition ($null -ne $currentShift.Json) "Current shift returned null JSON."
Write-Host "Current shift OK" -ForegroundColor Green

$shiftDate = (Get-Date).ToString("yyyy-MM-dd")
$shiftSummary = Invoke-ApiJson -Path "/api/Shift/summary?date=$shiftDate"
Assert-Condition ($null -ne $shiftSummary.Json) "Shift summary returned null JSON."
Write-Host "Shift summary OK" -ForegroundColor Green

Write-Step "Checking first available PC-dependent flows"
$pcRows = @()
foreach ($line in @($pcs.Json.lines)) {
    if ($null -ne $line.pcs) {
        $pcRows += @($line.pcs)
    }
}

if ($pcRows.Count -eq 0) {
    Write-Host "Skipped PC detail and log analyzer structure because no PCs exist in the dev DB." -ForegroundColor Yellow
}
else {
    $firstPc = $pcRows[0]
    $mcId = $firstPc.mcId
    Assert-Condition ($null -ne $mcId) "First PC row did not include mcId."

    $pcDetails = Invoke-ApiJson -Path "/api/Api/pc/$mcId"
    Assert-HasProperty -Object $pcDetails.Json -PropertyName "mcId" -Context "PC details"
    Assert-HasProperty -Object $pcDetails.Json -PropertyName "lineNumber" -Context "PC details"
    Assert-HasProperty -Object $pcDetails.Json -PropertyName "mcNumber" -Context "PC details"
    Write-Host "PC details OK for MC $mcId" -ForegroundColor Green

    $logStructure = Invoke-ApiJson -Path "/api/LogAnalyzer/structure/$mcId"
    Assert-Condition ($null -ne $logStructure.Json) "Log analyzer structure returned null JSON for MC $mcId."
    Write-Host "Log analyzer structure OK for MC $mcId" -ForegroundColor Green
}

Write-Step "Pre-QC read-only API smoke test passed"
Write-Host "Base URL: $BaseUrl" -ForegroundColor Green
