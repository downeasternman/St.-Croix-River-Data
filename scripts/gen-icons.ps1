Add-Type -AssemblyName System.Drawing

function New-Icon {
    param([int]$Size, [string]$OutPath)
    $bmp = New-Object System.Drawing.Bitmap $Size, $Size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::FromArgb(255, 29, 78, 216))
    $w = [Math]::Max(3, [int]($Size / 22))
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 147, 197, 253), $w)
    $rectW = [int]($Size * 0.76)
    $rectH = [int]($Size * 0.4)
    $x = [int]($Size * 0.12)
    $y = [int]($Size * 0.32)
    $g.DrawArc($pen, $x, $y, $rectW, $rectH, 190, 160)
    $bmp.SetResolution(96, 96)
    $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
}

$root = Split-Path -Parent $PSScriptRoot
New-Icon -Size 192 -OutPath (Join-Path $root "public/icon-192.png")
New-Icon -Size 512 -OutPath (Join-Path $root "public/icon-512.png")
Write-Host "Icons written."
