param(
    [Parameter(Mandatory = $true)]
    [string]$WorkbookPath
)

$ErrorActionPreference = 'Stop'

function Get-Number($Value) {
    if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) { return $null }
    $text = ([string]$Value).Replace(',', '').Replace('￥', '').Replace('¥', '')
    $match = [regex]::Match($text, '-?\d+(\.\d+)?')
    if ($match.Success) {
        $number = [double]$match.Value
        # Excel 单元格错误值经 COM 读取时可能表现为约 -21 亿的整数，不属于业务数量。
        if ([math]::Abs($number) -ge 1000000000) { return $null }
        return $number
    }
    return $null
}

function Get-DateValue($Value) {
    if ($null -eq $Value) { return $null }
    $text = ([string]$Value).Trim()
    if ([string]::IsNullOrWhiteSpace($text)) { return $null }
    $number = 0.0
    if ([double]::TryParse($text, [ref]$number) -and $number -ge 30000 -and $number -le 60000) {
        return [datetime]::FromOADate($number).Date
    }
    $date = [datetime]::MinValue
    if ([datetime]::TryParse($text, [ref]$date)) { return $date.Date }
    return $null
}

function Get-CellValue($Array, [int]$Row, $HeaderMap, [string]$Name) {
    return $Array.GetValue($Row, [int]$HeaderMap[$Name])
}

