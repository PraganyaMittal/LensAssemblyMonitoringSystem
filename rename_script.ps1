$replacementsList = @(
    [pscustomobject]@{ Old="FactoryMonitoringSystem"; New="LensAssemblyMonitoringSystem" },
    [pscustomobject]@{ Old="factoryMonitoringSystem"; New="lensAssemblyMonitoringSystem" },
    [pscustomobject]@{ Old="FactoryMonitoringWeb"; New="LensAssemblyMonitoringWeb" },
    [pscustomobject]@{ Old="factoryMonitoringWeb"; New="lensAssemblyMonitoringWeb" },
    [pscustomobject]@{ Old="FactoryMonitoringException"; New="LensAssemblyMonitoringException" },
    [pscustomobject]@{ Old="FactoryMonitoringDB"; New="LensAssemblyMonitoringDB" },
    [pscustomobject]@{ Old="FactoryMonitoring"; New="LensAssemblyMonitoring" },
    [pscustomobject]@{ Old="factoryMonitoring"; New="lensAssemblyMonitoring" },
    [pscustomobject]@{ Old="factory-monitoring"; New="lens-assembly-monitoring" },
    [pscustomobject]@{ Old="FactoryService"; New="LensAssemblyService" },
    [pscustomobject]@{ Old="factoryService"; New="lensAssemblyService" },
    [pscustomobject]@{ Old="FactoryAgentSingleInstanceMutex"; New="LensAssemblyAgentSingleInstanceMutex" },
    [pscustomobject]@{ Old="FactoryAgentClass"; New="LensAssemblyAgentClass" },
    [pscustomobject]@{ Old="FACTORYAGENT"; New="LENSASSEMBLYAGENT" },
    [pscustomobject]@{ Old="FactoryAgent"; New="LensAssemblyAgent" },
    [pscustomobject]@{ Old="factoryAgent"; New="lensAssemblyAgent" },
    [pscustomobject]@{ Old="factory-react-ui"; New="lens-assembly-react-ui" },
    [pscustomobject]@{ Old="FactoryDbContextModelSnapshot"; New="LensAssemblyDbContextModelSnapshot" },
    [pscustomobject]@{ Old="FactoryDbContext"; New="LensAssemblyDbContext" },
    [pscustomobject]@{ Old="factoryDbContext"; New="lensAssemblyDbContext" },
    [pscustomobject]@{ Old="FactoryMCRepository"; New="LensAssemblyMCRepository" },
    [pscustomobject]@{ Old="IFactoryMCRepository"; New="ILensAssemblyMCRepository" },
    [pscustomobject]@{ Old="FactoryMCs"; New="LensAssemblyMCs" },
    [pscustomobject]@{ Old="FactoryMC"; New="LensAssemblyMC" },
    [pscustomobject]@{ Old="factoryMC"; New="lensAssemblyMC" },
    [pscustomobject]@{ Old="FactoryPC"; New="LensAssemblyPC" },
    [pscustomobject]@{ Old="factoryPC"; New="lensAssemblyPC" },
    [pscustomobject]@{ Old="FactoryUpdatePipe"; New="LensAssemblyUpdatePipe" },
    [pscustomobject]@{ Old="FactoryUpdateService"; New="LensAssemblyUpdateService" },
    [pscustomobject]@{ Old="FactoryLogs"; New="LensAssemblyLogs" },
    [pscustomobject]@{ Old="FactoryDownloads"; New="LensAssemblyDownloads" },
    [pscustomobject]@{ Old="FactoryUploads"; New="LensAssemblyUploads" },
    [pscustomobject]@{ Old="factory-main"; New="lens-assembly-main" },
    [pscustomobject]@{ Old="factory-sidebar"; New="lens-assembly-sidebar" },
    [pscustomobject]@{ Old="factory-theme"; New="lens-assembly-theme" },
    [pscustomobject]@{ Old="factory-container"; New="lens-assembly-container" }
)

# Sort by length descending to replace longer matches first
$replacementsList = $replacementsList | Sort-Object { $_.Old.Length } -Descending

$excludeDirs = @('.git', 'node_modules', 'bin', 'obj', '.vs', 'x64', 'Debug', 'Release', 'build')
$fileExtensions = @('.cs', '.cpp', '.h', '.tsx', '.ts', '.js', '.css', '.sql', '.sln', '.csproj', '.vcxproj', '.filters', '.user', '.html', '.bat', '.md', '.json', '.txt', '.target', '.props', '.xml')

$rootDir = "c:\Projects\MODAL MANAGEMENT\Github Code\16 mar Latest\FactoryMonitoring"

Write-Host "--- PHASE 1: Content Replacement ---"
$files = Get-ChildItem -Path $rootDir -Recurse -File -Force | Where-Object {
    $path = $_.FullName
    $keep = $true
    foreach ($dir in $excludeDirs) {
        if ($path -match "\\$dir\\") { $keep = $false; break }
    }
    if ($keep) {
        $ext = $_.Extension.ToLower()
        if ($fileExtensions -notcontains $ext -and $_.Name -notin @("package.json", "package-lock.json", ".env", ".gitignore")) {
            $keep = $false
        }
    }
    $keep
}

foreach ($f in $files) {
    try {
        $content = [System.IO.File]::ReadAllText($f.FullName, [System.Text.Encoding]::UTF8)
        $original = $content
        
        foreach ($r in $replacementsList) {
            $content = $content.Replace($r.Old, $r.New)
        }
        
        if ($content -cne $original) {
            [System.IO.File]::WriteAllText($f.FullName, $content, [System.Text.Encoding]::UTF8)
            Write-Host "Updated content inside: $($f.FullName)"
        }
    } catch {
        # Silent skip
    }
}

Write-Host "`n--- PHASE 2: File Renaming ---"
$filesToRename = Get-ChildItem -Path $rootDir -Recurse -File -Force | Where-Object {
    $path = $_.FullName
    $keep = $true
    foreach ($dir in $excludeDirs) {
        if ($path -match "\\$dir\\") { $keep = $false; break }
    }
    $keep
}

foreach ($f in $filesToRename) {
    $newName = $f.Name
    foreach ($r in $replacementsList) {
        $newName = $newName.Replace($r.Old, $r.New)
    }
    if ($newName -cne $f.Name) {
        Rename-Item -Path $f.FullName -NewName $newName -Force -ErrorAction SilentlyContinue
        Write-Host "Renamed file: $($f.Name) -> $newName"
    }
}

Write-Host "`n--- PHASE 3: Directory Renaming ---"
$dirsToRename = Get-ChildItem -Path $rootDir -Recurse -Directory -Force | Where-Object {
    $path = $_.FullName
    $keep = $true
    foreach ($dir in $excludeDirs) {
        if ($path -match "\\$dir\\") { $keep = $false; break }
    }
    if ($excludeDirs -contains $_.Name) { $keep = $false }
    $keep
} | Sort-Object { $_.FullName.Length } -Descending

foreach ($d in $dirsToRename) {
    $newName = $d.Name
    foreach ($r in $replacementsList) {
        $newName = $newName.Replace($r.Old, $r.New)
    }
    if ($newName -cne $d.Name) {
        Rename-Item -Path $d.FullName -NewName $newName -Force -ErrorAction SilentlyContinue
        Write-Host "Renamed dir: $($d.Name) -> $newName"
    }
}

Write-Host "Done!"
