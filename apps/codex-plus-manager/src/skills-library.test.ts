import assert from "node:assert";
import { describe, it, test } from "node:test";
import {
  BUILTIN_SKILLS,
  commonSkills,
  matchSkills,
  topSkillMatches,
  visibleSkills,
  type BuiltinSkill,
} from "./skills-library.ts";

describe("内置技能库数据完整性", () => {
  it("每个技能都有必需字段，且 id 唯一", () => {
    const ids = new Set<string>();
    for (const skill of BUILTIN_SKILLS) {
      assert.ok(skill.id.length > 0, "id 不能为空");
      assert.ok(!ids.has(skill.id), `id 重复：${skill.id}`);
      ids.add(skill.id);

      assert.ok(skill.name.trim().length > 0, `${skill.id} 缺少名称`);
      assert.ok(skill.summary.trim().length > 0, `${skill.id} 缺少说明`);
      assert.ok(skill.triggers.length > 0, `${skill.id} 至少要有一个触发词`);
      assert.ok(skill.prompt.trim().length > 20, `${skill.id} 的提示词正文过短`);

      for (const trigger of skill.triggers) {
        assert.ok(trigger.trim().length > 0, `${skill.id} 存在空触发词`);
      }
    }
  });

  it("技能数量在合理区间内", () => {
    assert.ok(BUILTIN_SKILLS.length >= 8, `内置技能过少：${BUILTIN_SKILLS.length}`);
    assert.ok(BUILTIN_SKILLS.length <= 20, `内置技能过多：${BUILTIN_SKILLS.length}`);
  });
});

describe("触发词匹配", () => {
  it("空文本与纯空白返回空数组", () => {
    assert.deepStrictEqual(matchSkills(""), []);
    assert.deepStrictEqual(matchSkills("   "), []);
    assert.deepStrictEqual(matchSkills("\n\t  \n"), []);
  });

  it("无关文本返回空数组", () => {
    assert.deepStrictEqual(matchSkills("今天天气不错，出去走走吧"), []);
  });

  it("中文触发词能命中", () => {
    const result = matchSkills("帮我做一次代码审查");
    const ids = result.map((m) => m.skill.id);
    assert.ok(ids.includes("code-reviewer"), `应命中 code-reviewer，实际：${ids.join(",")}`);
  });

  it("英文触发词大小写不敏感", () => {
    for (const text of ["please do a CODE REVIEW", "please do a code review", "Code Review"]) {
      const ids = matchSkills(text).map((m) => m.skill.id);
      assert.ok(ids.includes("code-reviewer"), `「${text}」未命中 code-reviewer`);
    }
  });

  it("返回结果带实际命中的触发词", () => {
    const [first] = matchSkills("这段代码报错了，帮我 debug 一下");
    assert.ok(first);
    assert.ok(first.hits.length > 0, "命中结果应记录触发词");
    for (const hit of first.hits) {
      assert.ok(
        first.skill.triggers.includes(hit),
        `记录的触发词 ${hit} 应属于该技能`,
      );
    }
  });

  it("命中强度按触发词数量与长度累加，多个命中排在前面", () => {
    // 「代码审查」的文本同时命中多个触发词，应比只命中一个的文本得分高
    const many = matchSkills("代码审查 帮我检查代码 有没有问题").find((m) => m.skill.id === "code-reviewer");
    const few = matchSkills("代码审查").find((m) => m.skill.id === "code-reviewer");
    assert.ok(many && few);
    assert.ok(many.score > few.score, `多命中得分 ${many.score} 应大于单命中 ${few.score}`);
    assert.ok(many.hits.length > few.hits.length);
  });

  it("结果按强度降序排列", () => {
    const result = matchSkills("数据库慢查询，看看执行计划和索引，顺便加个 sql 示例");
    assert.ok(result.length >= 1);
    for (let i = 1; i < result.length; i += 1) {
      assert.ok(
        result[i - 1].score >= result[i].score,
        `第 ${i} 项得分 ${result[i].score} 超过了前一项 ${result[i - 1].score}`,
      );
    }
  });

  it("强度相同时按 id 升序，结果稳定可复现", () => {
    const a = matchSkills("重构 和 调试");
    const b = matchSkills("重构 和 调试");
    assert.deepStrictEqual(a.map((m) => m.skill.id), b.map((m) => m.skill.id));
  });

  it("标点与空白不影响命中", () => {
    for (const text of ["代码审查", "代码，审查", "代码  审查", "代码、审查", "（代码审查）"]) {
      const ids = matchSkills(text).map((m) => m.skill.id);
      assert.ok(ids.includes("code-reviewer"), `「${text}」未命中`);
    }
  });

  it("一次任务可以命中多个技能", () => {
    const ids = matchSkills("先做代码审查，然后写单元测试，最后看看 docker 部署").map((m) => m.skill.id);
    assert.ok(ids.includes("code-reviewer"));
    assert.ok(ids.includes("test-writer"));
    assert.ok(ids.includes("docker-pro"));
    assert.ok(ids.length >= 3, `应命中至少 3 个技能，实际 ${ids.length}`);
  });

  it("可以传入自定义技能集合", () => {
    const custom: BuiltinSkill[] = [
      {
        id: "custom-one",
        name: "自定义技能",
        summary: "仅用于测试",
        triggers: ["独角兽"],
        prompt: "这是一段足够长的自定义提示词正文，用于通过长度校验。",
      },
    ];
    const result = matchSkills("帮我找一只独角兽", custom);
    assert.equal(result.length, 1);
    assert.equal(result[0].skill.id, "custom-one");
    // 内置技能不应出现在自定义集合的匹配结果里
    assert.deepStrictEqual(matchSkills("代码审查", custom), []);
  });
});

describe("topSkillMatches 截断", () => {
  it("默认最多返回 3 个", () => {
    const result = topSkillMatches("代码审查 调试 重构 单元测试 数据库 docker");
    assert.ok(result.length <= 3, `应不超过 3 个，实际 ${result.length}`);
  });

  it("limit 为 0 或负数时返回空数组", () => {
    assert.deepStrictEqual(topSkillMatches("代码审查", 0), []);
    assert.deepStrictEqual(topSkillMatches("代码审查", -1), []);
  });

  it("limit 超过命中数时返回全部命中", () => {
    const all = matchSkills("代码审查");
    const top = topSkillMatches("代码审查", 99);
    assert.deepStrictEqual(top.map((m) => m.skill.id), all.map((m) => m.skill.id));
  });
});

describe("专家模式可见性", () => {
  test("默认隐藏进阶技能", () => {
    const visible = visibleSkills(false);
    assert.ok(visible.length > 0);
    assert.ok(visible.every((skill) => !skill.expert), "默认视图不应含进阶技能");
    assert.equal(visible.length, commonSkills().length);
  });

  test("专家模式展示全部技能", () => {
    const visible = visibleSkills(true);
    assert.equal(visible.length, BUILTIN_SKILLS.length);
    assert.ok(visible.some((skill) => skill.expert), "专家模式应包含进阶技能");
  });

  test("两种模式都不改变技能本身，返回值是副本", () => {
    const visible = visibleSkills(true);
    visible.pop();
    assert.equal(BUILTIN_SKILLS.length, visibleSkills(true).length, "不应影响内置技能库");
  });
});