$excel = $null
$workbook = $null
try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $excel.ScreenUpdating = $false
    $workbook = $excel.Workbooks.Open($WorkbookPath, 0, $true)

    $sheet = $workbook.Worksheets.Item('订单包材明细')
    $lastRow = $sheet.Cells.Find('*', $sheet.Cells.Item(1, 1), -4163, 2, 1, 2, $false, $false, $false).Row
    $lastColumn = $sheet.Cells.Find('*', $sheet.Cells.Item(1, 1), -4163, 2, 2, 2, $false, $false, $false).Column
    $data = $sheet.Range($sheet.Cells.Item(1, 1), $sheet.Cells.Item($lastRow, $lastColumn)).Value2
    $headers = @{}
    for ($column = 1; $column -le $lastColumn; $column++) {
        $headers[[string]$data.GetValue(1, $column)] = $column
    }

    $today = [datetime]'2026-07-13'
    $orders = New-Object 'System.Collections.Generic.HashSet[string]'
    $outstandingOrders = New-Object 'System.Collections.Generic.HashSet[string]'
    $dates = New-Object 'System.Collections.Generic.List[datetime]'
    $supplierGroups = @{}
    $packageGroups = @{}
    $sourceGroups = @{}
    $duplicateKeys = @{}

    $metrics = [ordered]@{
        DetailRows = $lastRow - 1
        DistinctOrders = 0
        CalculablePurchaseRows = 0
        CalculablePurchaseAmount = 0.0
        OutstandingLines = 0
        OutstandingOrders = 0
        OutstandingQuantity = 0.0
        CalculableOutstandingValueRows = 0
        CalculableOutstandingValue = 0.0
        SuspectedPriceOutlierLines = 0
        SuspectedPriceOutlierValue = 0.0
        OutstandingValueExcludingPriceOutliers = 0.0
        OutstandingMissingPrice = 0
        OutstandingMissingSupplier = 0
        OutstandingMissingETA = 0
        OverdueOutstandingLines = 0
        OverdueOutstandingValue = 0.0
        NegativeOutstandingLines = 0
        NegativeOutstandingQuantity = 0.0
        DelayOrIssueLines = 0
        CandidateDuplicateGroups = 0
        CandidateDuplicateRows = 0
        CandidateDuplicateOutstandingValue = 0.0
        CandidateDuplicateOutstandingValueExcludingPriceOutliers = 0.0
        ConservativeOutstandingValue = 0.0
        FutureOrderDateRows = 0
        OrderDateMin = ''
        OrderDateMax = ''
    }

    for ($row = 2; $row -le $lastRow; $row++) {
        $orderId = [string](Get-CellValue $data $row $headers '订单ID')
        if ($orderId) { $orders.Add($orderId) | Out-Null }

        $source = [string](Get-CellValue $data $row $headers '来源工作表')
        if (-not $sourceGroups.ContainsKey($source)) { $sourceGroups[$source] = 0 }
        $sourceGroups[$source]++

        $quantity = Get-Number (Get-CellValue $data $row $headers '采购数量')
        $unitPrice = Get-Number (Get-CellValue $data $row $headers '采购单价')
        $outstanding = Get-Number (Get-CellValue $data $row $headers '未到/未送数量')
        $orderDate = Get-DateValue (Get-CellValue $data $row $headers '下单日期')
        if ($orderDate) {
            $dates.Add($orderDate)
            if ($orderDate -gt $today) { $metrics.FutureOrderDateRows++ }
        }

        if ($null -ne $quantity -and $null -ne $unitPrice) {
            $metrics.CalculablePurchaseRows++
            $metrics.CalculablePurchaseAmount += $quantity * $unitPrice
        }

        if ($null -ne $outstanding -and $outstanding -gt 0) {
            $metrics.OutstandingLines++
            $metrics.OutstandingQuantity += $outstanding
            if ($orderId) { $outstandingOrders.Add($orderId) | Out-Null }

            $supplier = ([string](Get-CellValue $data $row $headers '供应商')).Trim()
            if ([string]::IsNullOrWhiteSpace($supplier)) {
                $metrics.OutstandingMissingSupplier++
                $supplier = '（供应商待确认）'
            }

            $etaText = [string](Get-CellValue $data $row $headers '预计送货时间')
            $eta = Get-DateValue $etaText
            if (-not $eta) { $metrics.OutstandingMissingETA++ }
            if ($eta -and $eta -lt $today) { $metrics.OverdueOutstandingLines++ }

            if ($null -eq $unitPrice) {
                $metrics.OutstandingMissingPrice++
            }
            else {
                $value = $outstanding * $unitPrice
                $metrics.CalculableOutstandingValueRows++
                $metrics.CalculableOutstandingValue += $value
                if ($eta -and $eta -lt $today) { $metrics.OverdueOutstandingValue += $value }

                # 大数量包材单价达到两位数时通常需要复核小数点；仅作为异常识别规则，不直接修改原值。
                $isPriceOutlier = ($unitPrice -ge 10 -and $outstanding -ge 1000)
                if ($isPriceOutlier) {
                    $metrics.SuspectedPriceOutlierLines++
                    $metrics.SuspectedPriceOutlierValue += $value
                }
                else {
                    $metrics.OutstandingValueExcludingPriceOutliers += $value
                }

                if (-not $isPriceOutlier -and -not $supplierGroups.ContainsKey($supplier)) {
                    $supplierGroups[$supplier] = [ordered]@{ Supplier = $supplier; Lines = 0; Quantity = 0.0; Value = 0.0 }
                }
                if (-not $isPriceOutlier) {
                    $supplierGroups[$supplier].Lines++
                    $supplierGroups[$supplier].Quantity += $outstanding
                    $supplierGroups[$supplier].Value += $value
                }

                $package = ([string](Get-CellValue $data $row $headers '包材名称')).Trim()
                if ([string]::IsNullOrWhiteSpace($package)) { $package = '（包材待确认）' }
                $packageKey = $supplier + '|' + $package
                if (-not $isPriceOutlier -and -not $packageGroups.ContainsKey($packageKey)) {
                    $packageGroups[$packageKey] = [ordered]@{
                        Package = $package
                        Supplier = $supplier
                        Product = [string](Get-CellValue $data $row $headers '产品名称')
                        Quantity = 0.0
                        Value = 0.0
                        ETA = $etaText
                    }
                }
                if (-not $isPriceOutlier) {
                    $packageGroups[$packageKey].Quantity += $outstanding
                    $packageGroups[$packageKey].Value += $value
                }
            }
        }
        elseif ($null -ne $outstanding -and $outstanding -lt 0) {
            $metrics.NegativeOutstandingLines++
            $metrics.NegativeOutstandingQuantity += [math]::Abs($outstanding)
        }

        $secondEta = [string](Get-CellValue $data $row $headers '二次预计送货时间')
        $delay = [string](Get-CellValue $data $row $headers '延期原因/跟进动作')
        $issue = [string](Get-CellValue $data $row $headers '异常问题原因')
        if (-not [string]::IsNullOrWhiteSpace($secondEta) -or
            -not [string]::IsNullOrWhiteSpace($delay) -or
            -not [string]::IsNullOrWhiteSpace($issue)) {
            $metrics.DelayOrIssueLines++
        }

        $keyParts = @(
            [string](Get-CellValue $data $row $headers '业务员'),
            [string](Get-CellValue $data $row $headers '生产工厂'),
            [string](Get-CellValue $data $row $headers '产品编码'),
            [string](Get-CellValue $data $row $headers '产品名称'),
            [string](Get-CellValue $data $row $headers '下单日期'),
            [string](Get-CellValue $data $row $headers '包材名称'),
            [string](Get-CellValue $data $row $headers '供应商'),
            [string](Get-CellValue $data $row $headers '采购数量'),
            [string](Get-CellValue $data $row $headers '采购单价'),
            [string](Get-CellValue $data $row $headers '未到/未送数量')
        )
        $duplicateKey = $keyParts -join '|'
        if (-not $duplicateKeys.ContainsKey($duplicateKey)) {
            $duplicateKeys[$duplicateKey] = [pscustomobject]@{
                Sources = New-Object 'System.Collections.Generic.HashSet[string]'
                Rows = 0
                OutstandingValue = if ($null -ne $outstanding -and $outstanding -gt 0 -and $null -ne $unitPrice) { $outstanding * $unitPrice } else { 0.0 }
                IsPriceOutlier = ($null -ne $outstanding -and $outstanding -ge 1000 -and $null -ne $unitPrice -and $unitPrice -ge 10)
            }
        }
        $duplicateKeys[$duplicateKey].Sources.Add($source) | Out-Null
        $duplicateKeys[$duplicateKey].Rows++
    }

    $metrics.DistinctOrders = $orders.Count
    $metrics.OutstandingOrders = $outstandingOrders.Count
    if ($dates.Count -gt 0) {
        $sortedDates = @($dates | Sort-Object)
        $metrics.OrderDateMin = $sortedDates[0].ToString('yyyy-MM-dd')
        $metrics.OrderDateMax = $sortedDates[-1].ToString('yyyy-MM-dd')
    }

    $duplicateGroups = @($duplicateKeys.Values | Where-Object { $_.Sources.Count -gt 1 })
    $metrics.CandidateDuplicateGroups = $duplicateGroups.Count
    if ($duplicateGroups.Count -gt 0) {
        $metrics.CandidateDuplicateRows = ($duplicateGroups | Measure-Object -Property Rows -Sum).Sum
        foreach ($group in $duplicateGroups) {
            $excess = [math]::Max($group.Rows - 1, 0)
            $metrics.CandidateDuplicateOutstandingValue += $excess * $group.OutstandingValue
            if (-not $group.IsPriceOutlier) {
                $metrics.CandidateDuplicateOutstandingValueExcludingPriceOutliers += $excess * $group.OutstandingValue
            }
        }
    }
    $metrics.ConservativeOutstandingValue = [math]::Max(
        $metrics.OutstandingValueExcludingPriceOutliers - $metrics.CandidateDuplicateOutstandingValueExcludingPriceOutliers,
        0
    )

    $qualitySheet = $workbook.Worksheets.Item('待确认数据')
    $qualityLastRow = $qualitySheet.Cells.Find('*', $qualitySheet.Cells.Item(1, 1), -4163, 2, 1, 2, $false, $false, $false).Row
    $qualityData = $qualitySheet.Range($qualitySheet.Cells.Item(1, 1), $qualitySheet.Cells.Item($qualityLastRow, 9)).Value2
    $qualityBreakdown = @{}
    for ($row = 2; $row -le $qualityLastRow; $row++) {
        foreach ($item in ([string]$qualityData.GetValue($row, 9) -split '、')) {
            if (-not [string]::IsNullOrWhiteSpace($item)) {
                if (-not $qualityBreakdown.ContainsKey($item)) { $qualityBreakdown[$item] = 0 }
                $qualityBreakdown[$item]++
            }
        }
    }

    $overviewSheet = $workbook.Worksheets.Item('生产订单总览')
    $overviewLastRow = $overviewSheet.Cells.Find('*', $overviewSheet.Cells.Item(1, 1), -4163, 2, 1, 2, $false, $false, $false).Row
    $overviewData = $overviewSheet.Range($overviewSheet.Cells.Item(1, 1), $overviewSheet.Cells.Item($overviewLastRow, 15)).Value2
    $overviewHeaders = @{}
    for ($column = 1; $column -le 15; $column++) {
        $overviewHeaders[[string]$overviewData.GetValue(1, $column)] = $column
    }
    $completedLate = 0
    $openOverdue = 0
    $overviewIssueRows = 0
    for ($row = 2; $row -le $overviewLastRow; $row++) {
        $planned = Get-DateValue (Get-CellValue $overviewData $row $overviewHeaders '预计出货时间')
        $actual = Get-DateValue (Get-CellValue $overviewData $row $overviewHeaders '实际出货时间')
        if ($planned -and $actual -and $actual -gt $planned) { $completedLate++ }
        if ($planned -and -not $actual -and $planned -lt $today) { $openOverdue++ }
        $delay = [string](Get-CellValue $overviewData $row $overviewHeaders '延期原因/跟进动作')
        $issue = [string](Get-CellValue $overviewData $row $overviewHeaders '异常问题原因')
        if (-not [string]::IsNullOrWhiteSpace($delay) -or -not [string]::IsNullOrWhiteSpace($issue)) { $overviewIssueRows++ }
    }

    $result = [ordered]@{
        Metrics = [pscustomobject]$metrics
        SourceRows = @($sourceGroups.GetEnumerator() | Sort-Object Name | ForEach-Object {
            [pscustomobject]@{ Source = $_.Name; Rows = $_.Value }
        })
        TopSuppliers = @($supplierGroups.Values | ForEach-Object { [pscustomobject]$_ } | Sort-Object Value -Descending | Select-Object -First 10)
        TopPackages = @($packageGroups.Values | ForEach-Object { [pscustomobject]$_ } | Sort-Object Value -Descending | Select-Object -First 15)
        QualityBreakdown = @($qualityBreakdown.GetEnumerator() | Sort-Object Value -Descending | ForEach-Object {
            [pscustomobject]@{ Item = $_.Name; Rows = $_.Value }
        })
        ProductionOverview = [pscustomobject]@{
            Rows = $overviewLastRow - 1
            CompletedLate = $completedLate
            OpenOverdue = $openOverdue
            RowsWithDelayOrIssue = $overviewIssueRows
        }
    }

    $result | ConvertTo-Json -Depth 6
}
finally {
    if ($workbook) { $workbook.Close($false) }
    if ($excel) { $excel.Quit() }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
