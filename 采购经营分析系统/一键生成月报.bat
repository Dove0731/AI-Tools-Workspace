@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ==================================================
echo   采购价格与降本月度分析系统
echo ==================================================
echo.

where python >nul 2>nul
if errorlevel 1 (
    echo [错误] 未找到 Python。请安装 Python 3.10 或更高版本，并勾选“Add Python to PATH”。
    echo 安装完成后重新双击本文件。
    pause
    exit /b 1
)

python -c "import sys; assert sys.version_info >= (3,10)" >nul 2>nul
if errorlevel 1 (
    echo [错误] Python 版本过低，需要 Python 3.10 或更高版本。
    pause
    exit /b 1
)

echo [1/3] 检查运行依赖...
python -c "import pandas, openpyxl, reportlab" >nul 2>nul
if errorlevel 1 (
    echo 正在安装缺失依赖，请保持网络连接...
    python -m pip install -r requirements.txt
    if errorlevel 1 (
        echo [错误] 依赖安装失败。请检查网络、pip 权限，或联系技术人员。
        pause
        exit /b 1
    )
)

set /p ANALYSIS_MONTH=请输入分析月份（YYYY-MM，直接回车默认上一个自然月）：

echo.
echo [2/3] 正在读取、校验、计算并生成报告...
if "%ANALYSIS_MONTH%"=="" (
    python src\main.py
) else (
    python src\main.py --month "%ANALYSIS_MONTH%"
)

if errorlevel 1 (
    echo.
    echo [失败] 月报未生成。请查看 05_运行日志 中最新的错误日志。
    pause
    exit /b 1
)

echo.
echo [3/3] 处理完成。
echo 输出目录：%~dp003_输出报告
start "" "%~dp003_输出报告"
pause
exit /b 0

