<#
.SYNOPSIS
  Tiles the review frames from Tools\screenshot_sweep.ps1 into contact sheets (one image per map) with the shot id
  and note from Data\review_shots.json as captions, so a whole sweep can be read on a phone.
.PARAMETER Tag      Sweep tag (Saved\ReviewShots\<tag>). Default gate-0.
.PARAMETER Columns  Tiles per row. Default 3.
.PARAMETER TileWidth Width of each tile in px (16:9). Default 640.
.OUTPUTS Saved\ReviewShots\<tag>\sheet_<map>.jpg
#>
param(
    [string]$Tag = "gate-0",
    [int]$Columns = 3,
    [int]$TileWidth = 640
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
$repo = Split-Path -Parent $PSScriptRoot
$dir = Join-Path $repo "Saved\ReviewShots\$Tag"
$shots = (Get-Content -LiteralPath (Join-Path $repo "Data\review_shots.json") -Raw | ConvertFrom-Json).shots
$tileH = [int]($TileWidth * 9 / 16)
$capH = 44
$pad = 8
$font = New-Object System.Drawing.Font("Segoe UI", 13, [System.Drawing.FontStyle]::Regular)
$fontB = New-Object System.Drawing.Font("Segoe UI", 13, [System.Drawing.FontStyle]::Bold)
$white = [System.Drawing.Brushes]::White
$bg = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(24, 24, 28))
$outputs = @()
foreach ($map in ($shots | Select-Object -ExpandProperty map -Unique)) {
    $items = @($shots | Where-Object { $_.map -eq $map -and (Test-Path -LiteralPath (Join-Path $dir ("{0}.png" -f $_.id))) })
    if ($items.Count -eq 0) { continue }
    $rows = [math]::Ceiling($items.Count / $Columns)
    $w = $Columns * ($TileWidth + $pad) + $pad
    $h = $rows * ($tileH + $capH + $pad) + $pad + 40
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.FillRectangle($bg, 0, 0, $w, $h)
    $g.DrawString(("HELLFALL {0}  -  {1}  ({2} shots)" -f $Tag, $map, $items.Count), $fontB, $white, $pad, 10)
    $i = 0
    foreach ($s in $items) {
        $col = $i % $Columns; $row = [math]::Floor($i / $Columns)
        $x = $pad + $col * ($TileWidth + $pad); $y = 40 + $pad + $row * ($tileH + $capH + $pad)
        $img = [System.Drawing.Image]::FromFile((Join-Path $dir ("{0}.png" -f $s.id)))
        $g.DrawImage($img, $x, $y, $TileWidth, $tileH)
        $img.Dispose()
        $g.DrawString($s.id, $fontB, $white, $x, $y + $tileH + 2)
        $g.DrawString($s.note, $font, $white, $x, $y + $tileH + 22)
        $i++
    }
    $g.Dispose()
    $out = Join-Path $dir ("sheet_{0}.jpg" -f $map)
    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
    $params = New-Object System.Drawing.Imaging.EncoderParameters 1
    $params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality, [long]82)
    $bmp.Save($out, $codec, $params)
    $bmp.Dispose()
    Write-Host ("HELLFALL: contact sheet {0} ({1} x {2}, {3:N1} MB)" -f $out, $w, $h, ((Get-Item $out).Length / 1MB))
    $outputs += $out
}
if ($outputs.Count -eq 0) { throw "No frames found under $dir" }
