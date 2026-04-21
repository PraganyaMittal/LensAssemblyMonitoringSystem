$files = Get-ChildItem -Path . -Recurse -Include *.json -Exclude node_modules\* | Where-Object { $_.FullName -notmatch '\\node_modules\\' }

foreach ($f in $files) {
    if ($f.Length -ge 3) {
        $bytes = [System.IO.File]::ReadAllBytes($f.FullName)
        if ($bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191) {
            $newBytes = new-object byte[] ($bytes.Length - 3)
            [System.Array]::Copy($bytes, 3, $newBytes, 0, $newBytes.Length)
            [System.IO.File]::WriteAllBytes($f.FullName, $newBytes)
            Write-Host "Removed BOM from $($f.FullName)"
        }
    }
}
