#!/usr/bin/env bash
#
# JanCode 一键接入脚本（macOS / Linux）
#
# 用法：
#   curl -sL https://<你的站点>/setup-codex.sh | bash -s -- \
#       --url https://router.aionclaw.com/v1 --key sk-xxxxxxxx --model deepseek-v4-pro
#
# 或者先下载再运行（可先审阅内容，更安全）：
#   curl -sLO https://<你的站点>/setup-codex.sh
#   bash setup-codex.sh --url ... --key ... --model ...
#
# 这个脚本会做四件事：
#   1. 校验中转站地址与密钥（先真连一次，不通就不动你的配置）
#   2. 备份现有的 ~/.codex/config.toml 与 auth.json
#   3. 把模型接入写进 Codex 配置（保留你原有的其它配置）
#   4. 同步写一份到 JanCode 管理工具，方便你在界面里看到和切换
#
# 只写入，不删除任何东西；重复执行安全（幂等）。

set -euo pipefail

# ── 输出样式 ─────────────────────────────────────────────────
if [ -t 1 ]; then
  C_INFO=$'\033[36m'; C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_DIM=$'\033[2m'; C_RST=$'\033[0m'
else
  C_INFO=""; C_OK=""; C_WARN=""; C_ERR=""; C_DIM=""; C_RST=""
fi
info() { printf '%s[信息]%s %s\n' "$C_INFO" "$C_RST" "$1"; }
ok()   { printf '%s[成功]%s %s\n' "$C_OK"   "$C_RST" "$1"; }
warn() { printf '%s[注意]%s %s\n' "$C_WARN" "$C_RST" "$1"; }
err()  { printf '%s[错误]%s %s\n' "$C_ERR"  "$C_RST" "$1" >&2; }
dim()  { printf '%s%s%s\n' "$C_DIM" "$1" "$C_RST"; }

# ── 参数解析 ─────────────────────────────────────────────────
BASE_URL=""
API_KEY=""
MODEL=""
PROVIDER_NAME=""
PROVIDER_ID="jancode"
SKIP_CHECK=0
SHOW_LIST=0

usage() {
  cat <<'USAGE'
JanCode 一键接入 — 参数说明

  --url    <地址>   中转站 Base URL，例如 https://router.aionclaw.com/v1
                    没写 /v1 会自动补上
  --key    <密钥>   中转站后台生成的 API Key（sk- 开头）
  --model  <模型名> 要用的模型，例如 deepseek-v4-pro
                    不填则用中转站的默认模型
  --name   <名称>   配置里显示的供应商名字，默认「我的中转站」
  --list            只列出该中转站可用的模型，不写任何配置
  --skip-check      跳过连通性校验（不推荐）
  -h, --help        显示本说明

示例：
  bash setup-codex.sh --url https://router.aionclaw.com/v1 --key sk-xxx --model deepseek-v4-pro
  bash setup-codex.sh --url https://router.aionclaw.com/v1 --key sk-xxx --list
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --url)        BASE_URL="${2:-}"; shift 2 ;;
    --key)        API_KEY="${2:-}"; shift 2 ;;
    --model)      MODEL="${2:-}"; shift 2 ;;
    --name)       PROVIDER_NAME="${2:-}"; shift 2 ;;
    --id)         PROVIDER_ID="${2:-}"; shift 2 ;;
    --list)       SHOW_LIST=1; shift ;;
    --skip-check) SKIP_CHECK=1; shift ;;
    -h|--help)    usage; exit 0 ;;
    *)            err "未知参数：$1"; echo; usage; exit 1 ;;
  esac
done

# ── 依赖检查 ─────────────────────────────────────────────────
for bin in curl; do
  command -v "$bin" >/dev/null 2>&1 || { err "缺少必需命令：$bin"; exit 1; }
done

# ── 地址与密钥规范化 ─────────────────────────────────────────
normalize_url() {
  local u="$1"
  u="${u%"${u##*[!/]}"}"          # 去尾斜杠
  case "$u" in
    */v1) : ;;                    # 已是 /v1 结尾，保留
    *)    u="$u/v1" ;;            # 补 /v1
  esac
  printf '%s' "$u"
}

