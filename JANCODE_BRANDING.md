# JanCode —— 品牌定制改动记录（AGPL-3.0 §5 声明）

本仓库是 **BigPizzaV3/CodexPlusPlus** 的修改版，改造为 janzhao 专用的桌面应用 **JanCode**。

- 上游项目：https://github.com/BigPizzaV3/CodexPlusPlus
- 上游官网：https://codexpp.cc/
- 基线提交：`main` @ v1.3.0（2026-09-10 发布）
- 改动日期：**2026-09-16**
- 改动者：janzhao（由 DeepSeek/DSH 协助执行）
- 许可证：**GNU Affero General Public License v3.0（AGPL-3.0-only）**，与上游一致，未变更

> **AGPL-3.0 §5 声明**：本文件即对本仓库相对上游所做修改的显著声明。所有被修改的文件均已改动，改动日期为上列日期。原始版权声明与 `LICENSE` 文件完整保留。

---

## 一、为什么改

上游 Codex++ 是"面向 OpenAI Codex / ChatGPT 桌面应用的增强启动器"。用户需要一份**自有品牌、独立数据目录、并把模型 API 指向自己中转站**的专属版本，且不能与已安装的 Codex++ 互相干扰、不能在自动更新时被上游安装包覆盖。

## 二、改动清单

### 1. 品牌常量（单一事实来源）

`crates/codex-plus-core/src/install/mod.rs`

| 常量 | 上游值 | JanCode 值 |
| --- | --- | --- |
| `SILENT_NAME` | `Codex++` | `JanCode` |
| `MANAGER_NAME` | `Codex++ 管理工具` | `JanCode 管理工具` |
| `SILENT_BINARY` | `codex-plus-plus` | `jancode` |
| `MACOS_SILENT_EXECUTABLE` | `CodexPlusPlus` | `JanCode` |
| `MANAGER_BINARY` | `codex-plus-plus-manager` | `jancode-manager` |
| `MACOS_MANAGER_EXECUTABLE` | *(硬编码)* | `JanCodeManager` |
| `SILENT_BUNDLE_ID` | `com.bigpizzav3.codexplusplus` | `com.janzhao.jancode` |
| `MANAGER_BUNDLE_ID` | `com.bigpizzav3.codexplusplus.manager` | `com.janzhao.jancode.manager` |

新增常量：`ICON_FILE_NAME`、`MACOS_MANAGER_EXECUTABLE`、`URL_SCHEME_MAIN`、`URL_SCHEME_SKIN`。

### 2. macOS 应用包

`crates/codex-plus-core/src/install/macos.rs`

- `Info.plist` 的 `CFBundleIdentifier` 改为引用常量（不再硬编码上游 Bundle ID）
- `CFBundleIconFile` 由 `codex-plus-plus.png` 改为 `jancode.png`
- 「关于」的 URL 类型名由 `Codex++ Links` 改为 `JanCode Links`
- 应用包名、可执行名、错误文案随常量切换

### 3. Windows 入口与注册表

`crates/codex-plus-core/src/install/windows.rs`

- 卸载登记键：`...\Uninstall\CodexPlusPlus` → `...\Uninstall\JanCode`
- **刻意不再删除上游 `Codex++` 的卸载登记键**：JanCode 与 Codex++ 可能同时安装，卸载其一不应破坏另一个
- 快捷方式名、描述、`DisplayName`、`Publisher` 改为 JanCode
- 图标 `codex-plus-plus.ico` → `jancode.ico`

### 4. 独立数据目录

`crates/codex-plus-core/src/paths.rs`

- 应用状态目录：`~/.codex-session-delete` → **`~/.jancode`**
- 诊断日志：`codex-plus.log` → `jancode.log`
- Windows 配置目录：`%APPDATA%\Codex++` → `%APPDATA%\JanCode`

**影响**：JanCode 与 Codex++ 的设置、技能、主题、备份完全隔离，互不覆盖。

### 5. 更新源（重要安全改动）

`crates/codex-plus-core/src/update.rs`

- `DEFAULT_REPOSITORY`：`BigPizzaV3/CodexPlusPlus` → `janzhao/jancode`
- `DEFAULT_LATEST_JSON_URL` 同步指向 JanCode 自己的 release

**原因**：若继续指向上游，JanCode 会把 Codex++ 的安装包认作"新版本"下载并覆盖自身，品牌与全部定制改动会被抹掉。在 JanCode 自己的仓库发布带 `latest.json` 的 release 前，更新检查会失败退出（安全的失败方向）。

