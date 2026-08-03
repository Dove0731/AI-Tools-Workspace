param(
    [string[]]$ImagePaths,
    [string]$InputDirectory,
    [Parameter(Mandatory = $true)]
    [string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'

$winRtAssembly = Get-ChildItem -Path "$env:WINDIR\Microsoft.NET\assembly\GAC_MSIL\System.Runtime.WindowsRuntime" -Filter 'System.Runtime.WindowsRuntime.dll' -Recurse |
    Select-Object -First 1
if ($null -eq $winRtAssembly) {
    throw 'System.Runtime.WindowsRuntime.dll was not found.'
}
[void][Reflection.Assembly]::LoadFrom($winRtAssembly.FullName)
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Foundation, ContentType = WindowsRuntime]

function Await-WinRt {
    param(
        [Parameter(Mandatory = $true)]$AsyncOperation,
        [Parameter(Mandatory = $true)][Type]$ResultType
    )

    $asTaskMethod = [System.WindowsRuntimeSystemExtensions].GetMethods() |
        Where-Object {
            $_.Name -eq 'AsTask' -and
            $_.IsGenericMethodDefinition -and
            $_.GetParameters().Count -eq 1
        } |
        Select-Object -First 1

    $task = $asTaskMethod.MakeGenericMethod($ResultType).Invoke($null, @($AsyncOperation))
    $task.Wait()
    return $task.Result
}

$language = [Windows.Globalization.Language]::new('zh-Hans-CN')
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($language)
if ($null -eq $engine) {
    throw 'Windows OCR engine zh-Hans-CN is unavailable.'
}

New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null

if ($InputDirectory) {
    $ImagePaths = Get-ChildItem -LiteralPath $InputDirectory -Filter '*.png' -File |
        Where-Object { $_.Length -gt 0 } |
        Sort-Object Name |
        ForEach-Object { $_.FullName }
}
if (-not $ImagePaths -or $ImagePaths.Count -eq 0) {
    throw 'No input images were provided.'
}

$processed = 0
foreach ($imagePath in $ImagePaths) {
    $resolved = (Resolve-Path -LiteralPath $imagePath).Path
    $baseName = [IO.Path]::GetFileNameWithoutExtension($resolved)
    $textPath = Join-Path $OutputDirectory ($baseName + '.txt')
    if (Test-Path -LiteralPath $textPath) {
        $processed++
        continue
    }
    $file = Await-WinRt ([Windows.Storage.StorageFile]::GetFileFromPathAsync($resolved)) ([Windows.Storage.StorageFile])
    $stream = Await-WinRt ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $decoder = Await-WinRt ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap = Await-WinRt ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $result = Await-WinRt ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])

    $lineText = @($result.Lines | ForEach-Object { $_.Text }) -join [Environment]::NewLine
    [IO.File]::WriteAllText($textPath, $lineText, [Text.UTF8Encoding]::new($false))

    $stream.Dispose()
    $processed++
    if ($processed % 50 -eq 0) {
        Write-Output "Processed $processed / $($ImagePaths.Count)"
    }
}
Write-Output "Completed $processed / $($ImagePaths.Count)"
