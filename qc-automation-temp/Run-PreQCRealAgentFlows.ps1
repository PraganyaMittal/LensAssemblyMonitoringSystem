param(
    [string]$BaseUrl = "http://127.0.0.1:5000",
    [int]$MCId = 2,
    [switch]$EnableUploads,
    [switch]$EnableLargeFiles,
    [switch]$EnableRealAgentCallbacks,
    [switch]$EnableDeployment,
    [switch]$EnableDestructive,
    [string]$ArtifactRoot = "qc-automation-temp/artifacts",
    [string]$LogFilePath = "",
    [string]$ImagePath = "",
    [string]$DeploymentNetworkPath = "",
    [string]$ShareUsername = "",
    [string]$SharePassword = "",
    [int]$TimeoutSeconds = 60,
    [int]$PollSeconds = 5,
    [int]$CallbackTimeoutSeconds = 90,
    [int]$DeploymentTimeoutSeconds = 900
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.Net.Http

$script:RunId = (Get-Date).ToString("yyyyMMddHHmmss")
$script:Root = [System.IO.Path]::GetFullPath($ArtifactRoot)
$script:RunRoot = Join-Path $script:Root "real-agent-$script:RunId"
$script:EvidenceRoot = Join-Path $script:RunRoot "evidence"
$script:FixtureRoot = Join-Path $script:RunRoot "fixtures"
$script:DownloadRoot = Join-Path $script:RunRoot "downloads"
$script:ResultItems = New-Object System.Collections.Generic.List[object]
$script:CreatedModelIds = New-Object System.Collections.Generic.List[int]
$script:CreatedPackageId = $null
$script:CreatedScheduleId = $null
$script:CreatedRollbackScheduleId = $null
$script:HadFailure = $false

New-Item -ItemType Directory -Force -Path $script:EvidenceRoot, $script:FixtureRoot, $script:DownloadRoot | Out-Null

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

function Add-Result {
    param(
        [string]$Name,
        [string]$Status,
        [string]$Details = ""
    )

    $script:ResultItems.Add([pscustomobject]@{
        Name = $Name
        Status = $Status
        Details = $Details
        Timestamp = (Get-Date).ToString("o")
    }) | Out-Null

    if ($Status -eq "Failed") {
        $script:HadFailure = $true
    }
}

function Save-Text {
    param(
        [string]$Name,
        [string]$Content
    )
    $safe = ($Name -replace '[^A-Za-z0-9_.-]', '_')
    $path = Join-Path $script:EvidenceRoot $safe
    [System.IO.File]::WriteAllText($path, $Content)
    return $path
}

function Save-Json {
    param(
        [string]$Name,
        [object]$Value
    )
    $json = $Value | ConvertTo-Json -Depth 40
    return Save-Text -Name $Name -Content $json
}

function Get-Sha256 {
    param([string]$Path)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $stream = [System.IO.File]::OpenRead($Path)
        try {
            $hash = $sha.ComputeHash($stream)
            return ([System.BitConverter]::ToString($hash)).Replace("-", "").ToLowerInvariant()
        }
        finally {
            $stream.Dispose()
        }
    }
    finally {
        $sha.Dispose()
    }
}

function Invoke-ApiJson {
    param(
        [string]$Name,
        [string]$Path,
        [string]$Method = "GET",
        [object]$Body = $null,
        [int[]]$AllowedStatusCodes = @(200),
        [int]$Timeout = $TimeoutSeconds
    )

    $uri = "$BaseUrl$Path"
    $requestText = ""
    $bodyText = $null
    $headers = @{ "Accept" = "application/json" }
    if ($null -ne $Body) {
        $bodyText = $Body | ConvertTo-Json -Depth 40
        $headers["Content-Type"] = "application/json"
        $requestText = $bodyText
    }
    Save-Json -Name "$Name.request.json" -Value @{ method = $Method; uri = $uri; body = $Body } | Out-Null

    try {
        $response = Invoke-WebRequest -Uri $uri -Method $Method -Headers $headers -Body $bodyText -UseBasicParsing -TimeoutSec $Timeout
        $statusCode = [int]$response.StatusCode
        $content = [string]$response.Content
    }
    catch {
        if ($_.Exception.Response -ne $null) {
            $statusCode = [int]$_.Exception.Response.StatusCode
            $stream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $content = $reader.ReadToEnd()
        }
        else {
            throw "$Method $Path failed before HTTP response: $($_.Exception.Message)"
        }
    }

    Save-Text -Name "$Name.response.txt" -Content $content | Out-Null
    Assert-Condition ($AllowedStatusCodes -contains $statusCode) "$Method $Path returned HTTP $statusCode. Expected: $($AllowedStatusCodes -join ', '). Body: $content"

    $json = $null
    if (-not [string]::IsNullOrWhiteSpace($content)) {
        try {
            $json = $content | ConvertFrom-Json
        }
        catch {
            throw "$Method $Path returned non-JSON response. Body: $content"
        }
    }

    return [pscustomobject]@{
        StatusCode = $statusCode
        Json = $json
        Raw = $content
    }
}

