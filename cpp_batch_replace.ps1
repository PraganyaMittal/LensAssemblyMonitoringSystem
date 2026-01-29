$path = "c:\Projects\MODAL MANAGEMENT\Github Code\22 jan\FactoryMonitoring\FactoryAgent"

# Exclude third_party folder to avoid modifying library code
$excludePaths = @("third_party")

Get-ChildItem -Path $path -Include "*.cpp", "*.h", "*.hpp" -Recurse | 
Where-Object { 
    $filePath = $_.FullName
    -not ($excludePaths | Where-Object { $filePath -like "*\$_\*" })
} |
ForEach-Object {
    $filePath = $_.FullName
    $content = Get-Content $filePath -Raw
        
    if ($content -eq $null) { return }
        
    # Perform replacements - careful with case sensitivity for JSON keys vs C++ variables
    # JSON keys (for server communication) use camelCase: pcId, pcNumber
    # C++ struct members also use camelCase: pcId, pcNumber
        
    # Replace struct member names
    $content = $content -replace '\bpcId\b', 'mcId'
    $content = $content -replace '\bpcNumber\b', 'mcNumber'
        
    # Replace JSON key strings for server communication
    $content = $content -replace '"pcId"', '"mcId"'
    $content = $content -replace '"pcNumber"', '"mcNumber"'
    $content = $content -replace '"PCNumber"', '"MCNumber"'
    $content = $content -replace '"PCId"', '"MCId"'
        
    # Replace comments mentioning PCId/PCNumber  
    $content = $content -replace '\bPCId\b', 'MCId'
    $content = $content -replace '\bPCNumber\b', 'MCNumber'
        
    # Save file
    Set-Content -Path $filePath -Value $content -NoNewline
        
    Write-Host "Updated: $filePath"
}

Write-Host "C++ Agent update done!"
