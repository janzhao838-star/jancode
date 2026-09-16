import assert from "node:assert";
import { describe, it, test } from "node:test";
import { PRESETS } from "./presets.ts";

describe("provider presets", () => {
  it("内置渠道全部面向国内模型，不含国外预设", () => {
    // 本定制版的产品定位是国内模型聚合中转站，国外厂商预设已被移除。
    // 这条断言是回归守卫：以后若有人误加回国外预设，测试会立刻失败。
    const foreignIds = ["openai", "minimax-global", "openrouter", "novita", "azure"];
    const found = PRESETS.filter((preset) => foreignIds.includes(preset.id)).map((p) => p.id);
    assert.deepStrictEqual(found, [], `不应存在国外预设，但发现：${found.join(", ")}`);

    // 分类只允许国内官方与聚合两类
    const categories = [...new Set(PRESETS.map((p) => p.category))].sort();
    assert.deepStrictEqual(categories, ["aggregator", "cn_official"]);
  });

  it("自建中转站预设排在预设列表最前面", () => {
    // 用户自有站点应当一眼可见，避免每次都要往下翻找。
    const firstThree = PRESETS.slice(0, 3).map((p) => p.id);
    assert.deepStrictEqual(firstThree, ["aionclaw", "junzi-ai", "janzhao-dgx-gateway"]);
    const aionclaw = PRESETS[0];
    assert.equal(aionclaw.baseUrl, "https://router.aionclaw.com/v1");
    assert.ok(aionclaw.modelList && aionclaw.modelList.length > 0, "AionClaw 预设应带模型清单");
  });
});

test("DeepSeek preset uses the official Responses integration", () => {
  const preset = PRESETS.find((candidate) => candidate.id === "deepseek");
  assert.ok(preset);
  assert.equal(preset.baseUrl, "https://api.deepseek.com/");
  assert.equal(preset.protocol, "responses");
  assert.equal(preset.model, "deepseek-v4-flash");
  assert.deepEqual(preset.modelList, ["deepseek-v4-flash", "deepseek-v4-pro"]);
});

test("预设里不允许出现任何推广码", () => {
  // 上游仓库的预设带着作者自己的推广链接（注册别人的账号会把返利算给上游作者，
  // 而不是本站）。这类参数混在 apiKeyUrl / websiteUrl 里很难一眼看出，
  // 所以这里统一守住，上游更新时万一重新带进来也会立刻失败。
  const AFFILIATE_PATTERNS = [/[?&]aff=/, /\/i\/[A-Za-z0-9]+/, /[?&]ref=/, /referral/i, /invite/i];

  for (const preset of PRESETS) {
    for (const field of ["apiKeyUrl", "websiteUrl", "baseUrl"] as const) {
      const value = preset[field];
      if (!value) continue;
      for (const pattern of AFFILIATE_PATTERNS) {
        assert.ok(
          !pattern.test(value),
          `${preset.id} 的 ${field} 带有推广参数（${value}），会把客户的注册返利算给第三方`,
        );
      }
    }
  }
});

test("不提供国外聚合站预设", () => {
  // 需求是「只做国内模型」。GrooRoute 这类国外聚合站提供的是 GPT 系列，
  // 与要求冲突，已整条移除；这条守住它不会被上游更新带回来。
  for (const id of ["grooroute", "openai", "openrouter", "novita", "azure", "minimax-global"]) {
    assert.equal(
      PRESETS.find((preset) => preset.id === id),
      undefined,
      `${id} 是国外供应商，不应出现在预设里`,
    );
  }
});
