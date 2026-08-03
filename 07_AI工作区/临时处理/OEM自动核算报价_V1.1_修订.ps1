param(
    [ValidateSet('Inspect','Build','Verify')]
    [string]$Mode,
    [string]$Source,
    [string]$Output,
    [string]$PreviewDir
)

$ErrorActionPreference = 'Stop'

function Release-ComObject {
    param($Object)
    if ($null -ne $Object) {
        try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($Object) } catch {}
    }
}

function Set-CellValue {
    param($Sheet, [string]$Address, $Value)
    $cell = $Sheet.Range($Address)
    try {
        if ($null -eq $Value) {
            $cell.ClearContents() | Out-Null
        }
        elseif ($Value -is [byte] -or $Value -is [int16] -or $Value -is [int32] -or $Value -is [int64] -or $Value -is [single] -or $Value -is [double] -or $Value -is [decimal]) {
            $cell.Value2 = [double]$Value
        }
        else {
            $cell.Value2 = [string]$Value
        }
    } finally { Release-ComObject $cell }
}

function Set-CellFormula {
    param($Sheet, [string]$Address, [string]$Formula)
    $cell = $Sheet.Range($Address)
    try { $cell.Formula = $Formula } finally { Release-ComObject $cell }
}

function Export-RangePng {
    param($Sheet, [string]$Address, [string]$Path)
    $range = $null
    $charts = $null
    $chartObject = $null
    $chart = $null
    try {
        $range = $Sheet.Range($Address)
        $range.CopyPicture(1, 2)
        Start-Sleep -Milliseconds 400
        $charts = $Sheet.ChartObjects()
        $width = [Math]::Max(500, [double]$range.Width)
        $height = [Math]::Max(300, [double]$range.Height)
        $chartObject = $charts.Add(0, 0, $width, $height)
        $chart = $chartObject.Chart
        $chart.Paste() | Out-Null
        Start-Sleep -Milliseconds 250
        $exportResult = $chart.Export($Path, 'PNG')
        if ((-not $exportResult) -and (-not (Test-Path -LiteralPath $Path))) { throw "PNG export failed: $Path" }
    }
    finally {
        if ($null -ne $chartObject) { try { $chartObject.Delete() } catch {} }
        Release-ComObject $chart
        Release-ComObject $chartObject
        Release-ComObject $charts
        Release-ComObject $range
    }
}

function New-ExcelApplication {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $excel.ScreenUpdating = $false
    $excel.EnableEvents = $false
    return $excel
}

if (-not (Test-Path -LiteralPath $Source)) { throw "Source not found: $Source" }
New-Item -ItemType Directory -Path $PreviewDir -Force | Out-Null

if ($Mode -eq 'Inspect') {
    $excel = $null
    $workbook = $null
    $sheetCost = $null
    $sheetPrice = $null
    try {
        $excel = New-ExcelApplication
        $workbook = $excel.Workbooks.Open($Source, 0, $true)
        $sheetCost = $workbook.Worksheets.Item('冻干半成品-成本')
        $sheetPrice = $workbook.Worksheets.Item('冻干类报价')
        Export-RangePng $sheetCost 'A1:Q26' (Join-Path $PreviewDir 'source_freezedry_semifinished_A1-Q26.png')
        Export-RangePng $sheetPrice 'A1:M41' (Join-Path $PreviewDir 'source_freezedry_price_A1-M41.png')
        [pscustomobject]@{
            Mode = 'Inspect'
            Sheets = $workbook.Worksheets.Count
            Preview1 = (Join-Path $PreviewDir 'source_freezedry_semifinished_A1-Q26.png')
            Preview2 = (Join-Path $PreviewDir 'source_freezedry_price_A1-M41.png')
        } | ConvertTo-Json -Compress
    }
    finally {
        if ($null -ne $workbook) { try { $workbook.Close($false) } catch {} }
        if ($null -ne $excel) { try { $excel.Quit() } catch {} }
        Release-ComObject $sheetPrice
        Release-ComObject $sheetCost
        Release-ComObject $workbook
        Release-ComObject $excel
        [GC]::Collect(); [GC]::WaitForPendingFinalizers()
    }
    exit
}

