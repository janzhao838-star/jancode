<#
  JanCode 一键接入脚本（Windows）
  
  用法（PowerShell 里执行）：
    & { $u='https://router.aionclaw.com/v1'; $k='sk-xxxxxxxx'; $m='deepseek-v4-pro';
        iwr -useb https://<你的站点>/setup-codex.ps1 | iex }

  或者下载后带参数运行（推荐，可先审阅内容）：
    .\setup-codex.ps1 -Url https://router.aionclaw.com/v1 -Key sk-xxx -Model deepseek-v4-pro

  脚本会做四件事：
    1. 校验中转站地址与密钥（先真连一次，不通就不动你的配置）
    2. 备份现有的 config.toml 与 auth.json
    3. 把模型接入写进 Codex 配置（保留你原有的其它配置）
    4. 同步写一份到 JanCode 管理工具
  只写入、不删除；重复执行安全（幂等）。
#>

[CmdletBinding()]
param(
    [string]$Url   = "",
    [string]$Key   = "",
    [string]$Model = "",
    [string]$Name  = "我的中转站",
    [string]$Id    = "jancode",
    [switch]$List,
    [switch]$SkipCheck
)

$ErrorActionPreference = "Stop"

# ── 兼容 `iwr -useb <url> | iex` 这种一键用法 ─────────────────
# 通过 iex 执行时，param() 只会取默认值，拿不到调用方脚本块里的 $url / $key / $model。
# 因此这里显式回退到上一层作用域的同名变量。
# 以文件方式运行（.\setup-codex.ps1 -Url ...）时上一层没有这些变量，回退为空、不影响入参。
if ([string]::IsNullOrWhiteSpace($Url)) {
    $outer = Get-Variable -Name 'url' -ValueOnly -Scope 1 -ErrorAction SilentlyContinue
    if ($outer) { $Url = [string]$outer }
}
if ([string]::IsNullOrWhiteSpace($Key)) {
    $outer = Get-Variable -Name 'key' -ValueOnly -Scope 1 -ErrorAction SilentlyContinue
    if ($outer) { $Key = [string]$outer }
}
if ([string]::IsNullOrWhiteSpace($Model)) {
    $outer = Get-Variable -Name 'model' -ValueOnly -Scope 1 -ErrorAction SilentlyContinue
    if ($outer) { $Model = [string]$outer }
}

function Write-Info  { param($m) Write-Host "[信息] $m" -ForegroundColor Cyan }
function Write-Ok    { param($m) Write-Host "[成功] $m" -ForegroundColor Green }
function Write-Warn2 { param($m) Write-Host "[注意] $m" -ForegroundColor Yellow }
function Write-Err   { param($m) Write-Host "[错误] $m" -ForegroundColor Red }
function Write-Dim   { param($m) Write-Host $m -ForegroundColor DarkGray }

function Show-Usage {
    @"
JanCode 一键接入 — 参数说明

  -Url    <地址>   中转站 Base URL，例如 https://router.aionclaw.com/v1
                   没写 /v1 会自动补上
  -Key    <密钥>   中转站后台生成的 API Key（sk- 开头）
  -Model  <模型名> 要用的模型，例如 deepseek-v4-pro
  -Name   <名称>   配置里显示的供应商名字，默认「我的中转站」
  -List            只列出该中转站可用模型，不写任何配置
  -SkipCheck       跳过连通性校验（不推荐）

示例：
  .\setup-codex.ps1 -Url https://router.aionclaw.com/v1 -Key sk-xxx -Model deepseek-v4-pro
"@ | Write-Host
}

# ── 参数校验 ─────────────────────────────────────────────────
if ([string]::IsNullOrWhiteSpace($Url)) {
    Write-Err "缺少 -Url 参数（中转站地址）"
    Write-Host ""; Show-Usage; exit 1
}

function Normalize-Url {
    param([string]$u)
    $u = $u.Trim().TrimEnd('/')
    if ($u -notmatch '/v1$') { $u = "$u/v1" }
    return $u
}
$Url = Normalize-Url $Url

if ([string]::IsNullOrWhiteSpace($Key) -and -not $List) {
    Write-Err "缺少 -Key 参数（API Key）"
    Write-Host ""; Show-Usage; exit 1
}

if ($Key -and $Key -notlike 'sk-*') {
    Write-Warn2 "密钥不是常见的 sk- 开头，继续按原样写入。"
}

Write-Host ""
Write-Host "──────────────────────────────────────────────"
Write-Info "中转站地址：$Url"
if ($Key) {
    $masked = if ($Key.Length -gt 11) { $Key.Substring(0,7) + "…" + $Key.Substring($Key.Length-4) } else { "****" }
    Write-Info "API Key   ：$masked（已隐藏中间部分）"
}
if ($Model) { Write-Info "模型      ：$Model" }
Write-Host "──────────────────────────────────────────────"
Write-Host ""

# ── 连通性 / 鉴权校验 ────────────────────────────────────────
function Invoke-Probe {
    param([string]$Uri, [string]$Method = "GET", [string]$Body = "")
    $headers = @{ "Authorization" = "Bearer $Key"; "Content-Type" = "application/json" }
    try {
        if ($Method -eq "POST") {
            $resp = Invoke-WebRequest -Uri $Uri -Method POST -Headers $headers -Body $Body `
                      -TimeoutSec 25 -UseBasicParsing -ErrorAction Stop
            return @{ Code = [int]$resp.StatusCode; Body = $resp.Content }
        } else {
            $resp = Invoke-WebRequest -Uri $Uri -Method GET -Headers $headers `
                      -TimeoutSec 25 -UseBasicParsing -ErrorAction Stop
            return @{ Code = [int]$resp.StatusCode; Body = $resp.Content }
        }
    } catch {
        $code = 0
        $body = ""
        if ($_.Exception.Response) {
            try { $code = [int]$_.Exception.Response.StatusCode } catch { $code = 0 }
            try {
                $stream = $_.Exception.Response.GetResponseStream()
                $reader = New-Object System.IO.StreamReader($stream)
                $body = $reader.ReadToEnd()
            } catch { $body = "" }
        }
        return @{ Code = $code; Body = $body }
    }
}

if ($List) {
    Write-Info "正在查询可用模型…"
    $r = Invoke-Probe -Uri "$Url/models"
    switch ($r.Code) {
        200 {
            try {
                $data = $r.Body | ConvertFrom-Json
                $ids = @($data.data | ForEach-Object { $_.id } | Sort-Object)
                Write-Host "该中转站共 $($ids.Count) 个模型：`n"
                $ids | ForEach-Object { Write-Host "  - $_" }
            } catch { Write-Host $r.Body }
        }
        401 { Write-Err "密钥无效或已过期（401）。请到中转站后台确认 Key 是否启用。" }
        0   { Write-Err "连不上 $Url，请检查网络或地址是否正确。" }
        default { Write-Warn2 "查询模型列表返回 $($r.Code)，跳过。" }
    }
    exit 0
}

if (-not $SkipCheck) {
    Write-Info "正在校验中转站连通性与密钥…"
    $probeModel = if ($Model) { $Model } else { "probe" }
    $payload = @{ model = $probeModel; input = "hi"; max_output_tokens = 8 } | ConvertTo-Json -Compress
    $r = Invoke-Probe -Uri "$Url/responses" -Method POST -Body $payload

    switch ($r.Code) {
        200     { Write-Ok "中转站可用，且原生支持 Responses 协议。" }
        401     { Write-Err "密钥校验失败（HTTP 401）：Key 无效、已过期或未开通该模型。"
                  Write-Err "请到中转站后台确认后重试。未改动你的任何配置。"; exit 1 }
        403     { Write-Err "密钥校验失败（HTTP 403）：该 Key 无权访问或已被禁用。"
                  Write-Err "未改动你的任何配置。"; exit 1 }
        404     { Write-Warn2 "该中转站不支持 /responses 协议（404）。"
                  Write-Warn2 "Codex 26.901 起只接受 Responses 协议，直接接入会失败。"
                  Write-Warn2 "请改用 JanCode 管理工具（会用本地协议代理把 Chat 转成 Responses）。"
                  exit 1 }
        429     { Write-Ok "中转站可达（当前限流 429），配置继续写入。" }
        0       { Write-Err "连不上 $Url，请检查网络、地址与证书。未改动你的任何配置。"; exit 1 }
        default { Write-Warn2 "校验返回 HTTP $($r.Code)，无法确定状态，继续写入配置。" }
    }
} else {
    Write-Warn2 "已跳过连通性校验。"
}

# ── 定位配置目录 ─────────────────────────────────────────────
$CodexHome   = if ($env:CODEX_HOME)   { $env:CODEX_HOME }   else { Join-Path $env:USERPROFILE ".codex" }
$JanCodeHome = if ($env:JANCODE_HOME) { $env:JANCODE_HOME } else { Join-Path $env:USERPROFILE ".jancode" }
New-Item -ItemType Directory -Force -Path $CodexHome   | Out-Null
New-Item -ItemType Directory -Force -Path $JanCodeHome | Out-Null

$ConfigFile = Join-Path $CodexHome "config.toml"
$AuthFile   = Join-Path $CodexHome "auth.json"
$Stamp      = Get-Date -Format "yyyyMMdd-HHmmss"

# ── 备份 ─────────────────────────────────────────────────────
if (Test-Path $ConfigFile) {
    Copy-Item $ConfigFile "$ConfigFile.bak.$Stamp" -Force
    Write-Ok "已备份原配置 → config.toml.bak.$Stamp"
}
if (Test-Path $AuthFile) {
    Copy-Item $AuthFile "$AuthFile.bak.$Stamp" -Force
    Write-Ok "已备份原密钥 → auth.json.bak.$Stamp"
}

# ── 写入 config.toml ─────────────────────────────────────────
# 生成合法 TOML 的关键：
#   · 根级键（model / model_provider）必须出现在任何 [section] 之前
#   · [model_providers.<id>] 是表，一旦开始，后面的裸键都会归属于它
#   → 根级键置顶、provider 表追加到末尾，两者不能相邻。
Write-Info "正在写入 Codex 配置…"

$kept = New-Object System.Collections.Generic.List[string]
if (Test-Path $ConfigFile) {
    $inManaged   = $false
    $skipSection = $false
    foreach ($line in [System.IO.File]::ReadAllLines($ConfigFile, [System.Text.Encoding]::UTF8)) {
        if ($line -match '^# ── JanCode 接入配置（')     { $inManaged = $true;  continue }
        if ($line -match '^# ── JanCode 接入配置结束 ──') { $inManaged = $false; continue }
        if ($inManaged) { continue }

        if ($line -match '^\s*\[') {
            if ($line -match ("^\s*\[model_providers\." + [Regex]::Escape($Id) + "\]\s*$")) {
                $skipSection = $true; continue
            }
            $skipSection = $false
        }
        if ($skipSection) { continue }

        if ($line -match '^\s*model\s*=')          { continue }
        if ($line -match '^\s*model_provider\s*=') { continue }

        $kept.Add($line)
    }
}

$out = New-Object System.Collections.Generic.List[string]
$out.Add("# ── JanCode 接入配置（由 setup-codex.ps1 写入，可重复执行覆盖）──")
if ($Model) { $out.Add("model = `"$Model`"") }
$out.Add("model_provider = `"$Id`"")
# ★ 必须有结束标记：解析时靠它结束受管块，漏掉会导致下次执行吞掉后面的全部内容。
$out.Add("# ── JanCode 接入配置结束 ──")
if ($kept.Count -gt 0) { $out.Add(""); $kept | ForEach-Object { $out.Add($_) } }
$out.Add("")
$out.Add("[model_providers.$Id]")
$out.Add("name = `"$Name`"")
$out.Add("base_url = `"$Url`"")
# ★ Codex 26.901 起不再接受 wire_api = "chat"，
#   出现该值会让整份 config.toml 被判无效并回退内置默认模型，故恒为 "responses"。
$out.Add('wire_api = "responses"')
$out.Add('env_key = "OPENAI_API_KEY"')

# TOML 必须是 UTF-8 且不带 BOM，带 BOM 会导致解析失败
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllLines($ConfigFile, $out, $utf8NoBom)
Write-Ok "Codex 配置已写入 → $ConfigFile"

# ── 写入 auth.json ───────────────────────────────────────────
$authData = @{}
if (Test-Path $AuthFile) {
    try {
        $existing = Get-Content $AuthFile -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($existing) {
            $existing.PSObject.Properties | ForEach-Object { $authData[$_.Name] = $_.Value }
        }
    } catch { $authData = @{} }
}
$authData["OPENAI_API_KEY"] = $Key
$authJson = $authData | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText($AuthFile, $authJson + "`n", $utf8NoBom)
Write-Ok "密钥已写入 → $AuthFile"

# ── 同步写入 JanCode 管理工具 ────────────────────────────────
$SettingsFile = Join-Path $JanCodeHome "settings.json"
$settings = @{}
if (Test-Path $SettingsFile) {
    try {
        $loaded = Get-Content $SettingsFile -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($loaded) { $loaded.PSObject.Properties | ForEach-Object { $settings[$_.Name] = $_.Value } }
    } catch { $settings = @{} }
}

$relayProfile = [ordered]@{
    id                       = $Id
    name                     = $Name
    upstreamBaseUrl          = $Url
    protocol                 = "responses"
    relayMode                = "pureApi"
    officialMixApiKey        = $false
    noAuth                   = $false
    hideOfficialUsageAlert   = $false
    testModel                = $Model
    configContents           = ""
    authContents             = ""
    useCommonConfig          = $true
    contextWindow            = ""
    autoCompactLimit         = ""
    modelInsertMode          = "replace"
    modelList                = $Model
}

$profiles = @()
if ($settings.ContainsKey("relayProfiles") -and $settings["relayProfiles"]) {
    $profiles = @($settings["relayProfiles"] | Where-Object { $_.id -ne $Id })
}
$profiles += [PSCustomObject]$relayProfile

$settings["relayProfiles"] = $profiles
$settings["activeRelayId"] = $Id
$settings["relayApiKey"]   = $Key
$settings["relayBaseUrl"]  = $Url
if ($Model) { $settings["relayTestModel"] = $Model }

$settingsJson = $settings | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText($SettingsFile, $settingsJson + "`n", $utf8NoBom)
Write-Ok "JanCode 管理工具已同步 → $SettingsFile"

# ── 完成 ─────────────────────────────────────────────────────
Write-Host ""
Write-Host "──────────────────────────────────────────────"
Write-Ok "接入完成！"
Write-Host ""
Write-Host "接下来："
Write-Host "  1. 完全退出并重新打开 Codex 桌面版（配置在启动时读取）"
Write-Host "  2. 在 Codex 里就能选用刚才配置的模型了"
Write-Host ""
Write-Dim "  配置文件：$ConfigFile"
Write-Dim "  密钥文件：$AuthFile"
Write-Dim "  原文件已备份为 *.bak.$Stamp，需要回滚时改回来即可"
Write-Host "──────────────────────────────────────────────"
Write-Host ""
