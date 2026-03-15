$TargetDir = "d:\Projects\FactoryMonitoring"

$Files = Get-ChildItem -Path $TargetDir -Filter "*.cs" -Recurse

foreach ($File in $Files) {
    $content = Get-Content -Path $File.FullName -Raw
    $original = $content
    
    # 1. Remove `// ====...` lines including any text after it on the same line
    $content = $content -replace '(?m)^\s*//\s*={5,}.*\r?\n', ''
    
    # 2. Remove `/// Feature...` comments
    $content = $content -replace '(?m)^\s*///\s*Feature.*\r?\n', ''
    
    # 3. Remove specific robotic TODOs
    $content = $content -replace '(?m)\s*// TODO: Replace with authenticated user', ''
    
    if ($content -ne $original) {
        [System.IO.File]::WriteAllText($File.FullName, $content, [System.Text.Encoding]::UTF8)
        Write-Host "Modified: $($File.FullName)"
    }
}
Write-Host "Cleanup Complete."
