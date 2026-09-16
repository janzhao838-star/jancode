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

test("GrooRoute preset uses the configured sponsor endpoint", () => {
  const preset = PRESETS.find((candidate) => candidate.id === "grooroute");
  assert.ok(preset);
  assert.equal(preset.name, "GrooRoute");
  assert.equal(preset.baseUrl, "https://grooroute.com");
  assert.equal(preset.protocol, "responses");
  assert.equal(preset.model, "gpt-5.5");
  assert.equal(preset.apiKeyUrl, "https://grooroute.com/register?aff=2B3KJR5SRNTX");
});