### 6. 界面文案与资源

- `apps/codex-plus-manager/src/*.{ts,tsx}`：全部用户可见的 `Codex++` 文案改为 `JanCode`（i18n 为「中文原文即 key」结构，中文与英文词条同步替换）
- `assets/inject/renderer-inject.js`：注入 Codex 的增强菜单内文案同步改名
- `apps/codex-plus-manager/src-tauri/tauri.conf.json`：`productName`、`identifier`、窗口标题、`assetProtocol` 作用域（随数据目录）
- 图标资源全部替换为 JanCode 图标（`src-tauri/icons/icon.png`、`icon.ico`、`assets/images/jancode.{png,ico}`）

### 7. 构建与发布链

- `apps/codex-plus-launcher/Cargo.toml`：`[[bin]] name = "jancode"`
- `apps/codex-plus-manager/src-tauri/Cargo.toml`：`[[bin]] name = "jancode-manager"`
- `scripts/installer/macos/package-dmg.sh`、`scripts/installer/windows/JanCode.nsi`（由 `CodexPlusPlus.nsi` 改名）
- `.github/workflows/{release-assets,pr-build}.yml`：产物名 `JanCode-<版本>-<平台>.<ext>`
- `Cargo.toml` 工作区 `repository` 指向 JanCode 仓库

### 8. 上游缺陷修复（非品牌改动）

`crates/codex-plus-core/src/settings.rs` — `impl Default for BackendSettings`

上游在 `load` / `save` / `normalize_settings_config_sections` 三处都会调用 `sync_tool_shards()` 以维持「扁平字段 ↔ `tools.codex` 分片」不漂移，唯独 `Default` 漏掉了这一步。后果是 `BackendSettings::default()` 的 `tools` 为空，而 `load()` 返回的 `tools` 含 Codex 分片，两者不相等，导致上游 `settings` 模块 3 个测试长期失败。

修复方式：在 `Default` 末尾补上同一步镜像，使默认值与加载结果严格一致。**此改动可回馈上游。**

---

## 三、刻意保持不变的部分

以下几点**看起来像品牌字面量，但改动会破坏功能或违反互操作约定**，因此有意保留：

| 保留项 | 位置 | 原因 |
| --- | --- | --- |
| URL 协议 `codexplusplus://`、`dreamskin://` | `install/mod.rs`、`install/windows.rs` | 与上游社区互操作的标识。改成 `jancode://` 会让社区**会话分享链接**和 **DreamSkin 皮肤市场**链接全部失效 |
| `codex-plus-*` DOM 类名与 `data-codex-plus-*` 属性 | `assets/inject/renderer-inject.js`，并断言于 `crates/codex-plus-core/tests/cdp_bridge.rs` | 内部契约，随 Rust 测试与注入脚本耦合；改名无用户可见收益却会大范围破坏 |
| 上游社区市场地址 | `codex-plus-core/src/{script_market,dream_skin_market,ads}.rs` | 脚本市场、主题市场是社区内容源，JanCode 复用其内容属于正常使用 |
| "OpenAI Codex" / "ChatGPT" / "Codex App" 等字样 | 全仓 | 指的是**被管理的目标产品**，不是本应用品牌。改名会误导用户 |
| `LICENSE` 与上游版权声明 | 仓库根 | AGPL-3.0 强制要求保留 |

---

## 四、接入自建中转站

JanCode 通过「供应商 / 中转配置」（`RelayProfile`）指向任意 OpenAI 兼容端点，无需改代码：

- 在管理工具中新建供应商，填入中转站 Base URL 与 API Key
- 协议可选 `Responses` 或 `Chat Completions`
- 可设置模型列表、上下文窗口、自动压缩阈值、模型元数据等

## 五、分发义务提醒

AGPL-3.0 允许修改与分发，但要求：

1. **保留许可证与版权声明**（本仓库已保留 `LICENSE` 与上游声明）
2. **显著声明修改**（本文件）
3. **向接收者提供完整对应源代码**，包括你修改后的版本
4. **通过网络提供修改版服务时，也须向使用者提供源代码**

换言之：你可以自己用、可以装在自己电脑上，但**把 JanCode 安装包发给别人时，必须同时给出这份（修改后的）源码**。若将来对外提供下载，建议在下载页放置源码链接。