function Invoke-MultipartUpload {
    param(
        [string]$Name,
        [string]$Path,
        [hashtable]$Fields,
        [hashtable]$Files,
        [int[]]$AllowedStatusCodes = @(200),
        [int]$Timeout = $TimeoutSeconds
    )

    $uri = "$BaseUrl$Path"
    Save-Json -Name "$Name.request.json" -Value @{
        method = "POST"
        uri = $uri
        fields = $Fields
        files = $Files
    } | Out-Null

    $client = [System.Net.Http.HttpClient]::new()
    $client.Timeout = [TimeSpan]::FromSeconds($Timeout)
    $content = [System.Net.Http.MultipartFormDataContent]::new()
    $streams = New-Object System.Collections.Generic.List[System.IO.FileStream]

    try {
        foreach ($key in $Fields.Keys) {
            $stringContent = [System.Net.Http.StringContent]::new([string]$Fields[$key])
            $content.Add($stringContent, $key)
        }

        foreach ($key in $Files.Keys) {
            $filePath = [string]$Files[$key]
            $stream = [System.IO.File]::OpenRead($filePath)
            $streams.Add($stream) | Out-Null
            $fileContent = [System.Net.Http.StreamContent]::new($stream)
            $content.Add($fileContent, $key, [System.IO.Path]::GetFileName($filePath))
        }

        $response = $client.PostAsync($uri, $content).GetAwaiter().GetResult()
        $statusCode = [int]$response.StatusCode
        $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    }
    finally {
        foreach ($stream in $streams) {
            $stream.Dispose()
        }
        $content.Dispose()
        $client.Dispose()
    }

    Save-Text -Name "$Name.response.txt" -Content $body | Out-Null
    Assert-Condition ($AllowedStatusCodes -contains $statusCode) "POST $Path returned HTTP $statusCode. Expected: $($AllowedStatusCodes -join ', '). Body: $body"

    $json = $null
    if (-not [string]::IsNullOrWhiteSpace($body)) {
        $json = $body | ConvertFrom-Json
    }

    return [pscustomobject]@{
        StatusCode = $statusCode
        Json = $json
        Raw = $body
    }
}

function Invoke-Download {
    param(
        [string]$Name,
        [string]$Path,
        [string]$OutputPath,
        [int[]]$AllowedStatusCodes = @(200),
        [int]$Timeout = $TimeoutSeconds
    )

    $uri = "$BaseUrl$Path"
    $client = [System.Net.Http.HttpClient]::new()
    $client.Timeout = [TimeSpan]::FromSeconds($Timeout)
    try {
        $response = $client.GetAsync($uri).GetAwaiter().GetResult()
        $statusCode = [int]$response.StatusCode
        $contentType = ""
        if ($response.Content.Headers.ContentType -ne $null) {
            $contentType = $response.Content.Headers.ContentType.ToString()
        }
        $bytes = $response.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
    }
    finally {
        $client.Dispose()
    }

    [System.IO.File]::WriteAllBytes($OutputPath, $bytes)
    Save-Json -Name "$Name.response.json" -Value @{
        statusCode = $statusCode
        contentType = $contentType
        outputPath = $OutputPath
        byteCount = $bytes.Length
    } | Out-Null

    Assert-Condition ($AllowedStatusCodes -contains $statusCode) "GET $Path returned HTTP $statusCode. Expected: $($AllowedStatusCodes -join ', '). Bytes saved: $($bytes.Length)"

    return [pscustomobject]@{
        StatusCode = $statusCode
        ContentType = $contentType
        OutputPath = $OutputPath
        ByteCount = $bytes.Length
    }
}

