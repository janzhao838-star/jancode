/**
 * 「能力开关」标签页展示的开关清单。
 *
 * 单独放在 .ts 模块而不是组件文件里，有两个原因：
 *   1. 数据与展示分离，改开关不需要动组件；
 *   2. Node 的测试运行器无法加载 .tsx，放在组件里会让这份数据无法被测试覆盖。
 *
 * ★ field 必须与 crates/codex-plus-core/src/settings.rs 的 BackendSettings
 *   字段名逐字一致。写错时 serde 会静默忽略：界面上开关能点、看起来也开了，
 *   实际配置文件里什么都没变。roles-library.test.ts 会去 Rust 源码里核对。
 */

export interface CapabilityToggle {
  /** BackendSettings 上的真实字段名 */
  field: string;
  title: string;
  summary: string;
}

export const CAPABILITY_TOGGLES: CapabilityToggle[] = [
  { field: "enhancementsEnabled", title: "增强总开关", summary: "关闭后下面所有 Codex 增强功能一并失效" },
  { field: "codexAppSessionDelete", title: "会话删除", summary: "在 Codex 会话列表里提供删除入口" },
  { field: "codexAppMarkdownExport", title: "Markdown 导出", summary: "把会话导出为 Markdown 文件" },
  { field: "codexAppPluginMarketplaceUnlock", title: "解锁插件市场", summary: "解除插件市场的区域与账号限制" },
  { field: "codexAppModelWhitelistUnlock", title: "解锁模型白名单", summary: "允许选用未在官方白名单中的模型" },
  { field: "codexAppPasteFix", title: "粘贴修复", summary: "修复长文本粘贴被截断的问题" },
  { field: "codexAppForceChineseLocale", title: "强制中文界面", summary: "忽略系统语言，界面固定为中文" },
  { field: "codexAppFastStartup", title: "快速启动", summary: "跳过部分启动期检查以加快冷启动" },
  { field: "codexAppConversationView", title: "对话视图", summary: "启用会话的对话式阅读视图" },
  { field: "codexAppThreadScrollRestore", title: "滚动位置恢复", summary: "重新打开会话时回到上次的阅读位置" },
  { field: "codexAppThreadIdBadge", title: "会话 ID 角标", summary: "在界面上显示当前会话 ID，便于排查" },
  { field: "codexAppAnswerOutlineEnabled", title: "回答大纲", summary: "在长回答旁显示可跳转的要点大纲" },
  { field: "codexAppStepwiseEnabled", title: "分步引导", summary: "把复杂任务拆成一步步确认再执行" },
];
