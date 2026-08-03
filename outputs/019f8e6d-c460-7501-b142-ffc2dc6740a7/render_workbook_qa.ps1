$ErrorActionPreference = "Stop"

$workbookPath = "E:\新AI工具人\outputs\019f8e6d-c460-7501-b142-ffc2dc6740a7\化妆品备案记录_30张图片汇总.xlsx"
$outputDir = "E:\新AI工具人\outputs\019f8e6d-c460-7501-b142-ffc2dc6740a7"
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

try {
    $book = $excel.Workbooks.Open($workbookPath, 0, $true)
    $targets = @(
        @{ Sheet = "图片明细"; Range = "A1:H18"; File = "qa_图片明细.png" },
        @{ Sheet = "去重汇总"; Range = "A1:H18"; File = "qa_去重汇总.png" },
        @{ Sheet = "统计说明"; Range = "A1:B26"; File = "qa_统计说明.png" }
    )

    foreach ($target in $targets) {
        $sheet = $book.Worksheets.Item($target.Sheet)
        $range = $sheet.Range($target.Range)
        $range.CopyPicture(1, 2)
        $chartObject = $sheet.ChartObjects().Add(0, 0, $range.Width, $range.Height)
        $chart = $chartObject.Chart
        $chart.Paste()
        $filePath = Join-Path $outputDir $target.File
        $chart.Export($filePath, "PNG") | Out-Null
        $chartObject.Delete()
        Write-Output $filePath
    }
}
finally {
    if ($book) {
        $book.Close($false)
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($book)
    }
    $excel.Quit()
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
