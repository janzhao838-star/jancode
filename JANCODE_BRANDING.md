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

### 7. 视觉识别：配色与图标

- `apps/codex-plus-manager/src/styles.css`：`:root,.dark` 与 `.light` 两套色板整体替换为自建站点色系
  - 主色 `--brand-accent` `252 90% 68%`（#7c5cff 紫）、辅色 `--brand-accent-2` `189 100% 50%`（#00d8ff 青）
  - 底色 `232 33% 5%`（#080910），卡片 `230 31% 11.5%`，外壳 `232 36% 4%`
  - 语义色沿用：成功 `158 60% 58%`、警告 `45 100% 51%`
- 图标改为机器人造型（`branding/jancode-icon.svg`）：紫→青 135° 线性渐变圆角方块，
  以 mask 挖出机器人轮廓（天线、双耳、头部）与内部的眼睛、嘴部栅格，挖空处透出底层渐变。
  由该 SVG 渲染出 1024² 母版，再派生 `jancode-512.png`、`jancode.ico`（16/32/48/64/128/256 七种尺寸）
  与 `jancode.icns`；分发到 `src-tauri/icons/`、`assets/images/`。
  旧的字形图标备份于 `branding/archive/jancode-icon-letterform.{svg,png}.bak`。

### 8. 内置供应商预设的调整

- `apps/codex-plus-manager/src/presets.ts`：
  - **移除全部国外厂商预设**（`openai`、`minimax-global`、`openrouter`、`novita`、`azure`）。
    本定制版定位为面向国内模型的中转客户端，不再提供国外直连渠道。
  - `PresetCategory` 收窄为 `"aggregator" | "cn_official"`。
  - 自建站点预设排到列表最前：`aionclaw`（router.aionclaw.com）、`junzi-ai`（charlene.cat:9090）、
    `janzhao-dgx-gateway`（ai.janzhao.cn:9090）。
- `apps/codex-plus-manager/src/presets.test.ts`：改为「国内渠道回归守卫」——
  断言不存在国外预设 id、分类集合恰为两类、自建站点占据前三。
- `components/ProviderPresetSelector.tsx`：`official` 分类分支随之移除，恒走 `pureApi` 中转模式。

### 9. 一键接入脚本（客户端侧）

面向最终用户的命令行接入工具，与上游无关，为本定制版新增：

- `scripts/setup-jancode.sh`（macOS / Linux）
- `scripts/setup-jancode.ps1`（Windows）

行为约定：

1. URL 归一化为以 `/v1` 结尾；`POST /v1/responses` 探活。
   返回 401/403 视为密钥无效，**直接中止且不改动任何既有配置**；404 说明该端点不提供
   Responses 协议，中止并提示（Codex 26.901 起不接受 `wire_api = "chat"`，写了会让整份
   config.toml 失效并回退内置默认模型，因此不能降级为 chat 了事）。
2. 写入前把 `config.toml` 与 `auth.json` 备份为 `*.bak.<时间戳>`。
3. 生成的 config.toml 保证合法：**根级键（`model` / `model_provider`）必须排在所有 `[section]` 之前**，
   `[model_providers.<id>]` 表追加到文件末尾。否则 TOML 语义会把用户原有的根级配置吞进 provider 表。
4. 用 `# ── JanCode 接入配置（…）──` 与 `# ── JanCode 接入配置结束 ──` 成对标记圈定托管区，
   重复执行只替换托管区，幂等且不重复追加。
5. `auth.json` 以 0600 权限写入；同步 `~/.jancode/settings.json` 的 `relayProfiles`（同 id 覆盖，不新增重复项）。

### 10. 技能中心面板

- `apps/codex-plus-manager/src/skills-library.ts`：内置技能库与触发词匹配引擎（纯数据 + 纯函数）。
  12 个面向中文开发场景的技能，每个含名称、说明、触发词、中文提示词正文；区分常用与进阶。
  匹配规则：中英文触发词、大小写不敏感、中英文标点插入不影响命中、命中强度按触发词数量与
  具体程度累加、同分按 id 升序保证稳定、无命中返回空数组。
- `roles-library.ts`：内置角色库（8 个中文人设）。角色与技能的区别是：技能按任务触发、可同时
  命中多个；角色决定回答的立场与口吻，**单选**。`activeRole` 在 id 不存在时返回 `undefined`
  而不是退回默认角色——否则用户会以为生效的是自己选的那个。
- `capability-toggles.ts`：能力开关清单。`field` 必须与 `crates/codex-plus-core/src/settings.rs`
  的 `BackendSettings` 字段逐字对应（TS 用 camelCase、Rust 用 snake_case + `#[serde(rename)]`）。
- `components/SkillsCenterPanel.tsx`：四个标签页
  - 技能库：浏览/搜索/启用，专家模式切换
  - 触发测试：输入任务描述，实时显示命中技能与强度
  - 角色库：单选角色，可取消
  - 能力开关：直接读写设置的增强开关，总开关关闭时其余项标注为不生效
  设计参考 ZeroCode 的技能系统。开关数据放在独立 `.ts` 模块而非组件文件，既是数据与展示分离，
  也因为 Node 测试运行器无法加载 `.tsx`，放在组件里这份数据就无法被测试覆盖。
- `roles-library.test.ts`：除数据完整性外，有一条关键断言——**每个开关 field 都必须真实存在于
  Rust 的 `BackendSettings`**。写错字段名时 serde 会静默忽略：界面上开关能点、看起来也开了，
  实际配置里什么都没变。该断言在实现时当场查出 `codexAppForcePluginInstall` 并不存在
  （它只出现在 `settings.rs` 的一段历史迁移测试夹具里，既非真实字段、前端也没有），已换为
  `codexAppAnswerOutlineEnabled` 与 `codexAppStepwiseEnabled`。
- `App.tsx`：`skills` 路由此前已在 `Route` 类型中声明，但从未出现在任何导航组与渲染分支中，
  属上游未接线的空壳；本次补齐导航项、分组、渲染分支与副标题。
- 技能启用状态存于 webview `localStorage`（键前缀 `jancode.skills.`）。未写入 `BackendSettings`，
  以免为此改动 Rust 结构体的 serde 定义与 `Default` 实现、牵连既有 settings 测试。

### 11. 构建与发布链

- `apps/codex-plus-launcher/Cargo.toml`：`[[bin]] name = "jancode"`
- `apps/codex-plus-manager/src-tauri/Cargo.toml`：`[[bin]] name = "jancode-manager"`
- `scripts/installer/macos/package-dmg.sh`、`scripts/installer/windows/JanCode.nsi`（由 `CodexPlusPlus.nsi` 改名）
- `.github/workflows/{release-assets,pr-build}.yml`：产物名 `JanCode-<版本>-<平台>.<ext>`
- `Cargo.toml` 工作区 `repository` 指向 JanCode 仓库

### 12. 上游缺陷修复（非品牌改动）

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
