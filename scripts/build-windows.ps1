# JanCode Windows 一键构建脚本
#
# 用法（在 Windows 上，以普通用户身份运行，不需要管理员）：
#   1. 用 PowerShell 打开本仓库根目录
#   2. 执行：  powershell -ExecutionPolicy Bypass -File scripts\build-windows.ps1
#
# 产物：
#   dist\windows\app\jancode.exe            静默启动入口
#   dist\windows\app\jancode-manager.exe    管理工具
#   dist\windows\JanCode-<版本>-windows-x64.zip          免安装版（总是产出）
#   dist\windows\JanCode-<版本>-windows-x64-setup.exe    安装包（装了 NSIS 才产出）

[CmdletBinding()]
param(
    [string]$Version = "1.3.0"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# 切到仓库根目录（本脚本位于 scripts\ 下）
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

function Write-Step($message) {
    Write-Host ""
    Write-Host "==== $message" -ForegroundColor Cyan
}

function Test-Command($name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

function Require-Command($name, $hint) {
    if (-not (Test-Command $name)) {
        Write-Host "缺少必需工具：$name" -ForegroundColor Red
        Write-Host $hint -ForegroundColor Yellow
        exit 1
    }
}

# ── 0. 环境检查 ────────────────────────────────────────────────
Write-Step "检查构建环境"

Require-Command "node" @"
请先安装 Node.js 20 或更高版本：https://nodejs.org/
安装后重开 PowerShell 再运行本脚本。
"@

if (-not (Test-Command "cargo")) {
    $cargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
    if (Test-Path (Join-Path $cargoBin "cargo.exe")) {
        $env:Path = "$cargoBin;$env:Path"
    }
}

Require-Command "cargo" @"
缺少 Rust 工具链。请先安装：
  1) 下载并运行 https://win.rustup.rs/x86_64
  2) 安装时选择默认选项（MSVC 工具链）
  3) 如果提示缺少 C++ 生成工具，请安装 "Visual Studio Build Tools"，
     并在其中勾选「使用 C++ 的桌面开发」
  4) 安装完成后重开 PowerShell 再运行本脚本
"@

if (-not (Test-Command "link.exe")) {
    Write-Host "提示：未检测到 link.exe。若编译时报链接错误，请安装 Visual Studio" -ForegroundColor Yellow
    Write-Host "      Build Tools 并勾选「使用 C++ 的桌面开发」。" -ForegroundColor Yellow
}

Write-Host "node  : $((node --version))"
Write-Host "cargo : $((cargo --version))"
Write-Host "版本号: $Version"

# ── 1. 前端依赖与构建 ─────────────────────────────────────────
Write-Step "构建管理工具前端"
Push-Location "apps\codex-plus-manager"
try {
    if (Test-Path "package-lock.json") {
        npm ci
    } else {
        npm install --package-lock=false
    }
    npm run vite:build
} finally {
    Pop-Location
}

# ── 2. 编译 Rust 二进制 ───────────────────────────────────────
Write-Step "编译 Rust 二进制（首次约 10-20 分钟）"
cargo build --release

# ── 3. 暂存 Windows 产物 ──────────────────────────────────────
Write-Step "暂存 Windows 产物"
$AppDir = "dist\windows\app"
New-Item -ItemType Directory -Force $AppDir | Out-Null

foreach ($exe in @("jancode.exe", "jancode-manager.exe")) {
    $src = "target\release\$exe"
    if (-not (Test-Path $src)) { throw "编译产物缺失：$src" }
    Copy-Item $src $AppDir -Force
}

# 图标随二进制一起分发（安装入口与资源管理使用）
Copy-Item "apps\codex-plus-manager\src-tauri\icons\icon.ico" $AppDir -Force

# ── 4. 免安装 ZIP ─────────────────────────────────────────────
Write-Step "打包免安装 ZIP"
$ZipPath = "dist\windows\JanCode-$Version-windows-x64.zip"
if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
Compress-Archive -Path "$AppDir\*" -DestinationPath $ZipPath -Force

# ── 5. NSIS 安装包（可选）────────────────────────────────────
Write-Step "构建 NSIS 安装包（可选）"
$makensis = "${env:ProgramFiles(x86)}\NSIS\makensis.exe"
if (-not (Test-Path $makensis) -and (Test-Command "makensis")) {
    $makensis = "makensis"
}

if (Test-Path $makensis) {
    Push-Location "scripts\installer\windows"
    try {
        & $makensis "/INPUTCHARSET" "UTF8" "/DVERSION=$Version" "JanCode.nsi"
        if ($LASTEXITCODE -ne 0) { throw "NSIS 构建失败（退出码 $LASTEXITCODE）" }
    } finally {
        Pop-Location
    }
    Write-Host "已生成安装包。" -ForegroundColor Green
} else {
    Write-Host "未安装 NSIS，跳过安装包，仅产出免安装 ZIP。" -ForegroundColor Yellow
    Write-Host "如需安装包，请下载安装 NSIS：https://nsis.sourceforge.io/Download" -ForegroundColor Yellow
    Write-Host "（或运行：winget install NSIS.NSIS）" -ForegroundColor Yellow
}

# ── 6. 结果 ───────────────────────────────────────────────────
Write-Step "构建完成"
Get-ChildItem "dist\windows" -File | ForEach-Object {
    Write-Host ("  {0}  ({1:N1} MB)" -f $_.Name, ($_.Length / 1MB)) -ForegroundColor Green
}
Write-Host ""
Write-Host "免安装版：解压 $ZipPath，双击 jancode-manager.exe 即为管理工具。" -ForegroundColor Green
Write-Host "静默启动入口 jancode.exe 需要已安装 OpenAI Codex / ChatGPT 桌面版。" -ForegroundColor Green