if ($Mode -eq 'Build') {
    $outputDir = Split-Path -Parent $Output
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
    Copy-Item -LiteralPath $Source -Destination $Output -Force

    $excel = $null
    $workbook = $null
    $sheet = $null
    $sourceSheet = $null
    try {
        $excel = New-ExcelApplication
        $workbook = $excel.Workbooks.Open($Output)

        foreach ($existing in @($workbook.Worksheets)) {
            try {
                if ($existing.Name -eq '冻干粉自动核价_V1.1') { $existing.Delete() }
            } finally { Release-ComObject $existing }
        }

        $firstSheet = $workbook.Worksheets.Item(1)
        $sheet = $workbook.Worksheets.Add($firstSheet)
        Release-ComObject $firstSheet
        $sheet.Name = '冻干粉自动核价_V1.1'
        $sourceSheet = $workbook.Worksheets.Item('冻干半成品-成本')

        $sheet.Cells.Font.Name = '微软雅黑'
        $sheet.Cells.Font.Size = 10
        $sheet.Cells.VerticalAlignment = -4108
        $sheet.Activate() | Out-Null
        $excel.ActiveWindow.DisplayGridlines = $false

        $sheet.Range('A1:H1').Merge()
        Set-CellValue $sheet 'A1' 'OEM冻干粉自动核价 V1.1'
        $sheet.Range('A1:H1').Interior.Color = 7958047
        $sheet.Range('A1:H1').Font.Color = 16777215
        $sheet.Range('A1:H1').Font.Bold = $true
        $sheet.Range('A1:H1').Font.Size = 16
        $sheet.Range('A1:H1').HorizontalAlignment = -4108
        $sheet.Rows.Item(1).RowHeight = 30

        $sheet.Range('A2:H2').Merge()
        Set-CellValue $sheet 'A2' '价格源：冻干半成品-成本 M:Q 最新更新单价｜1万—49.9万自动取价｜50万以上人工审核｜不含税、不含运费'
        $sheet.Range('A2:H2').Interior.Color = 16247773
        $sheet.Range('A2:H2').Font.Color = 5263440
        $sheet.Range('A2:H2').HorizontalAlignment = -4108
        $sheet.Range('A2:H2').WrapText = $true
        $sheet.Rows.Item(2).RowHeight = 34

        Set-CellValue $sheet 'A4' '产品/规格'
        Set-CellValue $sheet 'A5' '订单数量'
        Set-CellValue $sheet 'A6' '申请/成交价（可空）'
        Set-CellValue $sheet 'A7' '标准报价'
        Set-CellValue $sheet 'A8' '最新成本价'
        Set-CellValue $sheet 'A9' '实际核价单价'
        Set-CellValue $sheet 'A10' '预计毛利率'
        Set-CellValue $sheet 'A11' '产品定位'
        Set-CellValue $sheet 'A12' '报价状态'
        Set-CellValue $sheet 'A13' '价格口径'

        Set-CellValue $sheet 'B4' '冻干粉3ml（透明裸瓶）'
        Set-CellValue $sheet 'B5' 10000
        Set-CellValue $sheet 'B6' $null
        Set-CellFormula $sheet 'B7' '=IF(OR(B4="",B5=""),"",IF(B5<10000,"人工审核",IF(B5>=500000,"人工审核",IFERROR(INDEX($C$18:$G$31,MATCH(B4,$A$18:$A$31,0),MATCH(B5,$C$34:$G$34,1)),"人工审核"))))'
        Set-CellFormula $sheet 'B8' '=IFERROR(INDEX($B$18:$B$31,MATCH(B4,$A$18:$A$31,0)),"")'
        Set-CellFormula $sheet 'B9' '=IF(B6="",IF(ISNUMBER(B7),B7,""),B6)'
        Set-CellFormula $sheet 'B10' '=IFERROR((B9-B8)/B9,"")'
        Set-CellFormula $sheet 'B11' '=IFERROR(INDEX($H$18:$H$31,MATCH(B4,$A$18:$A$31,0)),"")'
        Set-CellFormula $sheet 'B12' '=IF(OR(B4="",B5=""),"待输入",IF(OR(B5<10000,B5>=500000),"人工审核",IF(NOT(ISNUMBER(B7)),"人工审核",IF(B6="","标准报价",IF(B6<B7,"低于标准价：按现有规则审核",IF(B10<IF(OR(B11="加强版-高",B11="引流版-高"),20%,15%),"毛利低于门槛：按现有规则审核","可报价"))))))'
        Set-CellValue $sheet 'B13' '不含税、不含运费'

        $sheet.Range('A4:A13').Interior.Color = 14277081
        $sheet.Range('A4:A13').Font.Bold = $true
        $sheet.Range('B4:B6').Interior.Color = 13434879
        $sheet.Range('B7:B13').Interior.Color = 14811135
        $sheet.Range('A4:B13').Borders.LineStyle = 1
        $sheet.Range('A4:B13').Borders.Color = 14277081
        $sheet.Range('B5').NumberFormat = '#,##0'
        $sheet.Range('B6:B9').NumberFormat = '0.000'
        $sheet.Range('B10').NumberFormat = '0.0%'
        $sheet.Range('B12').Font.Bold = $true
        $sheet.Range('B4:B13').HorizontalAlignment = -4131

        $validation = $sheet.Range('B4').Validation
        try {
            try { $validation.Delete() } catch {}
            $validation.Add(3, 1, 1, '=$A$18:$A$31')
            $validation.IgnoreBlank = $true
            $validation.InCellDropdown = $true
            $validation.ErrorTitle = '产品不在最新价格矩阵'
            $validation.ErrorMessage = '请选择下方价格矩阵中的产品。'
            $validation.ShowError = $true
        } finally { Release-ComObject $validation }

        $sheet.Range('A16:H16').Merge()
        Set-CellValue $sheet 'A16' '最新有效价格矩阵（实时引用冻干半成品-成本，不引用旧毛利断链列K）'
        $sheet.Range('A16:H16').Interior.Color = 7958047
        $sheet.Range('A16:H16').Font.Color = 16777215
        $sheet.Range('A16:H16').Font.Bold = $true

        $headers = @('产品/规格','成本价','1万—2.9万','3万—4.9万','5万—9.9万','10万—19.9万','20万—49.9万','产品定位')
        for ($c = 1; $c -le 8; $c++) { Set-CellValue $sheet ([char](64+$c) + '17') $headers[$c-1] }
        $sheet.Range('A17:H17').Interior.Color = 13998939
        $sheet.Range('A17:H17').Font.Color = 16777215
        $sheet.Range('A17:H17').Font.Bold = $true
        $sheet.Range('A17:H17').HorizontalAlignment = -4108

        for ($i = 0; $i -lt 14; $i++) {
            $row = 18 + $i
            $sourceRow = 12 + $i
            Set-CellFormula $sheet ("A$row") ("='冻干半成品-成本'!G$sourceRow")
            Set-CellFormula $sheet ("B$row") ("='冻干半成品-成本'!I$sourceRow")
            Set-CellFormula $sheet ("C$row") ("='冻干半成品-成本'!M$sourceRow")
            Set-CellFormula $sheet ("D$row") ("='冻干半成品-成本'!N$sourceRow")
            Set-CellFormula $sheet ("E$row") ("='冻干半成品-成本'!O$sourceRow")
            Set-CellFormula $sheet ("F$row") ("='冻干半成品-成本'!P$sourceRow")
            Set-CellFormula $sheet ("G$row") ("='冻干半成品-成本'!Q$sourceRow")
            Set-CellFormula $sheet ("H$row") ("='冻干半成品-成本'!D$sourceRow")
        }
        $sheet.Range('A18:H31').Borders.LineStyle = 1
        $sheet.Range('A18:H31').Borders.Color = 14277081
        $sheet.Range('B18:G31').NumberFormat = '0.000'
        $sheet.Range('A18:A31').WrapText = $true
        $sheet.Range('A18:H31').Interior.Color = 15921906

        Set-CellValue $sheet 'C34' 10000
        Set-CellValue $sheet 'D34' 30000
        Set-CellValue $sheet 'E34' 50000
        Set-CellValue $sheet 'F34' 100000
        Set-CellValue $sheet 'G34' 200000
        $sheet.Rows.Item(34).Hidden = $true

        $sheet.Range('A36:H36').Merge()
        Set-CellValue $sheet 'A36' '审核与使用说明'
        $sheet.Range('A36:H36').Interior.Color = 7958047
        $sheet.Range('A36:H36').Font.Color = 16777215
        $sheet.Range('A36:H36').Font.Bold = $true
        $notes = @(
            '1. 1万以下及50万以上均不自动给价，必须人工审核。',
            '2. 标准价实时引用冻干半成品-成本 M:Q 的最新更新单价；更新原矩阵后本页同步更新。',
            '3. 标准价均为不含税、不含运费；税费、运费另行核算。',
            '4. 低于标准价按现有规则审核：高配/高引流按第五档底价及20%门槛，常规/低引流/低加强按15%门槛。',
            '5. 原工作簿其余45个断链单元格本次忽略；本页不引用旧K列或其他#REF!单元格。',
            '6. 版本：V1.1｜规则确认日期：2026-07-20｜核价表管理员/批准人：待补。'
        )
        for ($i = 0; $i -lt $notes.Count; $i++) {
            $r = 37 + $i
            $noteRange = "A${r}:H${r}"
            $sheet.Range($noteRange).Merge() | Out-Null
            Set-CellValue $sheet ("A$r") $notes[$i]
            $sheet.Range($noteRange).WrapText = $true
            $sheet.Range($noteRange).Interior.Color = 16247773
        }

        $sheet.Columns.Item('A').ColumnWidth = 34
        $sheet.Columns.Item('B').ColumnWidth = 18
        foreach ($col in @('C','D','E','F','G')) { $sheet.Columns.Item($col).ColumnWidth = 14 }
        $sheet.Columns.Item('H').ColumnWidth = 18
        $sheet.Rows.Item('18:31').RowHeight = 28
        $sheet.Rows.Item('37:42').RowHeight = 34
        $sheet.PageSetup.Orientation = 2
        $sheet.PageSetup.Zoom = $false
        $sheet.PageSetup.FitToPagesWide = 1
        $sheet.PageSetup.FitToPagesTall = $false
        $sheet.PageSetup.PrintArea = '$A$1:$H$42'

        $formatConditions = $sheet.Range('B12').FormatConditions
        try {
            $formatConditions.Delete()
            $fc1 = $formatConditions.Add(2, 0, '=$B$12="可报价"')
            $fc1.Interior.Color = 13561798
            Release-ComObject $fc1
            $fc2 = $formatConditions.Add(2, 0, '=ISNUMBER(SEARCH("审核",$B$12))')
            $fc2.Interior.Color = 13421823
            $fc2.Font.Color = 192
            Release-ComObject $fc2
        } finally { Release-ComObject $formatConditions }

        $comment = $sheet.Range('B7')
        try {
            try { $comment.ClearComments() } catch {}
            $comment.AddComment('来源：冻干半成品-成本!M:Q；按数量命中最新更新单价。50万以上不自动取价。') | Out-Null
        } finally { Release-ComObject $comment }

        $sheet.Range('A1:H42').Font.Name = '微软雅黑'
        $sheet.Range('A1:H42').VerticalAlignment = -4108
        $sheet.Range('A1:H42').Borders.Color = 14277081
        $sheet.Range('A1:H42').Rows.AutoFit() | Out-Null
        $sheet.Rows.Item(1).RowHeight = 30
        $sheet.Rows.Item(2).RowHeight = 34
        $sheet.Rows.Item('18:31').RowHeight = 28
        $sheet.Rows.Item('37:42').RowHeight = 34

        $excel.ActiveWindow.SplitRow = 3
        $excel.ActiveWindow.FreezePanes = $true
        $excel.CalculateFullRebuild()
        $workbook.Save()

        Export-RangePng $sheet 'A1:H42' (Join-Path $PreviewDir 'final_freezedry_autoquote_v1_1_A1-H42.png')
        $workbook.Save()
        [pscustomobject]@{
            Mode = 'Build'
            Output = $Output
            NewSheet = $sheet.Name
            Preview = (Join-Path $PreviewDir 'final_freezedry_autoquote_v1_1_A1-H42.png')
            Sheets = $workbook.Worksheets.Count
        } | ConvertTo-Json -Compress
    }
    finally {
        if ($null -ne $workbook) { try { $workbook.Close($true) } catch {} }
        if ($null -ne $excel) { try { $excel.Quit() } catch {} }
        Release-ComObject $sourceSheet
        Release-ComObject $sheet
        Release-ComObject $workbook
        Release-ComObject $excel
        [GC]::Collect(); [GC]::WaitForPendingFinalizers()
    }
    exit
}

