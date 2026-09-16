import assert from "node:assert";
import { describe, it } from "node:test";
import { BUILTIN_ROLES, type Role } from "./roles-library.ts";
import {
  createRoleId,
  filterRoles,
  isBuiltinRole,
  mergeRoles,
  parseCustomRoles,
  promptPreview,
  removeRole,
  resolveActiveRole,
  serializeCustomRoles,
  upsertRole,
  validateRoleDraft,
  MAX_NAME_LENGTH,
  MAX_PROMPT_LENGTH,
} from "./roles-store.ts";

const role = (id: string, name = id, prompt = "提示词"): Role => ({
  id,
  name,
  summary: "说明",
  prompt,
});

describe("解析本地存的自定义角色", () => {
  it("正常数据能读回来", () => {
    const roles = [role("custom-a", "甲"), role("custom-b", "乙")];
    assert.deepStrictEqual(parseCustomRoles(serializeCustomRoles(roles)), roles);
  });

  it("空值与空串返回空数组", () => {
    assert.deepStrictEqual(parseCustomRoles(null), []);
    assert.deepStrictEqual(parseCustomRoles(""), []);
  });

  it("JSON 坏掉时返回空数组，而不是抛错把页面带崩", () => {
    // 这一条守着一个真实场景：localStorage 里可能是被别的版本写坏的半截 JSON。
    // 抛错会让整个智能体页打不开，丢几条自定义角色只是可惜。
    assert.deepStrictEqual(parseCustomRoles("{不是合法 JSON"), []);
    assert.deepStrictEqual(parseCustomRoles("[1,2,"), []);
  });

  it("不是数组就丢弃", () => {
    assert.deepStrictEqual(parseCustomRoles('{"id":"x"}'), []);
    assert.deepStrictEqual(parseCustomRoles("null"), []);
    assert.deepStrictEqual(parseCustomRoles('"字符串"'), []);
  });

  it("缺字段的条目被丢掉，好的条目照常留下", () => {
    const raw = JSON.stringify([
      { id: "custom-ok", name: "好的", summary: "s", prompt: "p" },
      { id: "custom-no-prompt", name: "缺提示词" },
      { name: "缺 id", prompt: "p" },
      { id: "custom-blank", name: "   ", prompt: "p" },
      null,
      "字符串",
    ]);
    assert.deepStrictEqual(parseCustomRoles(raw).map((r) => r.id), ["custom-ok"]);
  });

  it("id 与内置角色冲突时丢掉自定义的那条（内置优先）", () => {
    const builtinId = BUILTIN_ROLES[0].id;
    const raw = JSON.stringify([{ id: builtinId, name: "冒名顶替", summary: "", prompt: "p" }]);
    assert.deepStrictEqual(parseCustomRoles(raw), []);
  });

  it("id 重复时只留第一条", () => {
    const raw = JSON.stringify([
      { id: "custom-dup", name: "第一条", summary: "", prompt: "p" },
      { id: "custom-dup", name: "第二条", summary: "", prompt: "p" },
    ]);
    assert.deepStrictEqual(parseCustomRoles(raw).map((r) => r.name), ["第一条"]);
  });

  it("多余字段被丢掉，不会带进界面", () => {
    const raw = JSON.stringify([
      { id: "custom-x", name: "甲", summary: "s", prompt: "p", 恶意字段: "值", icon: "🎯" },
    ]);
    assert.deepStrictEqual(Object.keys(parseCustomRoles(raw)[0]).sort(), [
      "id",
      "name",
      "prompt",
      "summary",
    ]);
  });

  it("首尾空白被清掉", () => {
    const raw = JSON.stringify([{ id: " custom-x ", name: " 甲 ", summary: " s ", prompt: " p " }]);
    assert.deepStrictEqual(parseCustomRoles(raw)[0], {
      id: "custom-x",
      name: "甲",
      summary: "s",
      prompt: "p",
    });
  });
});

describe("合并内置与自定义", () => {
  it("内置在前，自定义在后", () => {
    const merged = mergeRoles([role("custom-a", "甲")]);
    assert.strictEqual(merged.length, BUILTIN_ROLES.length + 1);
    assert.strictEqual(merged[merged.length - 1].id, "custom-a");
  });

  it("内置角色识别得到，自定义的不算", () => {
    assert.strictEqual(isBuiltinRole(BUILTIN_ROLES[0].id), true);
    assert.strictEqual(isBuiltinRole("custom-a"), false);
  });
});

describe("生成 id", () => {
  it("带 custom- 前缀，便于一眼分辨", () => {
    assert.ok(createRoleId("代码审查", []).startsWith("custom-"));
  });

  it("中文名也能生成可用的 id", () => {
    assert.strictEqual(createRoleId("代码审查", []), "custom-代码审查");
  });

  it("冲突时自动加序号，而不是覆盖已有角色", () => {
    const existing = [role("custom-审查", "审查")];
    assert.strictEqual(createRoleId("审查", existing), "custom-审查-2");
  });

  it("名字里全是符号时仍返回可用 id", () => {
    // 不做兜底会生成 "custom-"，一个空 slug 的 id
    assert.strictEqual(createRoleId("!!!", []), "custom-role");
    assert.strictEqual(createRoleId("   ", []), "custom-role");
  });
});