if [ -z "$BASE_URL" ]; then
  err "缺少 --url 参数（中转站地址）"
  echo; usage; exit 1
fi
BASE_URL="$(normalize_url "$BASE_URL")"

if [ -z "$API_KEY" ] && [ "$SHOW_LIST" -eq 0 ]; then
  err "缺少 --key 参数（API Key）"
  echo; usage; exit 1
fi

# 密钥形如 sk-xxx 才像样；不是也不拦，只提醒
case "$API_KEY" in
  sk-*) : ;;
  "")   : ;;
  *)    warn "密钥不是常见的 sk- 开头，继续按原样写入。" ;;
esac

[ -n "$PROVIDER_NAME" ] || PROVIDER_NAME="我的中转站"

printf '\n%s\n' "──────────────────────────────────────────────"
info "中转站地址：$BASE_URL"
if [ -n "$API_KEY" ]; then
  info "API Key   ：${API_KEY:0:7}…${API_KEY: -4}（已隐藏中间部分）"
fi
[ -n "$MODEL" ] && info "模型      ：$MODEL"
printf '%s\n\n' "──────────────────────────────────────────────"

# ── 连通性 / 鉴权校验 ────────────────────────────────────────
http_probe() {
  curl -s -o /tmp/jancode-probe.$$ -w '%{http_code}' --max-time 20 \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $API_KEY" \
    "$@" 2>/dev/null || echo "000"
}

# 查可用模型
list_models() {
  local code
  code="$(http_probe "$BASE_URL/models")"
  case "$code" in
    200)
      if command -v python3 >/dev/null 2>&1; then
        python3 - "$BASE_URL" <<'PY'
import json,sys,urllib.request,os
url=sys.argv[1]+"/models"
key=os.environ.get("JC_KEY","")
req=urllib.request.Request(url,headers={"Authorization":"Bearer "+key})
try:
    d=json.load(urllib.request.urlopen(req,timeout=20))
    ids=sorted(m.get("id","") for m in d.get("data",[]))
    print(f"该中转站共 {len(ids)} 个模型：\n")
    for i in ids: print("  -",i)
except Exception as e:
    print("解析模型列表失败：",e)
PY
      else
        cat /tmp/jancode-probe.$$
      fi
      ;;
    401) err "密钥无效或已过期（401）。请到中转站后台确认 Key 是否启用。" ;;
    000) err "连不上 ${BASE_URL}，请检查网络或地址是否正确。" ;;
    *)   warn "查询模型列表返回 ${code}，跳过。" ;;
  esac
  rm -f /tmp/jancode-probe.$$
}

if [ "$SHOW_LIST" -eq 1 ]; then
  info "正在查询可用模型…"
  JC_KEY="$API_KEY" list_models
  exit 0
fi

if [ "$SKIP_CHECK" -eq 0 ]; then
  info "正在校验中转站连通性与密钥…"
  # 1) 先确认 /responses 路由存在（401/200 都算路由存在，404 说明不支持）
  code="$(http_probe -X POST -d "{\"model\":\"${MODEL:-probe}\",\"input\":\"hi\",\"max_output_tokens\":8}" "$BASE_URL/responses")"
  case "$code" in
    200)
      ok "中转站可用，且原生支持 Responses 协议。" ;;
    401|403)
      err "密钥校验失败（HTTP ${code}）：Key 无效、已过期或未开通该模型。"
      err "请到中转站后台确认后重试。未改动你的任何配置。"
      rm -f /tmp/jancode-probe.$$; exit 1 ;;
    404)
      warn "该中转站不支持 /responses 协议（404）。"
      warn "Codex 26.901 起只接受 Responses 协议，直接接入会失败。"
      warn "请改用 JanCode 管理工具（它会用本地协议代理把 Chat 转成 Responses）。"
      rm -f /tmp/jancode-probe.$$; exit 1 ;;
    429)
      ok "中转站可达（当前限流 429），配置继续写入。" ;;
    000)
      err "连不上 ${BASE_URL}，请检查网络、地址与证书。未改动你的任何配置。"
      rm -f /tmp/jancode-probe.$$; exit 1 ;;
    *)
      warn "校验返回 HTTP ${code}，无法确定状态，继续写入配置。" ;;
  esac
  rm -f /tmp/jancode-probe.$$
