import assert from "node:assert";
import { describe, it } from "node:test";
import {
  buildCatalog,
  catalogSummary,
  deriveTags,
  deriveVendor,
  displayName,
  filterCatalog,
  groupCatalog,
  tagFacets,
  UNKNOWN_VENDOR,
  type CatalogModel,
} from "./model-marketplace.ts";

const source = (profileId: string, profileName: string, models: string[]) => ({
  profileId,
  profileName,
  models,
});

describe("厂商识别", () => {
  it("认得常见厂商", () => {
    assert.strictEqual(deriveVendor("deepseek-v4-pro"), "DeepSeek");
    assert.strictEqual(deriveVendor("qwen3-max"), "通义千问");
    assert.strictEqual(deriveVendor("glm-4-plus"), "智谱 GLM");
    assert.strictEqual(deriveVendor("moonshot-v1-128k"), "月之暗面");
    assert.strictEqual(deriveVendor("gpt-4o-mini"), "OpenAI");
    assert.strictEqual(deriveVendor("claude-sonnet-4"), "Anthropic");
    assert.strictEqual(deriveVendor("gemini-2.5-pro"), "Google");
  });

  it("认不出来时归到「其它」，不硬猜", () => {
    // 这一条守着一个容易犯的错：为了界面好看，把不认识的模型塞给某个大厂。
    // 猜错比留白更糟——用户会照着错信息去选模型。
    assert.strictEqual(deriveVendor("内部-微调模型-0813"), UNKNOWN_VENDOR);
    assert.strictEqual(deriveVendor("my-custom-llm"), UNKNOWN_VENDOR);
  });

  it("先命中的规则赢，更具体的模式要排在前面", () => {
    // deepseek-r1 不能因为带 r1 就被认成别家
    assert.strictEqual(deriveVendor("deepseek-r1-distill-qwen-32b"), "DeepSeek");
  });
});

describe("能力标签推导", () => {
  it("从 id 线索推导能力", () => {
    assert.ok(deriveTags("qwen2.5-vl-72b").includes("视觉"));
    assert.ok(deriveTags("deepseek-r1").includes("推理"));
    assert.ok(deriveTags("text-embedding-3-large").includes("向量"));
    assert.ok(deriveTags("bge-reranker-v2").includes("重排"));
    assert.ok(deriveTags("gpt-4o-audio-preview").includes("语音"));
    assert.ok(deriveTags("kling-v2").includes("视频"));
  });

  it("把参数规模也当成一条线索", () => {
    assert.ok(deriveTags("qwen2.5-72b-instruct").includes("72B"));
    assert.ok(deriveTags("glm-4-9b").includes("9B"));
  });

  it("认不出来就是空的，不塞默认标签", () => {
    assert.deepStrictEqual(deriveTags("abcd"), []);
  });
});

describe("目录拍平", () => {
  it("跨供应商的同名模型都保留", () => {
    // 同一个 id 在两个供应商下，可用性与计费都可能不同，合并掉等于替用户做假设
    const rows = buildCatalog([
      source("a", "供应商甲", ["deepseek-v3"]),
      source("b", "供应商乙", ["deepseek-v3"]),
    ]);
    assert.strictEqual(rows.length, 2);
    assert.deepStrictEqual(rows.map((row) => row.profileName), ["供应商甲", "供应商乙"]);
  });

  it("同一供应商内的重复 id 只留一条", () => {
    const rows = buildCatalog([source("a", "甲", ["deepseek-v3", "deepseek-v3", " deepseek-v3 "])]);
    assert.strictEqual(rows.length, 1);
  });

  it("空字符串被跳过，不会变成一行空模型", () => {
    const rows = buildCatalog([source("a", "甲", ["", "   ", "glm-4"])]);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].id, "glm-4");
  });

  it("id 保持原样，不做改写", () => {
    const rows = buildCatalog([source("a", "甲", ["Pro/deepseek-V3"])]);
    assert.strictEqual(rows[0].id, "Pro/deepseek-V3");
  });
});