describe("校验草稿", () => {
  const existing = [role("custom-a", "已经有的名字")];

  it("正常草稿没有错误", () => {
    assert.deepStrictEqual(
      validateRoleDraft({ id: "custom-b", name: "新角色", summary: "说明", prompt: "提示词" }, existing),
      [],
    );
  });

  it("名称为空报错", () => {
    const errors = validateRoleDraft({ id: "", name: "  ", summary: "", prompt: "p" }, existing);
    assert.ok(errors.some((e) => e.includes("名称不能为空")));
  });

  it("重名报错", () => {
    const errors = validateRoleDraft(
      { id: "custom-c", name: "已经有的名字", summary: "", prompt: "p" },
      existing,
    );
    assert.ok(errors.some((e) => e.includes("已经有叫")));
  });

  it("改自己的名字不算重名", () => {
    // 少了 originalId 的话，编辑一个角色但没改名字会被误报成重名，用户就改不动了
    const errors = validateRoleDraft(
      { id: "custom-a", name: "已经有的名字", summary: "", prompt: "p" },
      existing,
      "custom-a",
    );
    assert.deepStrictEqual(errors, []);
  });

  it("提示词为空报错，并说明为什么", () => {
    const errors = validateRoleDraft({ id: "", name: "甲", summary: "", prompt: "   " }, existing);
    assert.strictEqual(errors.length, 1);
    assert.ok(errors[0].includes("没有任何作用"));
  });

  it("超长报错", () => {
    assert.ok(
      validateRoleDraft(
        { id: "", name: "甲".repeat(MAX_NAME_LENGTH + 1), summary: "", prompt: "p" },
        existing,
      ).some((e) => e.includes("名称最多")),
    );
    assert.ok(
      validateRoleDraft(
        { id: "", name: "甲", summary: "", prompt: "p".repeat(MAX_PROMPT_LENGTH + 1) },
        existing,
      ).some((e) => e.includes("系统提示词最多")),
    );
  });

  it("名字两端有空格时按去掉后的结果比较", () => {
    const errors = validateRoleDraft(
      { id: "custom-c", name: "  已经有的名字  ", summary: "", prompt: "p" },
      existing,
    );
    assert.ok(errors.some((e) => e.includes("已经有叫")));
  });
});

describe("增删改", () => {
  it("新增追加在末尾", () => {
    const next = upsertRole([role("custom-a")], role("custom-b"));
    assert.deepStrictEqual(next.map((r) => r.id), ["custom-a", "custom-b"]);
  });

  it("同 id 是替换而不是追加两条", () => {
    const next = upsertRole([role("custom-a", "旧名")], role("custom-a", "新名"));
    assert.strictEqual(next.length, 1);
    assert.strictEqual(next[0].name, "新名");
  });

  it("替换时保持原位置，列表不会跳动", () => {
    const next = upsertRole([role("custom-a"), role("custom-b"), role("custom-c")], role("custom-b", "改名"));
    assert.deepStrictEqual(next.map((r) => r.id), ["custom-a", "custom-b", "custom-c"]);
  });

  it("删除只删指定的那个", () => {
    const next = removeRole([role("custom-a"), role("custom-b")], "custom-a");
    assert.deepStrictEqual(next.map((r) => r.id), ["custom-b"]);
  });

  it("删除不存在的 id 不报错也不改变列表", () => {
    const roles = [role("custom-a")];
    assert.deepStrictEqual(removeRole(roles, "custom-不存在"), roles);
  });
});

describe("搜索", () => {
  const roles = [
    role("a", "严厉的审查者", "先找问题再给结论"),
    role("b", "耐心的讲师", "把原理讲透"),
  ];

  it("空查询返回全部", () => {
    assert.strictEqual(filterRoles(roles, "   ").length, 2);
  });

  it("能搜名称、说明和提示词正文", () => {
    assert.deepStrictEqual(filterRoles(roles, "审查").map((r) => r.id), ["a"]);
    assert.deepStrictEqual(filterRoles(roles, "原理").map((r) => r.id), ["b"]);
  });

  it("多个词都要满足", () => {
    assert.strictEqual(filterRoles(roles, "讲师 原理").length, 1);
    assert.strictEqual(filterRoles(roles, "讲师 审查").length, 0);
  });
});

describe("取生效角色", () => {
  const roles = [role("a", "甲")];

  it("找得到就返回", () => {
    assert.strictEqual(resolveActiveRole("a", roles)?.id, "a");
  });

  it("空 id 或找不到时返回 undefined", () => {
    // 不能悄悄退回第一个角色——那会让人以为选中的是别的
    assert.strictEqual(resolveActiveRole("", roles), undefined);
    assert.strictEqual(resolveActiveRole("不存在", roles), undefined);
  });
});

describe("提示词预览", () => {
  it("短提示词原样返回", () => {
    assert.strictEqual(promptPreview("短提示词"), "短提示词");
  });

  it("长提示词截断并加省略号", () => {
    const preview = promptPreview("字".repeat(200), 90);
    assert.strictEqual(preview.length, 91);
    assert.ok(preview.endsWith("…"));
  });

  it("换行与连续空白被压成单个空格", () => {
    assert.strictEqual(promptPreview("第一行\n\n  第二行"), "第一行 第二行");
  });
});
