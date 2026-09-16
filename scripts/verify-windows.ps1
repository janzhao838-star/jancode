# JanCode Windows 验证脚本
#
# 用途：把「Windows 上要验的几件事」合并成一条命令，跑完直接给结论。
# 设计原则与安装脚本一致——每一项都说清「检查了什么、结果如何、不对时怎么办」。
#
# 用法（在 PowerShell 里，建议以管理员身份运行以便创建符号链接测试）：
#   iwr -useb https://raw.githubusercontent.com/janzhao838-star/jancode/main/scripts/verify-windows.ps1 | iex
# 或下载后：
#   powershell -ExecutionPolicy Bypass -File verify-windows.ps1

$ErrorActionPreference = 'Continue'
$script:Pass = 0
$script:Fail = 0
$script:Warn = 0

function Section($t) { Write-Host ""; Write-Host "── $t " -ForegroundColor White -NoNewline; Write-Host ("─" * [Math]::Max(0, 46 - $t.Length)) -ForegroundColor DarkGray }
function Pass($m)    { Write-Host "  [通过] $m" -ForegroundColor Green;  $script:Pass++ }
function Fail($m)    { Write-Host "  [失败] $m" -ForegroundColor Red;    $script:Fail++ }
function Warn2($m)   { Write-Host "  [注意] $m" -ForegroundColor Yellow; $script:Warn++ }
function Info($m)    { Write-Host "      $m" -ForegroundColor DarkGray }

Write-Host ""
Write-Host "JanCode Windows 验证" -ForegroundColor Cyan
Write-Host ("=" * 52) -ForegroundColor DarkGray

# ═══ 1. 运行环境 ═══
Section "运行环境"

$py = $null
foreach ($c in @('py','python')) {
    if (Get-Command $c -ErrorAction SilentlyContinue) {
        try {
            $v = & $c -c "import sys;print('%d.%d'%sys.version_info[:2])" 2>$null
            if ($v) { $py = $c; break }
        } catch {}
    }
}
if ($py) {
    if ([version]$v -ge [version]'3.11') { Pass "Python $v" }
    else { Warn2 "Python $v 版本偏低（部分脚本需要 3.11 以上）" }
} else {
    Warn2 "未找到 Python"
    Info "只影响 jancode-agent；JanCode 桌面应用本身不需要 Python"
}

if (Get-Command git -ErrorAction SilentlyContinue) { Pass "git 可用" }
else { Warn2 "未找到 git" }

# ═══ 2. JanCode 应用是否安装 ═══
Section "JanCode 应用安装情况"

$found = @()
foreach ($name in @('JanCode', 'JanCode 管理工具')) {
    $paths = @(
        (Join-Path $env:LOCALAPPDATA "Programs\$name\$name.exe"),
        (Join-Path $env:LOCALAPPDATA "Programs\$name.exe")
    )
    $hit = $paths | Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($hit) { Pass "$name 已安装"; Info $hit; $found += $hit }
    else { Warn2 "$name 未找到" }
}
if ($found.Count -eq 0) {
    Info "如需安装，运行："
    Info '  iwr -useb https://charlene.cat:9090/setup-jancode.ps1 | iex'
}

# ═══ 3. 客户端检测（这是本轮的重点）═══
Section "接入脚本的客户端检测"

# setup-jancode.ps1 会去这些位置找 Codex 客户端
$clientPaths = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\JanCode\jancode-manager.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\Codex\Codex.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\ChatGPT\ChatGPT.exe')
)
$clientFound = $clientPaths | Where-Object { Test-Path $_ }
if ($clientFound) {
    Pass "检测到客户端"
    $clientFound | ForEach-Object { Info $_ }
} else {
    # 这是最需要验证的分支：客户端不存在时，脚本必须给出说明并正常退出，
    # 而不是报错崩掉或静默假装成功。
    Warn2 "本机没有 Codex 客户端"
    Info "这正好可以验证脚本的「找不到客户端」分支："
    Info "  它应该给出说明并以 0 退出，而不是报错。"
    Info ""
    Info "手动验证："
    Info '  .\scripts\setup-jancode.ps1 -Url https://charlene.cat:9090/v1 -Key test'
    Info '  echo $LASTEXITCODE    # 应为 0'
}

