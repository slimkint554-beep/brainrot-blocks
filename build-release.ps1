# Собирает релизную папку release/ (копия игры с DEV=false)
$root = $PSScriptRoot
$rel = Join-Path $root 'release'
if (Test-Path $rel) { Remove-Item $rel -Recurse -Force }
New-Item -ItemType Directory -Path $rel | Out-Null

Copy-Item (Join-Path $root 'index.html') (Join-Path $rel 'index.html')
Copy-Item (Join-Path $root 'css') (Join-Path $rel 'css') -Recurse
Copy-Item (Join-Path $root 'js') (Join-Path $rel 'js') -Recurse

$data = Join-Path $rel 'js\data.js'
$content = [System.IO.File]::ReadAllText($data, [System.Text.Encoding]::UTF8)
$content = $content -replace 'DEV: true', 'DEV: false'
[System.IO.File]::WriteAllText($data, $content, (New-Object System.Text.UTF8Encoding($false)))

Write-Host ('Release build ready: ' + $rel)

$zip = Join-Path $root 'release.zip'
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $rel '*') -DestinationPath $zip -Force
Write-Host ('ZIP ready: ' + $zip)
Write-Host 'Upload release/ folder or release.zip to your HTTPS host.'