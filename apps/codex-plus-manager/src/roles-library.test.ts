import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, test } from "node:test";
import { BUILTIN_ROLES, activeRole, roleById, rolePrompt } from "./roles-library.ts";
import { CAPABILITY_TOGGLES } from "./capability-toggles.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));

describe("内置角色库数据完整性", () => {
  it("每个角色字段齐全且 id 唯一", () => {
    const ids = new Set<string>();
    for (const role of BUILTIN_ROLES) {
      assert.ok(role.id.length > 0, "id 不能为空");
      assert.ok(!ids.has(role.id), `id 重复：${role.id}`);
      ids.add(role.id);
      assert.ok(role.name.trim().length > 0, `${role.id} 缺少名称`);
      assert.ok(role.summary.trim().length > 0, `${role.id} 缺少说明`);
      assert.ok(role.prompt.trim().length > 20, `${role.id} 的提示词过短`);
    }
  });

  it("角色数量在合理区间", () => {
    assert.ok(BUILTIN_ROLES.length >= 5, `角色过少：${BUILTIN_ROLES.length}`);
    assert.ok(BUILTIN_ROLES.length <= 16, `角色过多：${BUILTIN_ROLES.length}`);
  });
});

describe("角色选择语义", () => {
  it("按 id 能查到角色", () => {
    const first = BUILTIN_ROLES[0];
    assert.strictEqual(roleById(first.id)?.id, first.id);
  });

  it("空 id 表示不指定角色", () => {
    assert.strictEqual(activeRole(""), undefined);
    assert.strictEqual(rolePrompt(""), "");
  });

  it("id 不存在时返回 undefined，而不是悄悄退回第一个角色", () => {
    // 这一条很重要：若退回默认角色，用户会以为生效的是自己选的那个。
    assert.strictEqual(activeRole("no-such-role"), undefined);
    assert.strictEqual(rolePrompt("no-such-role"), "");
  });

  it("角色是单选：activeRole 每次最多返回一个", () => {
    const result = activeRole(BUILTIN_ROLES[1].id);
    assert.ok(result);
    assert.ok(!Array.isArray(result), "角色必须是单值而非列表");
  });

  it("rolePrompt 返回该角色自己的提示词", () => {
    for (const role of BUILTIN_ROLES.slice(0, 3)) {
      assert.strictEqual(rolePrompt(role.id), role.prompt);
    }
  });
});

describe("能力开关字段名必须是后端真实字段", () => {
  it("每个 field 都能在 BackendSettings 里找到", () => {
    // 这是本文件最重要的一条断言。
    // 字段名写错时 serde 会静默忽略，界面上开关能点、看起来也开了，
    // 实际配置里什么都没变——用户只会觉得「这个开关没用」。
    // 因此直接去 Rust 源码里核对字段名。
    const settingsPath = path.resolve(
      HERE,
      "../../../crates/codex-plus-core/src/settings.rs",
    );
    const source = fs.readFileSync(settingsPath, "utf-8");

    // BackendSettings 结构体正文
    const start = source.indexOf("pub struct BackendSettings");
    assert.ok(start >= 0, "找不到 BackendSettings 结构体");
    const end = source.indexOf("\n}", start);
    assert.ok(end > start, "找不到结构体结尾");
    const body = source.slice(start, end);

    // TS 用 camelCase，Rust 用 snake_case + #[serde(rename)]。
    // 因此一个字段名要么能直接对应 snake_case 字段，要么出现在某个 rename 里。
    const toSnake = (name: string) =>
      name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

    assert.ok(CAPABILITY_TOGGLES.length > 0);
    for (const item of CAPABILITY_TOGGLES) {
      with_(item.field, () => {
        const snake = toSnake(item.field);
        const asField = body.includes("pub " + snake + ":");
        const asRename = body.includes('rename = "' + item.field + '"');
        assert.ok(
          asField || asRename,
          `BackendSettings 里没有字段 ${item.field}（既无 pub ${snake} 也无 rename）——`
          + "界面开关会静默失效",
        );
      });
    }

    // 这里刻意只做单向断言（面板里的字段必须真实存在），
    // 不要求「结构体里每个布尔字段都出现在面板上」——面板是有意做的精选子集，
    // Zed 远程、微信连接、皮肤等开关各自归属对应页面，不该堆到这里来。
    const boolFields = Array.from(body.matchAll(/pub ([a-z_]+): bool/g)).map((m) => m[1]);
    assert.ok(boolFields.length > 0, "没有解析到任何布尔字段，说明结构体格式变了");
  });

  it("开关的 field 不重复", () => {
    const seen = new Set<string>();
    for (const item of CAPABILITY_TOGGLES) {
      assert.ok(!seen.has(item.field), `开关字段重复：${item.field}`);
      seen.add(item.field);
    }
  });

  it("每个开关都有中文标题与说明", () => {
    for (const item of CAPABILITY_TOGGLES) {
      assert.ok(item.title.trim().length > 0, `${item.field} 缺少标题`);
      assert.ok(item.summary.trim().length > 0, `${item.field} 缺少说明`);
      assert.ok(
        /[\u4e00-\u9fa5]/.test(item.title),
        `${item.field} 的标题应当是中文`,
      );
    }
  });

  it("增强总开关必须排在第一位", () => {
    // 总开关关闭时其余开关都不生效，放第一位用户才不会漏看。
    assert.strictEqual(CAPABILITY_TOGGLES[0].field, "enhancementsEnabled");
  });
});

function with_(label: string, fn: () => void) {
  try {
    fn();
  } catch (error) {
    throw new Error(`[${label}] ${(error as Error).message}`);
  }
}

test("角色库与技能库是两套独立数据", () => {
  // 角色是单选、技能是多选，两者不应混淆
  assert.ok(BUILTIN_ROLES.length > 0);
  const roleIds = new Set(BUILTIN_ROLES.map((r) => r.id));
  assert.strictEqual(roleIds.size, BUILTIN_ROLES.length);
});