else
  warn "已跳过连通性校验。"
fi

# ── 定位 Codex 配置目录 ──────────────────────────────────────
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
JANCODE_HOME="${JANCODE_HOME:-$HOME/.jancode}"
mkdir -p "$CODEX_HOME" "$JANCODE_HOME"

CONFIG_FILE="$CODEX_HOME/config.toml"
AUTH_FILE="$CODEX_HOME/auth.json"
STAMP="$(date +%Y%m%d-%H%M%S)"

# ── 备份 ─────────────────────────────────────────────────────
if [ -f "$CONFIG_FILE" ]; then
  cp "$CONFIG_FILE" "$CONFIG_FILE.bak.$STAMP"
  ok "已备份原配置 → config.toml.bak.$STAMP"
fi
if [ -f "$AUTH_FILE" ]; then
  cp "$AUTH_FILE" "$AUTH_FILE.bak.$STAMP"
  ok "已备份原密钥 → auth.json.bak.$STAMP"
fi

# ── 写入 config.toml（保留原有其它配置，仅替换受管片段）──────
info "正在写入 Codex 配置…"

# 生成合法 TOML 的关键：
#   · 根级键（model / model_provider）必须出现在任何 [section] 之前
#   · [model_providers.<id>] 是一个表，一旦开始，后面的裸键都会归属于它
#   → 因此根级键置顶、provider 表追加到文件末尾，两者不能相邻。
if [ -f "$CONFIG_FILE" ]; then
  awk -v pid="$PROVIDER_ID" '
    BEGIN { in_managed = 0; skip_section = 0 }
    # ① 丢弃上一次写入的整个受管标记块
    /^# ── JanCode 接入配置（/     { in_managed = 1; next }
    /^# ── JanCode 接入配置结束 ──/ { in_managed = 0; next }
    in_managed { next }
    # ② 丢弃已有的 [model_providers.<pid>] 表（直到下一个 section 头为止）
    /^[[:space:]]*\[/ {
      if ($0 ~ "^[[:space:]]*\\[model_providers\\." pid "\\][[:space:]]*$") { skip_section = 1; next }
      skip_section = 0
    }
    skip_section { next }
    # ③ 丢弃根级 model / model_provider（由本脚本统一管理）
    /^[[:space:]]*model[[:space:]]*=/          { next }
    /^[[:space:]]*model_provider[[:space:]]*=/ { next }
    { print }
  ' "$CONFIG_FILE" > "$CONFIG_FILE.jancode-rest"
else
  : > "$CONFIG_FILE.jancode-rest"
fi

{
  # ── 根级键：置顶，位于所有 [section] 之前 ──
  printf '# ── JanCode 接入配置（由 setup-codex.sh 写入，可重复执行覆盖）──\n'
  [ -n "$MODEL" ] && printf 'model = "%s"\n' "$MODEL"
  printf 'model_provider = "%s"\n' "$PROVIDER_ID"
  # ★ 必须有结束标记：awk 靠它关闭 in_managed 状态，
  #   漏掉会导致下一次执行把标记之后的全部内容当成受管块吞掉。
  printf '# ── JanCode 接入配置结束 ──\n'

  # ── 用户原有配置原样接在后面 ──
  if [ -s "$CONFIG_FILE.jancode-rest" ]; then
    echo
    cat "$CONFIG_FILE.jancode-rest"
  fi

  # ── provider 表：追加到最末尾，独占一个 section ──
  echo
  printf '[model_providers.%s]\n' "$PROVIDER_ID"
  printf 'name = "%s"\n' "$PROVIDER_NAME"
  printf 'base_url = "%s"\n' "$BASE_URL"
  # ★ Codex 26.901 起不再接受 wire_api = "chat"，
  #   出现该值会让整份 config.toml 被判无效并回退内置默认模型，
  #   因此这里恒为 "responses"。
  printf 'wire_api = "responses"\n'
  printf 'env_key = "OPENAI_API_KEY"\n'
} > "$CONFIG_FILE.new"
mv "$CONFIG_FILE.new" "$CONFIG_FILE"
rm -f "$CONFIG_FILE.jancode-rest"
ok "Codex 配置已写入 → $CONFIG_FILE"

# ── 写入 auth.json ───────────────────────────────────────────
if command -v python3 >/dev/null 2>&1; then
  JC_KEY="$API_KEY" python3 - "$AUTH_FILE" <<'PY'
import json, os, sys
path = sys.argv[1]
key = os.environ.get("JC_KEY", "")
data = {}
if os.path.exists(path):
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            data = {}
    except Exception:
        data = {}
data["OPENAI_API_KEY"] = key
with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
    f.write("\n")
os.chmod(path, 0o600)
PY
  ok "密钥已写入 → ${AUTH_FILE}（权限 600，仅本人可读）"
else
  printf '{\n  "OPENAI_API_KEY": "%s"\n}\n' "$API_KEY" > "$AUTH_FILE"
  chmod 600 "$AUTH_FILE"
  ok "密钥已写入 → ${AUTH_FILE}（权限 600）"
fi

# ── 同步写入 JanCode 管理工具 ────────────────────────────────
# 让 JanCode 界面里也能直接看到这家供应商，方便切换和查看用量。
SETTINGS_FILE="$JANCODE_HOME/settings.json"
if command -v python3 >/dev/null 2>&1; then
  JC_KEY="$API_KEY" JC_URL="$BASE_URL" JC_MODEL="$MODEL" JC_NAME="$PROVIDER_NAME" \
  JC_ID="$PROVIDER_ID" python3 - "$SETTINGS_FILE" <<'PY'
import json, os, sys

path = sys.argv[1]
key   = os.environ.get("JC_KEY", "")
url   = os.environ.get("JC_URL", "")
model = os.environ.get("JC_MODEL", "")
name  = os.environ.get("JC_NAME", "我的中转站")
pid   = os.environ.get("JC_ID", "jancode")

settings = {}
if os.path.exists(path):
    try:
        with open(path, encoding="utf-8") as f:
            settings = json.load(f)
        if not isinstance(settings, dict):
            settings = {}
    except Exception:
        settings = {}

profile = {
    "id": pid,
    "name": name,
    "upstreamBaseUrl": url,
    "protocol": "responses",
    "relayMode": "pureApi",
    "officialMixApiKey": False,
    "noAuth": False,
    "hideOfficialUsageAlert": False,
    "testModel": model,
    "configContents": "",
    "authContents": "",
    "useCommonConfig": True,
    "contextWindow": "",
    "autoCompactLimit": "",
    "modelInsertMode": "replace",
    "modelList": model,
}

profiles = settings.get("relayProfiles")
if not isinstance(profiles, list) or not profiles:
    profiles = []
# 同 id 覆盖，不同 id 追加 —— 重复执行不会堆叠出重复供应商
profiles = [p for p in profiles if not (isinstance(p, dict) and p.get("id") == pid)]
profiles.append(profile)
settings["relayProfiles"] = profiles
settings["activeRelayId"] = pid
settings["relayApiKey"] = key
settings["relayBaseUrl"] = url
if model:
    settings["relayTestModel"] = model

with open(path, "w", encoding="utf-8") as f:
    json.dump(settings, f, ensure_ascii=False, indent=2)
    f.write("\n")
PY
  ok "JanCode 管理工具已同步 → $SETTINGS_FILE"
else
  warn "未找到 python3，跳过 JanCode 管理工具同步（不影响 Codex 使用）。"
fi

# ── 完成 ─────────────────────────────────────────────────────
echo
printf '%s\n' "──────────────────────────────────────────────"
ok "接入完成！"
echo
echo "接下来："
echo "  1. 完全退出并重新打开 Codex 桌面版（配置在启动时读取）"
echo "  2. 在 Codex 里就能选用刚才配置的模型了"
echo
dim "  配置文件：$CONFIG_FILE"
dim "  密钥文件：$AUTH_FILE"
dim "  原文件已备份为 *.bak.${STAMP}，需要回滚时改回来即可"
printf '%s\n\n' "──────────────────────────────────────────────"
