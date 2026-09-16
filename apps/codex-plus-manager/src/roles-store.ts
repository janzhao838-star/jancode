/**
 * 自定义智能体（角色）的存取与校验逻辑。
 *
 * 为什么单独一个纯 .ts：Node 的测试跑不了 .tsx，而这一页最容易出事的地方
 * 全在「读别人写坏的 localStorage」和「校验用户输入」上——这两件事必须被测到。
 * 读写一律通过参数进出（不直接碰 window），测试才能喂进各种脏数据。
 *
 * 存储约定（与 skills-library 同前缀，都是纯界面偏好，不写进 BackendSettings）：
 *   jancode.roles.custom    —— 自定义角色的 JSON 数组
 *   jancode.roles.selected  —— 当前生效的角色 id（技能中心也用这个键）
 */

// 带 .ts 后缀：这个模块要被 Node 的测试运行器直接加载，省略后缀它解析不到
// （仓库里的 model-metadata.ts / model-windows.ts 也是同样的写法）
import { BUILTIN_ROLES, type Role } from "./roles-library.ts";

export { BUILTIN_ROLES };
export type { Role };

export const CUSTOM_ROLES_STORAGE_KEY = "jancode.roles.custom";
export const SELECTED_ROLE_STORAGE_KEY = "jancode.roles.selected";

/** 名称与提示词的长度上限。防止一屏塞不下的提示词把界面撑坏，也防止误粘贴整份文档。 */
export const MAX_NAME_LENGTH = 24;
export const MAX_SUMMARY_LENGTH = 60;
export const MAX_PROMPT_LENGTH = 4000;

/** 自定义角色的 id 前缀。带前缀才好一眼分辨，也避免和内置 id 撞车。 */
const CUSTOM_ID_PREFIX = "custom-";

/** 只保留内置角色真正用到的字段，多余字段一律丢掉（历史版本可能写过别的） */
function normalizeRole(value: unknown): Role | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const summary = typeof record.summary === "string" ? record.summary.trim() : "";
  const prompt = typeof record.prompt === "string" ? record.prompt.trim() : "";
  if (!id || !name || !prompt) return null;
  return { id, name, summary, prompt };
}

/**
 * 解析本地存的自定义角色。
 *
 * 这是「别人写坏的数据」进入界面的唯一入口，所以每一步都容错：
 * JSON 坏掉、不是数组、条目缺字段、id 与内置角色冲突、id 重复——全部丢弃而不是抛错。
 * 丢错了顶多少个自定义角色，抛错会让整个页面打不开。
 */
export function parseCustomRoles(raw: string | null): Role[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const builtinIds = new Set(BUILTIN_ROLES.map((role) => role.id));
  const seen = new Set<string>();
  const roles: Role[] = [];
  for (const entry of parsed) {
    const role = normalizeRole(entry);
    if (!role) continue;
    // 与内置角色同 id：内置的优先，丢掉这一条，避免出现两个同名同 id 的卡片
    if (builtinIds.has(role.id)) continue;
    if (seen.has(role.id)) continue;
    seen.add(role.id);
    roles.push(role);
  }
  return roles;
}

export function serializeCustomRoles(roles: Role[]): string {
  return JSON.stringify(roles);
}

/** 内置在前、自定义在后：内置是基准，用户加的东西放在一起方便找 */
export function mergeRoles(custom: Role[], builtin: Role[] = BUILTIN_ROLES): Role[] {
  return [...builtin, ...custom];
}

/** 内置角色不允许改也不允许删——它们是随版本走的基准 */
export function isBuiltinRole(id: string, builtin: Role[] = BUILTIN_ROLES): boolean {
  return builtin.some((role) => role.id === id);
}

/** 由名称生成一个稳定且不冲突的 id */
export function createRoleId(name: string, existing: Role[]): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  const taken = new Set(existing.map((role) => role.id));
  const base = `${CUSTOM_ID_PREFIX}${slug || "role"}`;
  if (!taken.has(base)) return base;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}-${index}`;
    if (!taken.has(candidate)) return candidate;
  }
  // 理论上到不了这里；真到了也要返回一个不冲突的，而不是覆盖别人的角色
  return `${base}-${Date.now()}`;
}

export interface RoleDraft {
  id: string;
  name: string;
  summary: string;
  prompt: string;
}

/**
 * 校验一份草稿。
 *
 * 返回中文错误列表（空数组表示通过）。编辑已有角色时要传 originalId，
 * 否则「和自己的名字重复」会被误报成重名。
 */
export function validateRoleDraft(
  draft: RoleDraft,
  existing: Role[],
  originalId?: string,
): string[] {
  const errors: string[] = [];
  const name = draft.name.trim();
  const prompt = draft.prompt.trim();

  if (!name) errors.push("名称不能为空");
  else if (name.length > MAX_NAME_LENGTH) {
    errors.push(`名称最多 ${MAX_NAME_LENGTH} 个字`);
  } else if (
    existing.some((role) => role.id !== originalId && role.name.trim() === name)
  ) {
    errors.push(`已经有叫「${name}」的智能体了`);
  }

  if (draft.summary.trim().length > MAX_SUMMARY_LENGTH) {
    errors.push(`一句话说明最多 ${MAX_SUMMARY_LENGTH} 个字`);
  }
  if (!prompt) errors.push("系统提示词不能为空，否则这个智能体没有任何作用");
  else if (prompt.length > MAX_PROMPT_LENGTH) {
    errors.push(`系统提示词最多 ${MAX_PROMPT_LENGTH} 个字`);
  }
  return errors;
}

/** 新建或替换。id 已存在时替换，不存在时追加——保持原有顺序，避免列表跳动。 */
export function upsertRole(roles: Role[], role: Role): Role[] {
  const index = roles.findIndex((item) => item.id === role.id);
  if (index === -1) return [...roles, role];
  const next = [...roles];
  next[index] = role;
  return next;
}

export function removeRole(roles: Role[], id: string): Role[] {
  return roles.filter((role) => role.id !== id);
}

/** 搜索：按名称、说明、提示词正文匹配。多个词要求全部命中。 */
export function filterRoles(roles: Role[], query: string): Role[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return roles;
  return roles.filter((role) => {
    const haystack = `${role.name} ${role.summary} ${role.prompt}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

/** 当前生效的角色。id 找不到时返回 undefined——不悄悄退回第一个，那会让人以为选中的是别的 */
export function resolveActiveRole(id: string, roles: Role[]): Role | undefined {
  return id ? roles.find((role) => role.id === id) : undefined;
}

/** 提示词预览：折叠时只显示一小段，避免长提示词把卡片撑成一面墙 */
export function promptPreview(prompt: string, limit = 90): string {
  const text = prompt.trim().replace(/\s+/g, " ");
  return text.length <= limit ? text : `${text.slice(0, limit)}…`;
}