function New-ZipFromEntries {
    param(
        [string]$ZipPath,
        [hashtable]$Entries
    )

    if (Test-Path $ZipPath) {
        Remove-Item -LiteralPath $ZipPath -Force
    }

    $tempDir = Join-Path ([System.IO.Path]::GetDirectoryName($ZipPath)) ([System.IO.Path]::GetFileNameWithoutExtension($ZipPath))
    if (Test-Path $tempDir) {
        Remove-Item -LiteralPath $tempDir -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

    foreach ($entryName in $Entries.Keys) {
        $entryPath = Join-Path $tempDir $entryName
        $entryDir = [System.IO.Path]::GetDirectoryName($entryPath)
        if (-not [string]::IsNullOrWhiteSpace($entryDir)) {
            New-Item -ItemType Directory -Force -Path $entryDir | Out-Null
        }
        [System.IO.File]::WriteAllText($entryPath, [string]$Entries[$entryName])
    }

    [System.IO.Compression.ZipFile]::CreateFromDirectory($tempDir, $ZipPath)
    Remove-Item -LiteralPath $tempDir -Recurse -Force
}

function New-LargeZip {
    param(
        [string]$ZipPath,
        [int]$SizeMB
    )

    $payloadDir = Join-Path ([System.IO.Path]::GetDirectoryName($ZipPath)) ([System.IO.Path]::GetFileNameWithoutExtension($ZipPath))
    if (Test-Path $payloadDir) {
        Remove-Item -LiteralPath $payloadDir -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $payloadDir | Out-Null

    $payloadPath = Join-Path $payloadDir "large-payload.bin"
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $buffer = New-Object byte[] (1024 * 1024)
    $stream = [System.IO.File]::Open($payloadPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write)
    try {
        for ($i = 0; $i -lt $SizeMB; $i++) {
            $rng.GetBytes($buffer)
            $stream.Write($buffer, 0, $buffer.Length)
        }
    }
    finally {
        $stream.Dispose()
        $rng.Dispose()
    }
    [System.IO.File]::WriteAllText((Join-Path $payloadDir "sentinel.txt"), "PreQC large fixture $script:RunId")

    if (Test-Path $ZipPath) {
        Remove-Item -LiteralPath $ZipPath -Force
    }
    [System.IO.Compression.ZipFile]::CreateFromDirectory($payloadDir, $ZipPath, [System.IO.Compression.CompressionLevel]::NoCompression, $false)
    Remove-Item -LiteralPath $payloadDir -Recurse -Force
}

function New-Fixtures {
    Write-Step "Generating deterministic Pre-QC fixtures"

    $smallZip = Join-Path $script:FixtureRoot "PreQC_AI_Test_Model_$script:RunId.zip"
    New-ZipFromEntries -ZipPath $smallZip -Entries @{
        "sentinel.txt" = "PreQC AI model fixture $script:RunId"
        "config/model.ini" = "name=PreQC_AI_Test_Model_$script:RunId`nmode=test"
    }

    $updateZip = Join-Path $script:FixtureRoot "PreQC_AI_Test_Model_Update_$script:RunId.zip"
    New-ZipFromEntries -ZipPath $updateZip -Entries @{
        "sentinel.txt" = "PreQC AI model fixture updated $script:RunId"
        "config/model.ini" = "name=PreQC_AI_Test_Model_$script:RunId`nmode=updated"
    }

    $keepBothZip = Join-Path $script:FixtureRoot "PreQC_AI_Test_Model_KeepBoth_$script:RunId.zip"
    New-ZipFromEntries -ZipPath $keepBothZip -Entries @{
        "sentinel.txt" = "PreQC AI model fixture keep both $script:RunId"
        "config/model.ini" = "name=PreQC_AI_Test_Model_$script:RunId`nmode=keepboth"
    }

    $emptyZip = Join-Path $script:FixtureRoot "empty.zip"
    if (Test-Path $emptyZip) {
        Remove-Item -LiteralPath $emptyZip -Force
    }
    $zip = [System.IO.Compression.ZipFile]::Open($emptyZip, [System.IO.Compression.ZipArchiveMode]::Create)
    $zip.Dispose()

    $corruptZip = Join-Path $script:FixtureRoot "corrupt.zip"
    [System.IO.File]::WriteAllText($corruptZip, "this is not a valid zip")

    $textFile = Join-Path $script:FixtureRoot "unsupported.txt"
    [System.IO.File]::WriteAllText($textFile, "not a zip")

    $bundleDir = if ([string]::IsNullOrWhiteSpace($DeploymentNetworkPath)) {
        Join-Path $script:FixtureRoot "PreQC_AI_Test_Bundle_$script:RunId"
    }
    else {
        $DeploymentNetworkPath
    }
    New-Item -ItemType Directory -Force -Path $bundleDir | Out-Null

    $bundleZip = Join-Path $bundleDir "bundle.zip"
    New-ZipFromEntries -ZipPath $bundleZip -Entries @{
        "preqc-marker.txt" = "PreQC AI harmless deployment marker $script:RunId"
        "README.txt" = "This package is generated only for Pre-QC deployment verification."
    }

    $releaseInfo = @{
        version = "PreQC_AI_Test_$script:RunId"
        fileName = "bundle.zip"
        releaseNotes = "Harmless Pre-QC AI deployment fixture"
        buildDate = (Get-Date).ToString("o")
        verifiedBy = "PreQC automation"
    } | ConvertTo-Json -Depth 5
    [System.IO.File]::WriteAllText((Join-Path $bundleDir "release-info.json"), $releaseInfo)

    $large100 = $null
    $largeNearLimit = $null
    if ($EnableLargeFiles) {
        $large100 = Join-Path $script:FixtureRoot "PreQC_AI_Test_Large_100MB_$script:RunId.zip"
        New-LargeZip -ZipPath $large100 -SizeMB 100

        $largeNearLimit = Join-Path $script:FixtureRoot "PreQC_AI_Test_Large_480MB_$script:RunId.zip"
        New-LargeZip -ZipPath $largeNearLimit -SizeMB 480
    }

    $fixtures = [pscustomobject]@{
        SmallModelZip = $smallZip
        UpdateModelZip = $updateZip
        KeepBothModelZip = $keepBothZip
        EmptyZip = $emptyZip
        CorruptZip = $corruptZip
        UnsupportedFile = $textFile
        BundleDirectory = $bundleDir
        BundleZip = $bundleZip
        Large100MbZip = $large100
        LargeNearLimitZip = $largeNearLimit
    }
    Save-Json -Name "fixtures.json" -Value $fixtures | Out-Null
    Add-Result -Name "Fixture generation" -Status "Passed" -Details "Fixtures written to $script:FixtureRoot"
    return $fixtures
}

function Get-PropertyValue {
    param(
        [object]$Object,
        [string[]]$Names
    )

    if ($null -eq $Object) {
        return $null
    }

    foreach ($name in $Names) {
        $prop = $Object.PSObject.Properties[$name]
        if ($prop -ne $null -and $null -ne $prop.Value -and -not [string]::IsNullOrWhiteSpace([string]$prop.Value)) {
            return [string]$prop.Value
        }
    }
    return $null
}

function Add-LogFilePathsFromTree {
    param(
        [object]$Node,
        [System.Collections.Generic.List[string]]$Paths
    )

    if ($null -eq $Node) {
        return
    }

    if ($Node -is [System.Array]) {
        foreach ($item in $Node) {
            Add-LogFilePathsFromTree -Node $item -Paths $Paths
        }
        return
    }

    $candidate = Get-PropertyValue -Object $Node -Names @("fullPath", "FullPath", "filePath", "FilePath", "path", "Path")
    if ($candidate -and ($candidate -match '\.(log|txt|csv|json|xml)$')) {
        $isDirectoryProp = $Node.PSObject.Properties["isDirectory"]
        if ($isDirectoryProp -eq $null -or -not [bool]$isDirectoryProp.Value) {
            $Paths.Add($candidate) | Out-Null
        }
    }

    foreach ($childName in @("children", "Children", "files", "Files")) {
        $childProp = $Node.PSObject.Properties[$childName]
        if ($childProp -ne $null) {
            Add-LogFilePathsFromTree -Node $childProp.Value -Paths $Paths
        }
    }
}

function Find-BestLogPathInTree {
    param([object]$Node)

    $paths = New-Object System.Collections.Generic.List[string]
    Add-LogFilePathsFromTree -Node $Node -Paths $paths

    return @($paths | Sort-Object -Descending | Select-Object -First 1)[0]
}

function Resolve-AgentFilePath {
    param(
        [string]$RootPath,
        [string]$FilePath
    )

    if ([string]::IsNullOrWhiteSpace($FilePath)) {
        return $FilePath
    }

    if ([System.IO.Path]::IsPathRooted($FilePath) -or [string]::IsNullOrWhiteSpace($RootPath)) {
        return $FilePath
    }

    return Join-Path $RootPath $FilePath
}

function Wait-DownloadRequest {
    param(
        [string]$RequestId,
        [int]$Timeout = $CallbackTimeoutSeconds
    )

    $deadline = (Get-Date).AddSeconds($Timeout)
    do {
        Start-Sleep -Seconds $PollSeconds
        $status = Invoke-ApiJson -Name "model-agent-upload-status-$RequestId" -Path "/api/ModelLibrary/check-status/$RequestId" -Method "GET"
        if ($status.Json.status -eq "Ready") {
            return $status
        }
        if ($status.Json.status -eq "Failed") {
            throw "Agent model upload request $RequestId failed: $($status.Json.error)"
        }
    } while ((Get-Date) -lt $deadline)

    throw "Timed out waiting for agent model upload request $RequestId"
}

function Wait-Schedule {
    param(
        [int]$ScheduleId,
        [int]$Timeout = $DeploymentTimeoutSeconds,
        [string]$EvidencePrefix = "schedule"
    )

    $deadline = (Get-Date).AddSeconds($Timeout)
    $terminal = @("Completed", "PartiallyCompleted", "Failed", "Halted", "Cancelled")
    $last = $null
    do {
        Start-Sleep -Seconds $PollSeconds
        $detail = Invoke-ApiJson -Name "$EvidencePrefix-$ScheduleId-detail" -Path "/api/Updates/schedules/$ScheduleId" -Method "GET"
        $last = $detail.Json

        $summary = [pscustomobject]@{
            scheduleId = $ScheduleId
            status = $last.schedule.status
            deployments = $last.deployments | ForEach-Object {
                [pscustomobject]@{
                    deploymentId = $_.updateDeploymentId
                    mcId = $_.mcId
                    status = $_.status
                    agentCommandId = $_.agentCommandId
                    agentCommandType = $_.agentCommandType
                    agentCommandStatus = $_.agentCommandStatus
                    errorMessage = $_.errorMessage
                }
            }
        }
        Save-Json -Name "$EvidencePrefix-$ScheduleId-latest-summary.json" -Value $summary | Out-Null

        if ($terminal -contains [string]$last.schedule.status) {
            return $last
        }
    } while ((Get-Date) -lt $deadline)

    throw "Timed out waiting for schedule $ScheduleId. Last status: $($last.schedule.status)"
}

function Test-Uploads {
    param([object]$Fixtures)

    Write-Step "Testing model upload, download, and validation flows"
    $modelName = "PreQC_AI_Test_Model_$script:RunId"
    $smallHash = Get-Sha256 -Path $Fixtures.SmallModelZip

    $upload = Invoke-MultipartUpload -Name "model-upload-valid" -Path "/api/ModelLibrary/upload" -Fields @{
        modelName = $modelName
        description = "Pre-QC AI test model $script:RunId"
        category = "PreQC"
        updateExisting = "false"
        keepBoth = "false"
    } -Files @{ file = $Fixtures.SmallModelZip }

    Assert-Condition ([bool]$upload.Json.success) "Valid model upload did not report success."
    Assert-Condition ([string]$upload.Json.checksum -eq $smallHash) "Uploaded checksum mismatch. Expected $smallHash, got $($upload.Json.checksum)."
    $modelFileId = [int]$upload.Json.modelFileId
    $script:CreatedModelIds.Add($modelFileId) | Out-Null

    $structure = Invoke-ApiJson -Name "model-structure" -Path "/api/ModelLibrary/$modelFileId/structure" -Method "GET"
    $paths = @($structure.Json | ForEach-Object { $_.path })
    Assert-Condition ($paths -contains "sentinel.txt") "Uploaded model structure did not include sentinel.txt."

    $downloadPath = Join-Path $script:DownloadRoot "downloaded-model-$modelFileId.zip"
    $download = Invoke-Download -Name "model-download" -Path "/api/ModelLibrary/download/$modelFileId" -OutputPath $downloadPath
    Assert-Condition ($download.ContentType -like "application/zip*") "Model download content type was '$($download.ContentType)', expected application/zip."
    Assert-Condition ((Get-Sha256 -Path $downloadPath) -eq $smallHash) "Downloaded model checksum did not match uploaded fixture."

    Invoke-MultipartUpload -Name "model-upload-duplicate-content" -Path "/api/ModelLibrary/upload" -Fields @{
        modelName = "${modelName}_Duplicate"
    } -Files @{ file = $Fixtures.SmallModelZip } -AllowedStatusCodes @(409) | Out-Null

    Invoke-MultipartUpload -Name "model-upload-empty-zip" -Path "/api/ModelLibrary/upload" -Fields @{
        modelName = "${modelName}_Empty"
    } -Files @{ file = $Fixtures.EmptyZip } -AllowedStatusCodes @(400) | Out-Null

    Invoke-MultipartUpload -Name "model-upload-corrupt-zip" -Path "/api/ModelLibrary/upload" -Fields @{
        modelName = "${modelName}_Corrupt"
    } -Files @{ file = $Fixtures.CorruptZip } -AllowedStatusCodes @(400) | Out-Null

    Invoke-MultipartUpload -Name "model-upload-unsupported-file" -Path "/api/ModelLibrary/upload" -Fields @{
        modelName = "${modelName}_Unsupported"
    } -Files @{ file = $Fixtures.UnsupportedFile } -AllowedStatusCodes @(400) | Out-Null

    $update = Invoke-MultipartUpload -Name "model-upload-update-existing" -Path "/api/ModelLibrary/upload" -Fields @{
        modelName = $modelName
        updateExisting = "true"
        keepBoth = "false"
    } -Files @{ file = $Fixtures.UpdateModelZip }
    Assert-Condition ([int]$update.Json.modelFileId -eq $modelFileId) "updateExisting created a different model id."

    $versions = Invoke-ApiJson -Name "model-versions-after-update" -Path "/api/ModelLibrary/$modelFileId/versions" -Method "GET"
    Assert-Condition (@($versions.Json).Count -ge 2) "updateExisting did not create a second model version."

    $keepBoth = Invoke-MultipartUpload -Name "model-upload-keep-both" -Path "/api/ModelLibrary/upload" -Fields @{
        modelName = $modelName
        updateExisting = "false"
        keepBoth = "true"
    } -Files @{ file = $Fixtures.KeepBothModelZip }
    Assert-Condition ([bool]$keepBoth.Json.success) "keepBoth upload did not report success."
    $script:CreatedModelIds.Add([int]$keepBoth.Json.modelFileId) | Out-Null

    if ($EnableLargeFiles) {
        $large100 = Invoke-MultipartUpload -Name "model-upload-large-100mb" -Path "/api/ModelLibrary/upload" -Fields @{
            modelName = "${modelName}_Large100"
        } -Files @{ file = $Fixtures.Large100MbZip } -Timeout 900
        Assert-Condition ([bool]$large100.Json.success) "100MB model upload failed."
        $script:CreatedModelIds.Add([int]$large100.Json.modelFileId) | Out-Null

        $largeNearLimit = Invoke-MultipartUpload -Name "model-upload-large-near-limit" -Path "/api/ModelLibrary/upload" -Fields @{
            modelName = "${modelName}_LargeNearLimit"
        } -Files @{ file = $Fixtures.LargeNearLimitZip } -Timeout 1800
        Assert-Condition ([bool]$largeNearLimit.Json.success) "Near-limit model upload failed."
        $script:CreatedModelIds.Add([int]$largeNearLimit.Json.modelFileId) | Out-Null
    }

    Add-Result -Name "Model upload/download validation" -Status "Passed" -Details "ModelFileId=$modelFileId"
    return [pscustomobject]@{
        ModelFileId = $modelFileId
        ModelName = $modelName
    }
}

function Test-RealAgentCallbacks {
    param([object]$PreflightPc)

    Write-Step "Testing real agent callback flows"

    try {
        $configPath = Join-Path $script:DownloadRoot "mc-$MCId-config.ini"
        $config = Invoke-Download -Name "agent-download-config" -Path "/api/MC/DownloadConfig?mcId=$MCId" -OutputPath $configPath -Timeout $CallbackTimeoutSeconds
        Assert-Condition ($config.ByteCount -gt 0) "Downloaded config callback returned empty content."
        Assert-Condition ($config.ContentType -like "text/plain*") "Config callback content type was '$($config.ContentType)', expected text/plain."
        Add-Result -Name "Config download callback" -Status "Passed" -Details "Bytes=$($config.ByteCount)"
    }
    catch {
        Add-Result -Name "Config download callback" -Status "Failed" -Details $_.Exception.Message
    }

    $chosenLogPath = $LogFilePath
    if ([string]::IsNullOrWhiteSpace($chosenLogPath)) {
        $structure = Invoke-ApiJson -Name "agent-log-structure" -Path "/api/LogAnalyzer/structure/$MCId" -Method "GET"
        $chosenLogPath = Find-BestLogPathInTree -Node $structure.Json.files
    }

    if ([string]::IsNullOrWhiteSpace($chosenLogPath)) {
        Add-Result -Name "Log file callback" -Status "Skipped" -Details "No log path was provided and none could be inferred from log structure."
    }
    else {
        try {
            $log = Invoke-ApiJson -Name "agent-log-file" -Path "/api/LogAnalyzer/file/$MCId" -Method "POST" -Body @{ filePath = $chosenLogPath } -AllowedStatusCodes @(200) -Timeout ([Math]::Max($CallbackTimeoutSeconds, 240))
            Assert-Condition ($log.Json.size -ge 0) "Log callback response did not include a valid size."
            Assert-Condition (-not [string]::IsNullOrWhiteSpace([string]$log.Json.fileName)) "Log callback response did not include a file name."
            Add-Result -Name "Log file callback" -Status "Passed" -Details "Path=$chosenLogPath; Size=$($log.Json.size)"
        }
        catch {
            Add-Result -Name "Log file callback" -Status "Failed" -Details $_.Exception.Message
        }
    }

    try {
        $missingPath = "C:\PreQC\Missing_$script:RunId.log"
        Invoke-ApiJson -Name "agent-log-missing-file" -Path "/api/LogAnalyzer/file/$MCId" -Method "POST" -Body @{ filePath = $missingPath } -AllowedStatusCodes @(408, 404) -Timeout ([Math]::Max($CallbackTimeoutSeconds, 240)) | Out-Null
        Add-Result -Name "Missing log negative callback" -Status "Passed" -Details "Missing path returned expected error status."
    }
    catch {
        Add-Result -Name "Missing log negative callback" -Status "Failed" -Details $_.Exception.Message
    }

    if ([string]::IsNullOrWhiteSpace($ImagePath)) {
        Add-Result -Name "Inspection image callback" -Status "Skipped" -Details "No ImagePath was provided. Pass -ImagePath to verify real image upload/fetch."
    }
    else {
        try {
            $imageOut = Join-Path $script:DownloadRoot "inspection-image-$script:RunId.bmp"
            $encodedImagePath = [System.Uri]::EscapeDataString($ImagePath)
            $image = Invoke-Download -Name "agent-fetch-image" -Path "/api/LogAnalyzer/fetch-image/$MCId?path=$encodedImagePath" -OutputPath $imageOut -AllowedStatusCodes @(200) -Timeout $CallbackTimeoutSeconds
            Assert-Condition ($image.ByteCount -gt 0) "Image callback returned empty image content."
            Assert-Condition ($image.ContentType -like "image/bmp*") "Image callback content type was '$($image.ContentType)', expected image/bmp."

            $cachedOut = Join-Path $script:DownloadRoot "inspection-image-cached-$script:RunId.bmp"
            $cached = Invoke-Download -Name "agent-fetch-image-cache" -Path "/api/LogAnalyzer/fetch-image/$MCId?path=$encodedImagePath" -OutputPath $cachedOut -AllowedStatusCodes @(200) -Timeout $CallbackTimeoutSeconds
            Assert-Condition ($cached.ByteCount -eq $image.ByteCount) "Cached image callback byte count differed from first fetch."
            Add-Result -Name "Inspection image callback" -Status "Passed" -Details "Path=$ImagePath; Bytes=$($image.ByteCount)"
        }
        catch {
            Add-Result -Name "Inspection image callback" -Status "Failed" -Details $_.Exception.Message
        }
    }

    if ($PreflightPc.currentModel -ne $null -and -not [string]::IsNullOrWhiteSpace([string]$PreflightPc.currentModel.modelName)) {
        try {
            $request = Invoke-ApiJson -Name "agent-request-model-upload" -Path "/api/ModelLibrary/request-download" -Method "POST" -Body @{
                mcId = $MCId
                modelName = [string]$PreflightPc.currentModel.modelName
            }
            $requestId = [string]$request.Json.requestId
            Assert-Condition (-not [string]::IsNullOrWhiteSpace($requestId)) "Agent model upload request did not return a requestId."
            Wait-DownloadRequest -RequestId $requestId | Out-Null

            $agentModelPath = Join-Path $script:DownloadRoot "agent-uploaded-model-$requestId.zip"
            $agentModel = Invoke-Download -Name "agent-serve-uploaded-model" -Path "/api/ModelLibrary/serve-download/$requestId" -OutputPath $agentModelPath -AllowedStatusCodes @(200) -Timeout $CallbackTimeoutSeconds
            Assert-Condition ($agentModel.ByteCount -gt 0) "Agent-uploaded model download was empty."
            Add-Result -Name "Agent model upload callback" -Status "Passed" -Details "RequestId=$requestId; Bytes=$($agentModel.ByteCount)"
        }
        catch {
            Add-Result -Name "Agent model upload callback" -Status "Failed" -Details $_.Exception.Message
        }
    }
    else {
        Add-Result -Name "Agent model upload callback" -Status "Skipped" -Details "MC has no current model name."
    }
}

function Test-Deployment {
    param([object]$Fixtures)

    Write-Step "Testing real deployment schedule with harmless Bundle package"

    $scanBody = @{
        networkPath = $Fixtures.BundleDirectory
    }
    if (-not [string]::IsNullOrWhiteSpace($ShareUsername)) {
        $scanBody.shareUsername = $ShareUsername
        $scanBody.sharePassword = $SharePassword
    }

    $scan = Invoke-ApiJson -Name "bundle-scan" -Path "/api/Bundle/scan" -Method "POST" -Body $scanBody
    Assert-Condition ([bool]$scan.Json.success) "Bundle scan did not report success."

    $registerBody = @{
        networkPath = $Fixtures.BundleDirectory
        version = [string]$scan.Json.version
        fileName = [string]$scan.Json.packageName
        releaseNotes = [string]$scan.Json.releaseNotes
        fileSizeBytes = [long]$scan.Json.fileSizeBytes
        fileHash = [string]$scan.Json.fileHash
        registeredBy = "PreQC automation"
    }
    if (-not [string]::IsNullOrWhiteSpace($ShareUsername)) {
        $registerBody.shareUsername = $ShareUsername
        $registerBody.sharePassword = $SharePassword
    }

    $register = Invoke-ApiJson -Name "bundle-register" -Path "/api/Bundle/register" -Method "POST" -Body $registerBody
    Assert-Condition ([bool]$register.Json.success) "Bundle register did not report success."
    $packageId = [int]$register.Json.packageId
    $script:CreatedPackageId = $packageId

    $targetFilter = @{ McIds = @($MCId) } | ConvertTo-Json -Compress
    $schedule = Invoke-ApiJson -Name "deployment-schedule-create" -Path "/api/Updates/schedules" -Method "POST" -Body @{
        packageId = $packageId
        scheduleName = "PreQC_AI_Test_Deploy_$script:RunId"
        targetType = "SelectedMCs"
        targetFilter = $targetFilter
        scheduleType = "Immediate"
    }

    Assert-Condition ([bool]$schedule.Json.success) "Deployment schedule creation did not report success."
    $scheduleId = [int]$schedule.Json.scheduleId
    $script:CreatedScheduleId = $scheduleId

    $final = Wait-Schedule -ScheduleId $scheduleId -EvidencePrefix "deployment"
    $deployments = @($final.deployments | Where-Object { [int]$_.mcId -eq $MCId })
    Assert-Condition ($deployments.Count -eq 1) "Expected exactly one deployment for MCId=$MCId; found $($deployments.Count)."

    $deployment = $deployments[0]
    Assert-Condition (-not ([string]$deployment.agentCommandType -like "Rollback*")) "Forward deployment dispatched rollback command type '$($deployment.agentCommandType)'."
    Assert-Condition ([string]$deployment.agentCommandType -eq "DeployBundle") "Forward deployment command type was '$($deployment.agentCommandType)', expected DeployBundle."

    $terminalOk = @("Completed", "PartiallyCompleted", "Failed", "Halted")
    Assert-Condition ($terminalOk -contains [string]$final.schedule.status) "Schedule ended in unexpected status '$($final.schedule.status)'."

    if ([string]$final.schedule.status -ne "Completed") {
        throw "Deployment schedule $scheduleId did not complete. Status=$($final.schedule.status); DeploymentStatus=$($deployment.status); Error=$($deployment.errorMessage)"
    }

    Add-Result -Name "Real deployment schedule" -Status "Passed" -Details "PackageId=$packageId; ScheduleId=$scheduleId; CommandType=$($deployment.agentCommandType)"
    return [pscustomobject]@{
        PackageId = $packageId
        ScheduleId = $scheduleId
    }
}

function Test-DestructiveFlows {
    param(
        [object]$UploadInfo,
        [object]$DeploymentInfo
    )

    Write-Step "Testing gated rollback, restore, purge, and temp model cleanup flows"

    if ($UploadInfo -ne $null) {
        $versionsBefore = Invoke-ApiJson -Name "model-revert-versions-before" -Path "/api/ModelLibrary/$($UploadInfo.ModelFileId)/versions" -Method "GET"
        $versionOne = @($versionsBefore.Json | Sort-Object versionNumber | Select-Object -First 1)
        if ($versionOne -ne $null) {
            $revert = Invoke-ApiJson -Name "model-revert" -Path "/api/ModelLibrary/$($UploadInfo.ModelFileId)/revert/$($versionOne.generationNoId)" -Method "POST"
            Assert-Condition ([bool]$revert.Json.success) "Model revert did not report success."
            Add-Result -Name "Model revert" -Status "Passed" -Details "ModelFileId=$($UploadInfo.ModelFileId); RevertedToVersion=$($versionOne.versionNumber); NewVersion=$($revert.Json.newVersion)"
        }
        else {
            Add-Result -Name "Model revert" -Status "Skipped" -Details "No version row found for temp model."
        }
    }
    else {
        Add-Result -Name "Model revert" -Status "Skipped" -Details "Run -EnableUploads with -EnableDestructive to verify temp model revert."
    }

    if ($DeploymentInfo -ne $null -and $DeploymentInfo.ScheduleId -gt 0) {
        $rollback = Invoke-ApiJson -Name "deployment-rollback-create" -Path "/api/Updates/schedules/$($DeploymentInfo.ScheduleId)/rollback" -Method "POST"
        Assert-Condition ([bool]$rollback.Json.success) "Rollback schedule creation did not report success."
        $rollbackScheduleId = [int]$rollback.Json.rollbackScheduleId
        $script:CreatedRollbackScheduleId = $rollbackScheduleId

        $rollbackFinal = Wait-Schedule -ScheduleId $rollbackScheduleId -EvidencePrefix "rollback"
        $rollbackDeployments = @($rollbackFinal.deployments | Where-Object { [int]$_.mcId -eq $MCId })
        Assert-Condition ($rollbackDeployments.Count -eq 1) "Expected one rollback deployment for MCId=$MCId; found $($rollbackDeployments.Count)."
        $rollbackDeployment = $rollbackDeployments[0]
        Assert-Condition ([string]$rollbackDeployment.agentCommandType -eq "RollbackBundle") "Rollback dispatched '$($rollbackDeployment.agentCommandType)', expected RollbackBundle."
        Assert-Condition (-not ([string]$rollbackDeployment.agentCommandType -like "Deploy*")) "Rollback schedule dispatched deploy command type '$($rollbackDeployment.agentCommandType)'."
        Add-Result -Name "Deployment rollback" -Status "Passed" -Details "RollbackScheduleId=$rollbackScheduleId; CommandType=$($rollbackDeployment.agentCommandType)"
    }
    else {
        Add-Result -Name "Deployment rollback" -Status "Skipped" -Details "Run -EnableDeployment with a completed test deployment before destructive rollback."
    }

    if ($script:CreatedPackageId -ne $null) {
        $packageId = [int]$script:CreatedPackageId
        Invoke-ApiJson -Name "package-archive" -Path "/api/Updates/packages/$packageId" -Method "DELETE" | Out-Null

        $archived = Invoke-ApiJson -Name "package-archived-list-after-archive" -Path "/api/Updates/packages/archived" -Method "GET"
        $archivedMatch = @($archived.Json.packages | Where-Object { [int]$_.updatePackageId -eq $packageId })
        Assert-Condition ($archivedMatch.Count -eq 1) "Archived package $packageId was not visible in archived list."

        Invoke-ApiJson -Name "package-restore" -Path "/api/Updates/packages/$packageId/restore" -Method "POST" | Out-Null
        $active = Invoke-ApiJson -Name "package-active-list-after-restore" -Path "/api/Updates/packages" -Method "GET"
        $activeMatch = @($active.Json.packages | Where-Object { [int]$_.updatePackageId -eq $packageId })
        Assert-Condition ($activeMatch.Count -eq 1) "Restored package $packageId was not visible in active package list."

        Invoke-ApiJson -Name "package-archive-before-purge" -Path "/api/Updates/packages/$packageId" -Method "DELETE" | Out-Null
        Invoke-ApiJson -Name "package-purge" -Path "/api/Updates/packages/$packageId/purge" -Method "DELETE" | Out-Null
        Add-Result -Name "Package archive/restore/purge" -Status "Passed" -Details "PackageId=$packageId"
    }
    else {
        Add-Result -Name "Package archive/restore/purge" -Status "Skipped" -Details "No temp deployment package was created."
    }

    foreach ($modelId in @($script:CreatedModelIds)) {
        try {
            Invoke-ApiJson -Name "model-delete-$modelId" -Path "/api/ModelLibrary/delete/$modelId" -Method "POST" -AllowedStatusCodes @(200, 404) | Out-Null
        }
        catch {
            Add-Result -Name "Temp model cleanup $modelId" -Status "Failed" -Details $_.Exception.Message
            throw
        }
    }

    if ($script:CreatedModelIds.Count -gt 0) {
        Add-Result -Name "Temp model cleanup" -Status "Passed" -Details "Deleted temp model ids: $($script:CreatedModelIds -join ', ')"
    }
}

function Write-Report {
    param(
        [string]$OverallStatus,
        [string]$FailureMessage = ""
    )

    $reportPath = Join-Path $script:RunRoot "PreQC-RealAgentResults.md"
    $summaryJson = Join-Path $script:RunRoot "PreQC-RealAgentResults.json"
    $script:ResultItems | ConvertTo-Json -Depth 20 | Set-Content -Path $summaryJson -Encoding UTF8

    $lines = New-Object System.Collections.Generic.List[string]
    $lines.Add("# Pre-QC Real-Agent Automation Results") | Out-Null
    $lines.Add("") | Out-Null
    $lines.Add("Run ID: ``$script:RunId``") | Out-Null
    $lines.Add("Base URL: ``$BaseUrl``") | Out-Null
    $lines.Add("MC ID: ``$MCId``") | Out-Null
    $lines.Add("Status: **$OverallStatus**") | Out-Null
    if (-not [string]::IsNullOrWhiteSpace($FailureMessage)) {
        $lines.Add("") | Out-Null
        $lines.Add("Failure: ``$FailureMessage``") | Out-Null
    }
    $lines.Add("") | Out-Null
    $lines.Add("## Gate Flags") | Out-Null
    $lines.Add("") | Out-Null
    $lines.Add("- EnableUploads: ``$EnableUploads``") | Out-Null
    $lines.Add("- EnableLargeFiles: ``$EnableLargeFiles``") | Out-Null
    $lines.Add("- EnableRealAgentCallbacks: ``$EnableRealAgentCallbacks``") | Out-Null
    $lines.Add("- EnableDeployment: ``$EnableDeployment``") | Out-Null
    $lines.Add("- EnableDestructive: ``$EnableDestructive``") | Out-Null
    $lines.Add("") | Out-Null
    $lines.Add("## Results") | Out-Null
    $lines.Add("") | Out-Null

    foreach ($item in $script:ResultItems) {
        $detail = if ([string]::IsNullOrWhiteSpace($item.Details)) { "" } else { " - $($item.Details)" }
        $lines.Add("- **$($item.Status)** - $($item.Name)$detail") | Out-Null
    }

    $lines.Add("") | Out-Null
    $lines.Add("## Evidence") | Out-Null
    $lines.Add("") | Out-Null
    $lines.Add("- Artifact root: ``$script:RunRoot``") | Out-Null
    $lines.Add("- JSON summary: ``$summaryJson``") | Out-Null

    [System.IO.File]::WriteAllLines($reportPath, $lines)

    $latestPath = Join-Path $script:Root "PreQC-RealAgentResults-latest.md"
    Copy-Item -LiteralPath $reportPath -Destination $latestPath -Force

    Write-Host ""
    Write-Host "Report: $reportPath" -ForegroundColor Green
    Write-Host "Latest: $latestPath" -ForegroundColor Green
}

$overall = "Passed"
$failure = ""
$uploadInfo = $null
$deploymentInfo = $null

try {
    Write-Step "Preflight: verifying API and real agent MCId=$MCId"
    $pc = Invoke-ApiJson -Name "preflight-pc" -Path "/api/Api/pc/$MCId" -Method "GET"
    Assert-Condition ([int]$pc.Json.mcId -eq $MCId) "Preflight returned unexpected MCId."
    Assert-Condition ([bool]$pc.Json.isOnline) "MCId=$MCId is not online."
    Add-Result -Name "Real agent preflight" -Status "Passed" -Details "Line=$($pc.Json.lineNumber); MC=$($pc.Json.mcNumber); IP=$($pc.Json.ipAddress); Agent=$($pc.Json.agentVersion); Service=$($pc.Json.serviceVersion)"

    $fixtures = New-Fixtures

    if ($EnableUploads) {
        $uploadInfo = Test-Uploads -Fixtures $fixtures
    }
    else {
        Add-Result -Name "Model upload/download validation" -Status "Skipped" -Details "Pass -EnableUploads to run upload mutations."
    }

    if ($EnableRealAgentCallbacks) {
        Test-RealAgentCallbacks -PreflightPc $pc.Json
    }
    else {
        Add-Result -Name "Real agent callbacks" -Status "Skipped" -Details "Pass -EnableRealAgentCallbacks to run real config/log/image/model callbacks."
    }

    if ($EnableDeployment) {
        $deploymentInfo = Test-Deployment -Fixtures $fixtures
    }
    else {
        Add-Result -Name "Real deployment schedule" -Status "Skipped" -Details "Pass -EnableDeployment to register and deploy a harmless Bundle package."
    }

    if ($EnableDestructive) {
        Test-DestructiveFlows -UploadInfo $uploadInfo -DeploymentInfo $deploymentInfo
    }
    else {
        Add-Result -Name "Rollback/revert/destructive cleanup" -Status "Skipped" -Details "Pass -EnableDestructive to run rollback, archive/restore/purge, model revert, and temp cleanup."
    }
}
catch {
    $overall = "Failed"
    $failure = $_.Exception.Message
    Add-Result -Name "Run failure" -Status "Failed" -Details $failure
    Write-Host ""
    Write-Host "FAILED: $failure" -ForegroundColor Red
}
finally {
    if ($overall -eq "Passed" -and $script:HadFailure) {
        $overall = "Failed"
        $failure = "One or more gated scenarios failed. See Results and evidence files."
    }
    Write-Report -OverallStatus $overall -FailureMessage $failure
}

if ($overall -ne "Passed") {
    exit 1
}
