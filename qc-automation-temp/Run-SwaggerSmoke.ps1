param(
    [string]$BaseUrl = "http://127.0.0.1:5000",
    [string]$ProjectPath = "Server/API/LensAssemblyMonitoringWeb.csproj",
    [int]$StartupTimeoutSeconds = 45,
    [switch]$StartApi
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "== $Message ==" -ForegroundColor Cyan
}

function Normalize-Route {
    param([string]$Route)
    return ($Route.Trim("/") -replace "\{[^/]+\}", "{}").ToLowerInvariant()
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

function Get-Operation {
    param(
        [object]$Swagger,
        [string]$Route,
        [string]$Method
    )

    $normalized = Normalize-Route $Route
    foreach ($pathProperty in $Swagger.paths.PSObject.Properties) {
        if ((Normalize-Route $pathProperty.Name) -ne $normalized) {
            continue
        }

        foreach ($methodProperty in $pathProperty.Value.PSObject.Properties) {
            if ($methodProperty.Name.ToUpperInvariant() -eq $Method.ToUpperInvariant()) {
                return $methodProperty.Value
            }
        }
    }

    return $null
}

function Test-SchemaIsEmptyObject {
    param([object]$Schema)

    if ($null -eq $Schema) {
        return $false
    }

    $schemaType = [string]$Schema.type
    $hasReference = $null -ne $Schema.'$ref'
    $hasProperties = $null -ne $Schema.properties
    $hasItems = $null -ne $Schema.items
    $hasAdditionalProperties = $null -ne $Schema.additionalProperties
    $hasAllOf = $null -ne $Schema.allOf
    $hasOneOf = $null -ne $Schema.oneOf
    $hasAnyOf = $null -ne $Schema.anyOf

    return (-not $hasReference `
        -and -not $hasProperties `
        -and -not $hasItems `
        -and -not $hasAdditionalProperties `
        -and -not $hasAllOf `
        -and -not $hasOneOf `
        -and -not $hasAnyOf `
        -and $schemaType -eq "object")
}

function Get-ResponseCodes {
    param([object]$Operation)
    if ($null -eq $Operation.responses) {
        return @()
    }

    return @($Operation.responses.PSObject.Properties.Name)
}

function Test-HasSuccessResponse {
    param([object]$Operation)
    foreach ($code in (Get-ResponseCodes $Operation)) {
        if ($code -match "^2\d\d$") {
            return $true
        }
    }

    return $false
}

function Test-HasErrorResponse {
    param([object]$Operation)
    foreach ($code in (Get-ResponseCodes $Operation)) {
        if ($code -match "^[45]\d\d$") {
            return $true
        }
    }

    return $false
}

function Test-HasContentType {
    param(
        [object]$Content,
        [string[]]$ExpectedTypes
    )

    if ($null -eq $Content) {
        return $false
    }

    $actualTypes = @($Content.PSObject.Properties.Name)
    foreach ($expected in $ExpectedTypes) {
        if ($actualTypes -contains $expected) {
            return $true
        }
    }

    return $false
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$projectFullPath = Join-Path $root $ProjectPath
$apiProcess = $null
$warnings = New-Object System.Collections.Generic.List[string]

try {
    if ($StartApi) {
        Write-Step "Starting API"
        Assert-Condition (Test-Path -LiteralPath $projectFullPath) "Project file not found: $projectFullPath"

        $env:ASPNETCORE_URLS = $BaseUrl
        $env:ASPNETCORE_ENVIRONMENT = "Development"

        $apiProcess = Start-Process `
            -FilePath "dotnet" `
            -ArgumentList @("run", "--project", "`"$projectFullPath`"", "--no-build", "--urls", $BaseUrl) `
            -WorkingDirectory $root `
            -PassThru `
            -WindowStyle Hidden
    }

    Write-Step "Waiting for Swagger JSON"
    $swaggerUrl = "$BaseUrl/swagger/v1/swagger.json"
    $swagger = $null

    $deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
    do {
        try {
            $response = Invoke-WebRequest -Uri $swaggerUrl -UseBasicParsing -TimeoutSec 5
            Assert-Condition ($response.StatusCode -eq 200) "Swagger returned HTTP $($response.StatusCode)"
            $swagger = $response.Content | ConvertFrom-Json
            break
        }
        catch {
            if ((Get-Date) -ge $deadline) {
                throw "Swagger JSON did not become available at $swaggerUrl. Last error: $($_.Exception.Message)"
            }
            Start-Sleep -Seconds 2
        }
    } while ($true)

    Assert-Condition ($null -ne $swagger.paths) "Swagger JSON loaded but contains no paths section."
    Assert-Condition ($null -ne $swagger.components.schemas) "Swagger JSON loaded but contains no components.schemas section."

    Write-Step "Validating removed routes are absent"
    $actualRoutes = @{}
    foreach ($path in $swagger.paths.PSObject.Properties.Name) {
        $actualRoutes[(Normalize-Route $path)] = $true
    }

    $removedRoutes = @(
        "/api/health",
        "/api/agent/cachestats",
        "/api/MC/GetModels",
        "/api/MC/GetLatestConfig",
        "/api/MC/GetMCStatus",
        "/api/Updates/dashboard",
        "/api/Thumbnail/uploadimage/{requestId}"
    )

    foreach ($route in $removedRoutes) {
        $normalized = Normalize-Route $route
        Assert-Condition (-not $actualRoutes.ContainsKey($normalized)) "Removed route still appears in Swagger: $route"
        Write-Host "Absent: $route" -ForegroundColor Green
    }

    Write-Step "Validating required active routes and methods"
    $requiredOperations = @(
        @{ Route = "/api/agent/register"; Method = "POST" },
        @{ Route = "/api/agent/heartbeat"; Method = "POST" },
        @{ Route = "/api/agent/diagnostics"; Method = "POST" },
        @{ Route = "/api/agent/config/upload"; Method = "POST" },
        @{ Route = "/api/agent/syncmodels"; Method = "POST" },
        @{ Route = "/api/agent/synclogs"; Method = "POST" },
        @{ Route = "/api/agent/commandresult"; Method = "POST" },
        @{ Route = "/api/agent/uploadmodelfile"; Method = "POST" },
        @{ Route = "/api/agent/uploadlog/{requestId}"; Method = "POST" },
        @{ Route = "/api/Api/versions"; Method = "GET" },
        @{ Route = "/api/Api/lines"; Method = "GET" },
        @{ Route = "/api/Api/pcs"; Method = "GET" },
        @{ Route = "/api/Api/stats"; Method = "GET" },
        @{ Route = "/api/MC/UpdateConfig"; Method = "POST" },
        @{ Route = "/api/MC/DownloadConfig"; Method = "GET" },
        @{ Route = "/api/MC/ChangeModel"; Method = "POST" },
        @{ Route = "/api/MC/DownloadModel"; Method = "POST" },
        @{ Route = "/api/MC/DeleteMC"; Method = "POST" },
        @{ Route = "/api/MC/DeleteModel"; Method = "POST" },
        @{ Route = "/api/Updates/packages"; Method = "GET" },
        @{ Route = "/api/Updates/packages/{id}/download"; Method = "GET" },
        @{ Route = "/api/Updates/schedules"; Method = "GET" },
        @{ Route = "/api/Updates/schedules"; Method = "POST" },
        @{ Route = "/api/Updates/schedules/{id}/cancel"; Method = "POST" },
        @{ Route = "/api/Updates/schedules/{id}/rollback"; Method = "POST" },
        @{ Route = "/api/Bundle/scan"; Method = "POST" },
        @{ Route = "/api/Bundle/register"; Method = "POST" },
        @{ Route = "/api/LAI/scan"; Method = "POST" },
        @{ Route = "/api/LAI/register"; Method = "POST" },
        @{ Route = "/api/ModelLibrary"; Method = "GET" },
        @{ Route = "/api/ModelLibrary/upload"; Method = "POST" },
        @{ Route = "/api/ModelLibrary/apply"; Method = "POST" },
        @{ Route = "/api/ModelLibrary/request-download"; Method = "POST" },
        @{ Route = "/api/ModelLibrary/receive-upload/{requestId}"; Method = "POST" },
        @{ Route = "/api/ModelLibrary/check-status/{requestId}"; Method = "GET" },
        @{ Route = "/api/ModelManagement/lines/{version}"; Method = "GET" },
        @{ Route = "/api/LogAnalyzer/structure/{MCId}"; Method = "GET" },
        @{ Route = "/api/LogAnalyzer/file/{MCId}"; Method = "POST" },
        @{ Route = "/api/LogAnalyzer/images/{MCId}"; Method = "POST" },
        @{ Route = "/api/Thumbnail/upload"; Method = "POST" },
        @{ Route = "/api/Thumbnail/upload-binary/{requestId}"; Method = "POST" },
        @{ Route = "/api/Yield/summary"; Method = "GET" },
        @{ Route = "/api/YieldAlert/settings"; Method = "GET" },
        @{ Route = "/api/Shift/current"; Method = "GET" }
    )

    foreach ($expected in $requiredOperations) {
        $operation = Get-Operation -Swagger $swagger -Route $expected.Route -Method $expected.Method
        Assert-Condition ($null -ne $operation) "Required active operation missing from Swagger: $($expected.Method) $($expected.Route)"
        Write-Host "Present: $($expected.Method) $($expected.Route)" -ForegroundColor Green
    }

    Write-Step "Validating operation IDs, tags, responses, schemas, and rate-limit documentation"
    $emptySchemaFindings = New-Object System.Collections.Generic.List[string]
    $missingSuccessFindings = New-Object System.Collections.Generic.List[string]
    $missingErrorFindings = New-Object System.Collections.Generic.List[string]
    $missingOperationIdFindings = New-Object System.Collections.Generic.List[string]
    $missingTagFindings = New-Object System.Collections.Generic.List[string]
    $missingRateLimitFindings = New-Object System.Collections.Generic.List[string]
    $emptyRequestSchemaFindings = New-Object System.Collections.Generic.List[string]
    $missingPathParamFindings = New-Object System.Collections.Generic.List[string]

    foreach ($pathProperty in $swagger.paths.PSObject.Properties) {
        $path = $pathProperty.Name
        foreach ($methodProperty in $pathProperty.Value.PSObject.Properties) {
            $method = $methodProperty.Name.ToUpperInvariant()
            $operation = $methodProperty.Value
            $label = "$method $path"

            if ([string]::IsNullOrWhiteSpace([string]$operation.operationId)) {
                $missingOperationIdFindings.Add($label)
            }

            if ($null -eq $operation.tags -or @($operation.tags).Count -eq 0) {
                $missingTagFindings.Add($label)
            }

            if (-not (Test-HasSuccessResponse $operation)) {
                $missingSuccessFindings.Add($label)
            }

            if (-not ((Get-ResponseCodes $operation) -contains "429")) {
                $missingRateLimitFindings.Add($label)
            }

            if ($method -in @("POST", "PUT", "PATCH", "DELETE") -and -not (Test-HasErrorResponse $operation)) {
                $missingErrorFindings.Add($label)
            }

            if ($path -match "\{") {
                $routeParams = [regex]::Matches($path, "\{([^/}]+)\}") | ForEach-Object { $_.Groups[1].Value.ToLowerInvariant() }
                $swaggerPathParams = @()
                if ($null -ne $operation.parameters) {
                    $swaggerPathParams = @($operation.parameters | Where-Object { $_.in -eq "path" } | ForEach-Object { ([string]$_.name).ToLowerInvariant() })
                }

                foreach ($routeParam in $routeParams) {
                    if ($swaggerPathParams -notcontains $routeParam) {
                        $missingPathParamFindings.Add("$label missing path parameter '$routeParam'")
                    }
                }
            }

            if ($null -ne $operation.requestBody -and $null -ne $operation.requestBody.content) {
                foreach ($contentProperty in $operation.requestBody.content.PSObject.Properties) {
                    if (Test-SchemaIsEmptyObject $contentProperty.Value.schema) {
                        $emptyRequestSchemaFindings.Add("$label -> requestBody $($contentProperty.Name)")
                    }
                }
            }

            if ($null -eq $operation.responses) {
                continue
            }

            foreach ($responseProperty in $operation.responses.PSObject.Properties) {
                $response = $responseProperty.Value
                if ($null -eq $response.content) {
                    continue
                }

                foreach ($contentProperty in $response.content.PSObject.Properties) {
                    if (Test-SchemaIsEmptyObject $contentProperty.Value.schema) {
                        $emptySchemaFindings.Add("$label -> HTTP $($responseProperty.Name) $($contentProperty.Name)")
                    }
                }
            }
        }
    }

    Assert-Condition ($missingOperationIdFindings.Count -eq 0) "Operations missing operationId:`n$($missingOperationIdFindings -join "`n")"
    Assert-Condition ($missingTagFindings.Count -eq 0) "Operations missing tags:`n$($missingTagFindings -join "`n")"
    Assert-Condition ($missingSuccessFindings.Count -eq 0) "Operations missing documented 2xx success response:`n$($missingSuccessFindings -join "`n")"
    Assert-Condition ($missingErrorFindings.Count -eq 0) "Mutation/action operations missing documented 4xx/5xx error response:`n$($missingErrorFindings -join "`n")"
    Assert-Condition ($missingRateLimitFindings.Count -eq 0) "Operations missing documented 429 response:`n$($missingRateLimitFindings -join "`n")"
    Assert-Condition ($missingPathParamFindings.Count -eq 0) "Route path parameters missing from Swagger parameters:`n$($missingPathParamFindings -join "`n")"
    Assert-Condition ($emptyRequestSchemaFindings.Count -eq 0) "Found empty object request schemas:`n$($emptyRequestSchemaFindings -join "`n")"
    Assert-Condition ($emptySchemaFindings.Count -eq 0) "Found empty object response schemas:`n$($emptySchemaFindings -join "`n")"

    Write-Step "Validating multipart upload endpoints"
    $multipartRoutes = @(
        @{ Route = "/api/MC/UpdateConfig"; Method = "POST" },
        @{ Route = "/api/ModelLibrary/upload"; Method = "POST" },
        @{ Route = "/api/ModelLibrary/receive-upload/{requestId}"; Method = "POST" },
        @{ Route = "/api/agent/uploadmodelfile"; Method = "POST" },
        @{ Route = "/api/agent/uploadlog/{requestId}"; Method = "POST" },
        @{ Route = "/api/Thumbnail/upload-binary/{requestId}"; Method = "POST" },
        @{ Route = "/api/localmodel/upload/{sessionId}"; Method = "POST" }
    )

    foreach ($expected in $multipartRoutes) {
        $operation = Get-Operation -Swagger $swagger -Route $expected.Route -Method $expected.Method
        Assert-Condition ($null -ne $operation) "Multipart operation missing from Swagger: $($expected.Method) $($expected.Route)"
        Assert-Condition ($null -ne $operation.requestBody) "Multipart operation missing request body: $($expected.Method) $($expected.Route)"
        Assert-Condition (Test-HasContentType -Content $operation.requestBody.content -ExpectedTypes @("multipart/form-data")) "Multipart operation missing multipart/form-data content: $($expected.Method) $($expected.Route)"
        Write-Host "Multipart OK: $($expected.Method) $($expected.Route)" -ForegroundColor Green
    }

    Write-Step "Validating download/binary endpoints"
    $downloadRoutes = @(
        @{ Route = "/api/Updates/packages/{id}/download"; Method = "GET"; ContentTypes = @("application/octet-stream") },
        @{ Route = "/api/ModelLibrary/download/{id}"; Method = "GET"; ContentTypes = @("application/zip", "application/octet-stream") },
        @{ Route = "/api/ModelLibrary/serve-download/{requestId}"; Method = "GET"; ContentTypes = @("application/zip", "application/octet-stream") },
        @{ Route = "/api/agent/download/{modelFileId}"; Method = "GET"; ContentTypes = @("application/octet-stream") },
        @{ Route = "/api/MC/DownloadConfig"; Method = "GET"; ContentTypes = @("text/plain") },
        @{ Route = "/api/LogAnalyzer/image-content/{requestId}/{index}"; Method = "GET"; ContentTypes = @("image/bmp") },
        @{ Route = "/api/LogAnalyzer/fetch-image/{MCId}"; Method = "GET"; ContentTypes = @("image/bmp", "text/plain") }
    )

    foreach ($expected in $downloadRoutes) {
        $operation = Get-Operation -Swagger $swagger -Route $expected.Route -Method $expected.Method
        Assert-Condition ($null -ne $operation) "Download operation missing from Swagger: $($expected.Method) $($expected.Route)"
        $okResponse = $operation.responses.'200'
        Assert-Condition ($null -ne $okResponse) "Download operation missing HTTP 200 response: $($expected.Method) $($expected.Route)"
        Assert-Condition (Test-HasContentType -Content $okResponse.content -ExpectedTypes $expected.ContentTypes) "Download operation missing expected content type '$($expected.ContentTypes -join ", ")': $($expected.Method) $($expected.Route)"
        Write-Host "Download OK: $($expected.Method) $($expected.Route)" -ForegroundColor Green
    }

    if ($warnings.Count -gt 0) {
        Write-Step "Warnings"
        foreach ($warning in $warnings) {
            Write-Host $warning -ForegroundColor Yellow
        }
    }

    Write-Step "Swagger smoke test passed"
    Write-Host "Swagger URL: $swaggerUrl" -ForegroundColor Green
    $pathCount = @($swagger.paths.PSObject.Properties).Count
    $operationCount = 0
    foreach ($pathProperty in $swagger.paths.PSObject.Properties) {
        $operationCount += @($pathProperty.Value.PSObject.Properties).Count
    }
    Write-Host "Total paths: $pathCount" -ForegroundColor Green
    Write-Host "Total operations: $operationCount" -ForegroundColor Green
}
finally {
    if ($apiProcess -and -not $apiProcess.HasExited) {
        Stop-Process -Id $apiProcess.Id -Force
        $apiProcess.WaitForExit()
    }
}