# ═══ 4. 管理工具能否正常启动 ═══
Section "管理工具启动测试"

$manager = (Join-Path $env:LOCALAPPDATA 'Programs\JanCode 管理工具\JanCode 管理工具.exe')
if (-not (Test-Path $manager)) {
    $manager = (Get-ChildItem (Join-Path $env:LOCALAPPDATA 'Programs') -Filter '*管理工具*.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1).FullName
}

if ($manager -and (Test-Path $manager)) {
    Info "启动 $manager"
    # macOS 上踩过一次：残留进程占着单实例锁，双击毫无反应、退出码 0、无任何输出。
    # Windows 上同类问题同样可能发生，所以这里在启动前检查残留进程。
    $existing = Get-Process -Name 'jancode-manager', 'JanCode 管理工具' -ErrorAction SilentlyContinue
    if ($existing) {
        Warn2 "启动前已有 $($existing.Count) 个同名进程在运行"
        Info "它们可能占着单实例锁，导致新启动的窗口不出现"
        Info "如遇「双击没反应」，先执行：Get-Process 'jancode-manager' | Stop-Process"
    }

    try {
        $proc = Start-Process -FilePath $manager -PassThru -ErrorAction Stop
        Start-Sleep -Seconds 8
        $alive = Get-Process -Id $proc.Id -ErrorAction SilentlyContinue
        if ($alive) {
            Pass "启动后存活 8 秒（内存 $([int]($alive.WorkingSet64/1MB)) MB）"
            Info "请确认窗口确实显示出来了。确认后可关闭。"
        } else {
            Fail "进程启动后立即退出（退出码 $($proc.ExitCode)）"
            Info "检查日志：$env:USERPROFILE\.jancode\jancode.log"
            Info "常见原因：残留进程占用单实例锁。执行下面这行后重试："
            Info "  Get-Process 'jancode-manager' -ErrorAction SilentlyContinue | Stop-Process"
        }
    } catch {
        Fail "启动失败：$_"
    }
} else {
    Warn2 "未找到管理工具，跳过启动测试"
}

# ═══ 5. 网络连通性 ═══
Section "中转站连通性"

foreach ($u in @('https://charlene.cat:9090/api/health', 'https://router.aionclaw.com/v1/models')) {
    try {
        $r = Invoke-WebRequest -Uri $u -Method GET -TimeoutSec 15 -UseBasicParsing -ErrorAction Stop
        Pass "$u  ->  $($r.StatusCode)"
    } catch {
        # 401 是正常结果：说明服务在、需要鉴权
        $code = $_.Exception.Response.StatusCode.value__
        if ($code -eq 401) { Pass "$u  ->  401（正常，需鉴权）" }
        elseif ($code) { Warn2 "$u  ->  $code" }
        else { Fail "$u  ->  连不上（$($_.Exception.Message.Split([char]10)[0])）" }
    }
}

# ═══ 汇总 ═══
Write-Host ""
Write-Host ("=" * 52) -ForegroundColor DarkGray
Write-Host "  通过 $script:Pass   注意 $script:Warn   失败 $script:Fail" -ForegroundColor $(if ($script:Fail -gt 0) { 'Red' } elseif ($script:Warn -gt 0) { 'Yellow' } else { 'Green' })
Write-Host ""
if ($script:Fail -gt 0) {
    Write-Host "有失败项，请按上面 [失败] 后面的提示处理。" -ForegroundColor Red
} elseif ($script:Warn -gt 0) {
    Write-Host "没有硬性失败。[注意] 项多为环境差异，按需处理。" -ForegroundColor Yellow
} else {
    Write-Host "全部通过，Windows 端可正常使用。" -ForegroundColor Green
}
Write-Host ""
Write-Host "别忘了还要验一件事：真正的对话。" -ForegroundColor DarkGray
Write-Host "  jancode-agent --doctor     (需先设置 JANCODE_API_KEY)" -ForegroundColor DarkGray
Write-Host ""

exit $(if ($script:Fail -gt 0) { 1 } else { 0 })
