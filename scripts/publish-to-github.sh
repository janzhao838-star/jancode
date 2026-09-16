#!/usr/bin/env bash
# 把 JanCode 推送到你自己的 GitHub 仓库。
#
# 为什么需要这个脚本：本仓库的 origin 目前指向上游作者的项目
# （github.com/BigPizzaV3/CodexPlusPlus）。直接 git push 会推到别人仓库去，
# 轻则失败，重则把改版推到上游。所以推送前必须先把远端换掉。
#
# AGPL-3.0 要求：分发本软件、或通过网络对外提供其服务时，必须能向使用者提供
# 本修改版的完整对应源码。发布这个仓库就是在履行该义务。
#
# 用法：
#   bash scripts/publish-to-github.sh git@github.com:你的用户名/jancode.git
set -euo pipefail

REMOTE="${1:-}"
if [ -z "$REMOTE" ]; then
  echo "用法：bash scripts/publish-to-github.sh <你的仓库地址>" >&2
  echo "例如：bash scripts/publish-to-github.sh git@github.com:janzhao/jancode.git" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "── 1/4 检查工作区 ──"
if [ -n "$(git status --porcelain)" ]; then
  echo "工作区有未提交改动，请先提交后再发布。" >&2
  git status --short >&2
  exit 1
fi
echo "干净 ✓"

echo "── 2/4 扫描已提交内容中的密钥 ──"
# 只认真正的密钥字面量，避免把文档里的示例误判为泄露
if git grep -nE 'sk-[A-Za-z0-9]{24,}' HEAD -- . >/dev/null 2>&1; then
  echo "发现疑似真实密钥，已中止。请先清除后再发布：" >&2
  git grep -nE 'sk-[A-Za-z0-9]{24,}' HEAD -- . >&2
  exit 1
fi
for f in .env auth.json config.toml; do
  if git ls-files --error-unmatch "$f" >/dev/null 2>&1; then
    echo "检测到被跟踪的 $f，可能含凭据，已中止。" >&2
    exit 1
  fi
done
echo "未发现密钥 ✓"

echo "── 3/4 切换远端 ──"
OLD="$(git remote get-url origin 2>/dev/null || echo '')"
if [ "$OLD" = "$REMOTE" ]; then
  echo "远端已是目标地址 ✓"
else
  if [ -n "$OLD" ]; then
    git remote rename origin upstream 2>/dev/null || true
    echo "原 origin 已改名为 upstream，便于日后同步上游："
    echo "  $OLD"
  fi
  if git remote get-url upstream >/dev/null 2>&1 && [ "$(git remote get-url upstream)" = "$REMOTE" ]; then
    git remote remove upstream
  fi
  git remote add origin "$REMOTE"
  echo "新 origin：$REMOTE"
fi

echo "── 4/4 推送 ──"
git push -u origin "$(git branch --show-current)"

echo
echo "发布完成。请确认仓库为公开可访问："
echo "  1. 源码地址要能从应用「关于」页点开（那里已指向本版源码）"
echo "  2. AGPL-3.0 要求的对应源码义务，由此得到履行"
