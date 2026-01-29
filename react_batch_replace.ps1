$path = "c:\Projects\MODAL MANAGEMENT\Github Code\22 jan\FactoryMonitoring\factory-react-ui\src"

Get-ChildItem -Path $path -Include "*.tsx", "*.ts", "*.css" -Recurse | ForEach-Object {
    $filePath = $_.FullName
    $content = Get-Content $filePath -Raw
    
    if ($content -eq $null) { return }
    
    # Replace type/interface property names
    $content = $content -replace '\bpcId\b', 'mcId'
    $content = $content -replace '\bpcNumber\b', 'mcNumber'
    $content = $content -replace '\bPCId\b', 'MCId'
    $content = $content -replace '\bPCNumber\b', 'MCNumber'
    
    # Replace component names
    $content = $content -replace '\bPCCard\b', 'MCCard'
    $content = $content -replace '\bPCDetailsModal\b', 'MCDetailsModal'
    $content = $content -replace '\bPCDetails\b', 'MCDetails'
    $content = $content -replace '\bEditPCModal\b', 'EditMCModal'
    $content = $content -replace '\bPCSelectionList\b', 'MCSelectionList'
    
    # Replace CSS class names
    $content = $content -replace '\.pc-card\b', '.mc-card'
    $content = $content -replace '\bpc-card\b', 'mc-card'
    $content = $content -replace '\.pc-details\b', '.mc-details'
    
    # Replace string literals and display text
    # Keep "PC X" display format as "MC-X" for UI labels
    $content = $content -replace '`PC \$\{', '`MC-${'
    $content = $content -replace '"PC "', '"MC-"'
    $content = $content -replace "'PC '", "'MC-'"
    $content = $content -replace 'PC \#', 'MC-'
    
    # Save file
    Set-Content -Path $filePath -Value $content -NoNewline
    
    Write-Host "Updated: $filePath"
}

Write-Host "React content update done!"
Write-Host ""
Write-Host "Now renaming component files..."

# Rename component files
$renames = @{
    "PCCard.tsx"          = "MCCard.tsx"
    "PCDetailsModal.tsx"  = "MCDetailsModal.tsx"
    "PCDetails.tsx"       = "MCDetails.tsx"
    "EditPCModal.tsx"     = "EditMCModal.tsx"
    "PCSelectionList.tsx" = "MCSelectionList.tsx"
}

foreach ($item in $renames.GetEnumerator()) {
    $files = Get-ChildItem -Path $path -Filter $item.Key -Recurse
    foreach ($file in $files) {
        $newName = Join-Path $file.DirectoryName $item.Value
        if ((Test-Path $newName) -eq $false) {
            Rename-Item -Path $file.FullName -NewName $item.Value
            Write-Host "Renamed: $($file.FullName) -> $($item.Value)"
        }
    }
}

Write-Host "React UI update complete!"