describe("搜索与筛选", () => {
  const rows: CatalogModel[] = buildCatalog([
    source("a", "主站", ["deepseek-v3", "qwen2.5-vl-72b"]),
    source("b", "备用站", ["gpt-4o-mini"]),
  ]);

  it("空查询返回全部", () => {
    assert.strictEqual(filterCatalog(rows, "").length, 3);
    assert.strictEqual(filterCatalog(rows, "   ").length, 3);
  });

  it("能按 id、厂商、标签、供应商名搜到", () => {
    assert.deepStrictEqual(filterCatalog(rows, "qwen").map((r) => r.id), ["qwen2.5-vl-72b"]);
    assert.deepStrictEqual(filterCatalog(rows, "智谱").length, 0);
    assert.deepStrictEqual(filterCatalog(rows, "视觉").map((r) => r.id), ["qwen2.5-vl-72b"]);
    assert.deepStrictEqual(filterCatalog(rows, "备用站").map((r) => r.id), ["gpt-4o-mini"]);
  });

  it("多个词是「都要满足」，不是「满足一个」", () => {
    assert.strictEqual(filterCatalog(rows, "qwen 视觉").length, 1);
    assert.strictEqual(filterCatalog(rows, "qwen 语音").length, 0);
  });

  it("标签筛选是交集", () => {
    assert.strictEqual(filterCatalog(rows, "", ["视觉"]).length, 1);
    assert.strictEqual(filterCatalog(rows, "", ["视觉", "推理"]).length, 0);
  });

  it("搜索大小写不敏感", () => {
    assert.strictEqual(filterCatalog(rows, "GPT-4O").length, 1);
  });
});

describe("标签面板", () => {
  it("计数正确，且按数量降序", () => {
    const rows = buildCatalog([
      source("a", "甲", ["deepseek-r1", "deepseek-v3", "qwen2.5-vl-72b"]),
    ]);
    const facets = tagFacets(rows);
    const reasoning = facets.find((facet) => facet.tag === "推理");
    assert.strictEqual(reasoning?.count, 1);
    for (let i = 1; i < facets.length; i += 1) {
      assert.ok(facets[i - 1].count >= facets[i].count, "标签应按数量降序");
    }
  });

  it("同数量时顺序稳定（不会每次渲染都跳）", () => {
    const rows = buildCatalog([source("a", "甲", ["deepseek-r1", "qwen2.5-vl-72b"])]);
    assert.deepStrictEqual(tagFacets(rows), tagFacets(rows));
  });

  it("没有标签的模型不产生空标签项", () => {
    const rows = buildCatalog([source("a", "甲", ["abcd"])]);
    assert.deepStrictEqual(tagFacets(rows), []);
  });
});

describe("分组", () => {
  const rows = buildCatalog([
    source("a", "主站", ["deepseek-v3", "deepseek-r1"]),
    source("b", "备用站", ["gpt-4o-mini"]),
  ]);

  it("按厂商分组，组内不漏模型", () => {
    const groups = groupCatalog(rows, "vendor");
    const total = groups.reduce((sum, group) => sum + group.models.length, 0);
    assert.strictEqual(total, rows.length);
    assert.strictEqual(groups[0].label, "DeepSeek", "模型多的组排前面");
    assert.strictEqual(groups[0].models.length, 2);
  });

  it("按供应商分组用显示名做标签", () => {
    const groups = groupCatalog(rows, "profile");
    assert.deepStrictEqual([...groups.map((g) => g.label)].sort(), ["主站", "备用站"]);
  });

  it("空目录分组返回空数组", () => {
    assert.deepStrictEqual(groupCatalog([], "vendor"), []);
  });
});

describe("概览统计", () => {
  it("区分「条目数」与「去重后的 id 数」", () => {
    const rows = buildCatalog([
      source("a", "甲", ["deepseek-v3", "glm-4"]),
      source("b", "乙", ["deepseek-v3"]),
    ]);
    const summary = catalogSummary(rows);
    assert.strictEqual(summary.total, 3);
    assert.strictEqual(summary.uniqueIds, 2, "两个供应商都有 deepseek-v3，去重后只剩 2 个 id");
    assert.strictEqual(summary.vendors, 2);
    assert.strictEqual(summary.profiles, 2);
  });

  it("空目录各项为 0", () => {
    assert.deepStrictEqual(catalogSummary([]), {
      total: 0,
      uniqueIds: 0,
      vendors: 0,
      profiles: 0,
    });
  });
});

describe("展示名", () => {
  it("去掉供应商前缀，便于卡片上看清", () => {
    assert.strictEqual(displayName("Pro/deepseek-V3"), "deepseek-V3");
    assert.strictEqual(displayName("deepseek-v3"), "deepseek-v3");
  });

  it("全斜杠的怪 id 不会被削成空字符串", () => {
    assert.strictEqual(displayName("/"), "/");
  });
});
