# Lightweight Sync Spread Test (No background jobs)
# Tests a small sample of agents to verify timing

param(
    [string]$BaseUrl = "http://localhost:5000/api/agent/synclogs"
)

Write-Host "=== Lightweight Sync Spread Test ===" -ForegroundColor Cyan
Write-Host "Testing 20 sample agents (not 500) to verify timing"
Write-Host ""

$startTime = Get-Date
Write-Host "Start time: $($startTime.ToString('HH:mm:ss.fff'))" -ForegroundColor Yellow

# Test only key timings (first, middle, last of each version)
$testCases = @(
    @{ Version = "3.5"; Line = 1; PC = 1; ExpectedDelay = 0 }
    @{ Version = "3.5"; Line = 1; PC = 5; ExpectedDelay = 140 }
    @{ Version = "3.5"; Line = 5; PC = 1; ExpectedDelay = 1428 }
    @{ Version = "3.5"; Line = 10; PC = 5; ExpectedDelay = 3356 }
    @{ Version = "3.5"; Line = 14; PC = 1; ExpectedDelay = 4641 }
    @{ Version = "3.5"; Line = 20; PC = 5; ExpectedDelay = 6783 }
    @{ Version = "3.5"; Line = 28; PC = 10; ExpectedDelay = 9964 }
    @{ Version = "4.0"; Line = 1; PC = 1; ExpectedDelay = 10000 }
    @{ Version = "4.0"; Line = 5; PC = 5; ExpectedDelay = 11568 }
    @{ Version = "4.0"; Line = 13; PC = 1; ExpectedDelay = 14284 }
    @{ Version = "4.0"; Line = 20; PC = 10; ExpectedDelay = 17143 }
    @{ Version = "4.0"; Line = 26; PC = 10; ExpectedDelay = 19286 }
)

Write-Host "`nVersion | Line | PC | Expected Delay | Actual Delay | Status" -ForegroundColor Green
Write-Host "--------|------|----|--------------:|-------------:|-------"

foreach ($test in $testCases) {
    # Calculate delay using same formula as C++ code
    $VERSION_WINDOW_MS = 10000
    $MAX_LINES = 28
    $MAX_PCS = 10
    
    $versionOffset = if ($test.Version -eq "4.0") { 10000 } else { 0 }
    $msPerLine = [int]($VERSION_WINDOW_MS / $MAX_LINES)
    $msPerPc = [int]($msPerLine / $MAX_PCS)
    
    $lineSlot = ($test.Line - 1) * $msPerLine
    $pcSlot = ($test.PC - 1) * $msPerPc
    $calculatedDelay = $versionOffset + $lineSlot + $pcSlot
    
    $status = if ([Math]::Abs($calculatedDelay - $test.ExpectedDelay) -lt 50) { "OK" } else { "MISMATCH" }
    
    Write-Host ("{0,-7} | {1,4} | {2,2} | {3,12}ms | {4,11}ms | {5}" -f $test.Version, $test.Line, $test.PC, $test.ExpectedDelay, $calculatedDelay, $status)
}

Write-Host "`n=== Sending Real Requests ===" -ForegroundColor Cyan
Write-Host "Sending 5 test requests to server (first of each section)...`n"

$testRequests = @(
    @{ Version = "3.5"; Line = 1; PC = 1; PcId = 1001 }
    @{ Version = "3.5"; Line = 14; PC = 5; PcId = 1145 }
    @{ Version = "3.5"; Line = 28; PC = 10; PcId = 1280 }
    @{ Version = "4.0"; Line = 1; PC = 1; PcId = 2001 }
    @{ Version = "4.0"; Line = 26; PC = 10; PcId = 2260 }
)

foreach ($req in $testRequests) {
    # Calculate delay
    $versionOffset = if ($req.Version -eq "4.0") { 10000 } else { 0 }
    $msPerLine = 357
    $msPerPc = 35
    $delay = $versionOffset + ($req.Line - 1) * $msPerLine + ($req.PC - 1) * $msPerPc
    
    Write-Host "Waiting ${delay}ms for V$($req.Version) L$($req.Line) P$($req.PC)..." -NoNewline
    Start-Sleep -Milliseconds $delay
    
    $sendTime = Get-Date
    try {
        $body = @{ 
            pcId             = $req.PcId
            logStructureJson = "[{`"test`": true}]" 
        } | ConvertTo-Json
        
        Invoke-RestMethod -Uri $BaseUrl -Method Post -Body $body -ContentType "application/json" -TimeoutSec 10 | Out-Null
        Write-Host " Sent at $($sendTime.ToString('HH:mm:ss.fff'))" -ForegroundColor Green
    }
    catch {
        Write-Host " FAILED: $($_.Exception.Message)" -ForegroundColor Red
    }
    
    # Reset delay for next request (subtract what we already waited)
    $startTime = Get-Date
}

$endTime = Get-Date
Write-Host "`n=== Complete ===" -ForegroundColor Cyan
Write-Host "Check server logs for [SYNC TIMING] entries"
Write-Host "Total test duration: $([math]::Round(($endTime - $startTime).TotalSeconds, 2)) seconds"