if ($Mode -eq 'Verify') {
    if (-not (Test-Path -LiteralPath $Output)) { throw "Output not found: $Output" }
    $excel = $null
    $workbook = $null
    $sheet = $null
    try {
        $excel = New-ExcelApplication
        $workbook = $excel.Workbooks.Open($Output, 0, $true)
        $sheet = $workbook.Worksheets.Item('冻干粉自动核价_V1.1')
        $tests = @()
        foreach ($qty in @(9999,10000,29999,30000,49999,50000,99999,100000,199999,200000,499999,500000)) {
            $sheet.Range('B5').Value2 = $qty
            $sheet.Range('B6').ClearContents()
            $excel.CalculateFull()
            $tests += [pscustomobject]@{
                Quantity = $qty
                StandardPrice = $sheet.Range('B7').Text
                Cost = $sheet.Range('B8').Text
                GrossMargin = $sheet.Range('B10').Text
                Status = $sheet.Range('B12').Text
            }
        }
        $sheet.Range('B5').Value2 = 10000
        $sheet.Range('B6').Value2 = 0.24
        $excel.CalculateFull()
        $lowPriceTest = [pscustomobject]@{
            Quantity = 10000
            ProposedPrice = $sheet.Range('B6').Text
            StandardPrice = $sheet.Range('B7').Text
            Status = $sheet.Range('B12').Text
        }

        $formulaText = $sheet.Range('A1:H42').Formula
        $newSheetRefErrors = 0
        foreach ($row in $formulaText) {
            foreach ($item in $row) {
                $formula = [string]$item
                if ($formula.StartsWith('=') -and $formula -match '#REF!') { $newSheetRefErrors++ }
            }
        }

        [pscustomobject]@{
            Mode = 'Verify'
            Output = $Output
            SheetCount = $workbook.Worksheets.Count
            NewSheetRefErrors = $newSheetRefErrors
            FormulaStandardPrice = $sheet.Range('B7').Formula
            FormulaStatus = $sheet.Range('B12').Formula
            Tests = $tests
            LowPriceTest = $lowPriceTest
        } | ConvertTo-Json -Depth 6 -Compress
    }
    finally {
        if ($null -ne $workbook) { try { $workbook.Close($false) } catch {} }
        if ($null -ne $excel) { try { $excel.Quit() } catch {} }
        Release-ComObject $sheet
        Release-ComObject $workbook
        Release-ComObject $excel
        [GC]::Collect(); [GC]::WaitForPendingFinalizers()
    }
}
