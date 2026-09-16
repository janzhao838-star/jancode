/**
 * 模型广场的数据整理逻辑。
 *
 * 为什么单独拆成一个纯 .ts：Node 的测试跑不了 .tsx（见「技能面板现状.md」），
 * 而这一页真正容易出错的地方全在数据整理上——标签怎么推导、搜索怎么匹配、
 * 分组和计数怎么算。把这些挪出来，界面里就只剩渲染。
 *
 * 一条硬规矩：**没有数据来源的字段一律不产出**。
 * 上游（中转站的 /v1/models）只给模型 id，单价、延迟、吞吐这边拿不到，
 * 所以这里不造这些字段，界面上也就不会出现看着专业的假数字。
 * 唯一有真实来源的价格信息是 Sub2API 倍率，且只对 Sub2API 供应商有效——
 * 那部分由界面单独展示，不混进模型条目里。
 */

/** 一个模型条目。除 id 外全部是「推导值」，界面上必须标明这一点。 */
export interface CatalogModel {
  /** 模型 id，原样来自上游，不做改写 */
  id: string;
  /** 来源供应商 */
  profileId: string;
  profileName: string;
  /** 由 id 推导出的厂商。认不出来时是「其它」 */
  vendor: string;
  /** 由 id 推导出的能力标签 */
  tags: string[];
}

/** 认不出来的厂商归到这里，而不是硬猜一个 */
export const UNKNOWN_VENDOR = "其它";

/**
 * 厂商识别规则。顺序敏感：先命中的赢，所以更具体的模式要排在前面
 * （例如 `deepseek-r1` 应当先被 DeepSeek 命中，而不是被某个更宽的模式抢走）。
 */
const VENDOR_RULES: Array<{ vendor: string; pattern: RegExp }> = [
  { vendor: "DeepSeek", pattern: /deepseek/i },
  { vendor: "通义千问", pattern: /qwen|qwq|tongyi/i },
  { vendor: "智谱 GLM", pattern: /glm|chatglm|zhipu/i },
  { vendor: "月之暗面", pattern: /moonshot|kimi/i },
  { vendor: "MiniMax", pattern: /minimax|abab/i },
  { vendor: "字节豆包", pattern: /doubao|skylark|seed-?oss/i },
  { vendor: "百度文心", pattern: /ernie|wenxin/i },
  { vendor: "讯飞星火", pattern: /spark|xinghuo/i },
  { vendor: "阶跃星辰", pattern: /step-[0-9]/i },
  { vendor: "零一万物", pattern: /(^|\/|-)yi-/i },
  { vendor: "OpenAI", pattern: /gpt|davinci|whisper|dall-?e|(^|[^a-z])o[1-9](-|$)/i },
  { vendor: "Anthropic", pattern: /claude/i },
  { vendor: "Google", pattern: /gemini|gemma|palm/i },
  { vendor: "xAI", pattern: /grok/i },
  { vendor: "Meta", pattern: /llama/i },
  { vendor: "Mistral", pattern: /mistral|mixtral|magistral/i },
];

/**
 * 能力标签规则。同样只是「从 id 里看出来的线索」，不是上游声明——
 * 所以界面上会写明这些标签由 id 推导，避免被当成官方参数。
 */
const CAPABILITY_RULES: Array<{ tag: string; pattern: RegExp }> = [
  { tag: "向量", pattern: /embed|bge-|m3e|gte-|text-embedding/i },
  { tag: "重排", pattern: /rerank/i },
  // 注意：这里**不能**把 -v3 之类当成视觉线索——那是版本号。
  // 早期写法用了 /-v[0-9]/，结果 deepseek-v3 被标成「视觉」，筛选直接失真。
  { tag: "视觉", pattern: /-vl|vl-|vision|multimodal|omni/i },
  { tag: "推理", pattern: /reason|thinking|-r1|r1-|qwq|o[1-9]-|deepseek-r/i },
  { tag: "代码", pattern: /coder|codex|code-/i },
  { tag: "图像", pattern: /dall-?e|flux|stable-?diffusion|sd[0-9x]|kolors|t2i|image-?gen/i },
  { tag: "视频", pattern: /sora|kling|t2v|i2v|wanx|video/i },
  { tag: "语音", pattern: /tts|asr|whisper|audio|voice|speech|cosyvoice/i },
  { tag: "长上下文", pattern: /128k|256k|512k|1m|-long|longcat/i },
];

