param(
    [string]$BaseUrl = "http://127.0.0.1:5000",
    [switch]$EnableMutations,
    [int]$TimeoutSeconds = 20
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
        [string]$Method,
        [object]$Body = $null,
        [int[]]$AllowedStatusCodes = @(200)
    )

    $headers = @{ "Content-Type" = "application/json" }
    $jsonBody = $null
    if ($null -ne $Body) {
        $jsonBody = $Body | ConvertTo-Json -Depth 20
    }

    try {
        $response = Invoke-WebRequest `
            -Uri "$BaseUrl$Path" `
            -Method $Method `
            -Headers $headers `
            -Body $jsonBody `
            -UseBasicParsing `
            -TimeoutSec $TimeoutSeconds
    }
    catch {
        if ($_.Exception.Response -ne $null) {
            $statusCode = [int]$_.Exception.Response.StatusCode
            $responseBody = ""
            $stream = $_.Exception.Response.GetResponseStream()
            if ($stream) {
                $reader = New-Object System.IO.StreamReader($stream)
                $responseBody = $reader.ReadToEnd()
            }
            throw "$Method $Path returned HTTP $statusCode. Expected: $($AllowedStatusCodes -join ', '). Body: $responseBody"
        }

        throw "$Method $Path failed: $($_.Exception.Message)"
    }

    Assert-Condition ($AllowedStatusCodes -contains $response.StatusCode) "$Method $Path returned HTTP $($response.StatusCode). Expected: $($AllowedStatusCodes -join ', ')"

    $json = $null
    if (-not [string]::IsNullOrWhiteSpace($response.Content)) {
        $json = $response.Content | ConvertFrom-Json
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
    Assert-Condition ($null -ne $Object.PSObject.Properties[$PropertyName]) "$Context missing JSON property '$PropertyName'."
}

if (-not $EnableMutations) {
    Write-Step "Mutation flows are disabled"
    Write-Host "This script intentionally does not change dev data unless -EnableMutations is passed." -ForegroundColor Yellow
    Write-Host "When enabled, it registers a clearly named PreQC agent and sends heartbeat, model sync, and log sync payloads." -ForegroundColor Yellow
    exit 0
}

$runId = (Get-Date).ToString("yyyyMMddHHmmss")
$lineNumber = 999
$mcNumber = [int]("1" + (Get-Random -Minimum 100 -Maximum 999))
$ipAddress = "10.250.$([int](Get-Random -Minimum 1 -Maximum 240)).$([int](Get-Random -Minimum 1 -Maximum 240))"
$modelName = "PreQC_Model_$runId"

Write-Step "Registering fake Pre-QC agent"
$registerBody = @{
    lineNumber = $lineNumber
    mcNumber = $mcNumber
    ipAddress = $ipAddress
    configFilePath = "C:\PreQC\config.ini"
    logFolderPath = "C:\PreQC\Logs"
    modelFolderPath = "C:\PreQC\Models"
    generationNo = "PreQC-$runId"
    currentModelName = $modelName
    currentModelPath = "C:\PreQC\Models\$modelName"
    configContent = "[PreQC]`nEnabled=true"
    logStructureJson = "[]"
    models = @(
        @{
            modelName = $modelName
            modelPath = "C:\PreQC\Models\$modelName"
            isCurrent = $true
        }
    )
}

$register = Invoke-ApiJson -Path "/api/agent/register" -Method "POST" -Body $registerBody
Assert-HasProperty -Object $register.Json -PropertyName "success" -Context "Agent register"
Assert-HasProperty -Object $register.Json -PropertyName "mcId" -Context "Agent register"
Assert-Condition ([bool]$register.Json.success) "Agent register response did not report success."
$mcId = [int]$register.Json.mcId
Write-Host "Registered Pre-QC agent MCId=$mcId Line=$lineNumber MC=$mcNumber IP=$ipAddress" -ForegroundColor Green

Write-Step "Sending heartbeat"
$heartbeatBody = @{
    mcId = $mcId
    isApplicationRunning = $true
    appVersion = "pre-qc"
    agentVersion = "pre-qc"
    currentModelName = $modelName
}
$heartbeat = Invoke-ApiJson -Path "/api/agent/heartbeat" -Method "POST" -Body $heartbeatBody
Assert-HasProperty -Object $heartbeat.Json -PropertyName "success" -Context "Heartbeat"
Write-Host "Heartbeat OK" -ForegroundColor Green

Write-Step "Sending model sync"
$syncModelsBody = @{
    mcId = $mcId
    models = @(
        @{
            modelName = $modelName
            modelPath = "C:\PreQC\Models\$modelName"
            isCurrent = $true
        }
    )
}
$syncModels = Invoke-ApiJson -Path "/api/agent/syncmodels" -Method "POST" -Body $syncModelsBody
Assert-HasProperty -Object $syncModels.Json -PropertyName "success" -Context "Model sync"
Write-Host "Model sync OK" -ForegroundColor Green

Write-Step "Sending log structure sync"
$syncLogsBody = @{
    mcId = $mcId
    logStructureJson = "[{`"name`":`"PreQC`",`"type`":`"folder`",`"children`":[]}]"
}
$syncLogs = Invoke-ApiJson -Path "/api/agent/synclogs" -Method "POST" -Body $syncLogsBody
Assert-HasProperty -Object $syncLogs.Json -PropertyName "success" -Context "Log sync"
Write-Host "Log sync OK" -ForegroundColor Green

Write-Step "Verifying registered agent is readable"
$details = Invoke-ApiJson -Path "/api/Api/pc/$mcId" -Method "GET"
Assert-HasProperty -Object $details.Json -PropertyName "mcId" -Context "PC details"
Write-Host "PC details OK for test MC $mcId" -ForegroundColor Green

Write-Step "Pre-QC mutation flow passed"
Write-Host "Created dev/test MCId: $mcId" -ForegroundColor Green
Write-Host "This test intentionally leaves the Pre-QC agent row in the dev DB for inspection." -ForegroundColor Yellow