/** 从模型 id 推导厂商。认不出来返回「其它」——不猜。 */
export function deriveVendor(id: string): string {
  for (const rule of VENDOR_RULES) {
    if (rule.pattern.test(id)) return rule.vendor;
  }
  return UNKNOWN_VENDOR;
}

/** 从模型 id 推导能力标签。可能为空：认不出来就是认不出来。 */
export function deriveTags(id: string): string[] {
  const tags: string[] = [];
  for (const rule of CAPABILITY_RULES) {
    if (rule.pattern.test(id)) tags.push(rule.tag);
  }
  // 模型名里明确写了尺寸也算一条线索，便于按规模筛选
  const size = id.match(/(\d+(?:\.\d+)?)\s*[bB](?![a-z])/);
  if (size) tags.push(`${size[1]}B`);
  return tags;
}

/** 一个供应商拉回来的原始结果 */
export interface CatalogSource {
  profileId: string;
  profileName: string;
  models: string[];
}

/**
 * 把多个供应商的模型清单拍平成一条目录。
 *
 * 同一个 id 出现在多个供应商下时**都保留**——它们的可用性、计费、
 * 甚至背后是不是同一个模型都可能不同，合并掉等于替用户做了假设。
 */
export function buildCatalog(sources: CatalogSource[]): CatalogModel[] {
  const rows: CatalogModel[] = [];
  const seen = new Set<string>();
  for (const source of sources) {
    for (const raw of source.models) {
      const id = raw.trim();
      if (!id) continue;
      // 同一个供应商内重复的 id 才算重复，跨供应商不算
      const key = `${source.profileId}\u0000${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        id,
        profileId: source.profileId,
        profileName: source.profileName,
        vendor: deriveVendor(id),
        tags: deriveTags(id),
      });
    }
  }
  return rows;
}

/** 搜索：按 id、厂商、标签匹配。查询串按空白切成多个词，要求全部命中。 */
export function filterCatalog(
  models: CatalogModel[],
  query: string,
  activeTags: string[] = [],
): CatalogModel[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return models.filter((model) => {
    if (activeTags.length > 0 && !activeTags.every((tag) => model.tags.includes(tag))) {
      return false;
    }
    if (terms.length === 0) return true;
    const haystack = [model.id, model.vendor, model.profileName, ...model.tags]
      .join(" ")
      .toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

/** 标签面板：每个标签有多少个模型。按数量降序，同数量按中文序，保证稳定。 */
export function tagFacets(models: CatalogModel[]): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const model of models) {
    for (const tag of model.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => (b.count - a.count) || a.tag.localeCompare(b.tag, "zh"));
}

export type GroupKey = "vendor" | "profile";

/** 分组。组按「模型多的在前」排，同数量按名称，保证每次渲染顺序一致。 */
export function groupCatalog(
  models: CatalogModel[],
  key: GroupKey,
): Array<{ key: string; label: string; models: CatalogModel[] }> {
  const groups = new Map<string, { key: string; label: string; models: CatalogModel[] }>();
  for (const model of models) {
    const id = key === "vendor" ? model.vendor : model.profileId;
    const label = key === "vendor" ? model.vendor : model.profileName;
    let group = groups.get(id);
    if (!group) {
      group = { key: id, label, models: [] };
      groups.set(id, group);
    }
    group.models.push(model);
  }
  return [...groups.values()].sort(
    (a, b) => (b.models.length - a.models.length) || a.label.localeCompare(b.label, "zh"),
  );
}

export interface CatalogSummary {
  /** 模型条目总数（跨供应商重复的各算一条） */
  total: number;
  /** 去重后的模型 id 数——和 total 的差就是「有几个 id 是多供应商共有的」 */
  uniqueIds: number;
  vendors: number;
  profiles: number;
}

export function catalogSummary(models: CatalogModel[]): CatalogSummary {
  return {
    total: models.length,
    uniqueIds: new Set(models.map((model) => model.id)).size,
    vendors: new Set(models.map((model) => model.vendor)).size,
    profiles: new Set(models.map((model) => model.profileId)).size,
  };
}

/** 从模型 id 里猜一个「展示用短名」：去掉供应商前缀，便于卡片上看得清。 */
export function displayName(id: string): string {
  const trimmed = id.replace(/^[a-z0-9_.-]+\//i, "");
  return trimmed || id;
}
