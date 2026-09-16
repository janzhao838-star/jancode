/**
 * JanCode 内置技能库与触发词匹配引擎
 *
 * 设计参考 ZeroCode（零度code）的技能系统思路：
 *   · 技能以「名称 + 一句话说明 + 触发词 + 提示词正文」描述
 *   · 按当前任务文本自动匹配出应当启用的技能
 *   · 区分常用技能与进阶技能（专家模式才展示）
 *
 * 本模块是纯函数 + 纯数据，不依赖 DOM、不发网络请求，便于单独测试。
 */

export interface BuiltinSkill {
  /** 稳定标识，用于持久化启用状态；一旦发布不可更改 */
  id: string;
  /** 中文名称 */
  name: string;
  /** 一句话说明这个技能让模型做什么 */
  summary: string;
  /** 触发词：任务文本中出现即算命中 */
  triggers: string[];
  /** 命中后注入的中文提示词正文 */
  prompt: string;
  /** 进阶技能：默认隐藏，仅在专家模式下展示 */
  expert?: boolean;
}

export interface SkillMatch {
  skill: BuiltinSkill;
  /** 命中强度，越大越相关 */
  score: number;
  /** 实际命中的触发词 */
  hits: string[];
}

/**
 * 内置技能库。
 *
 * 全部面向中文开发场景；触发词同时收录中英文写法，
 * 因为实际任务描述里两种写法都很常见。
 */
export const BUILTIN_SKILLS: BuiltinSkill[] = [
  {
    id: "code-reviewer",
    name: "代码审查员",
    summary: "以审查者视角逐条指出问题，而不是直接改写代码",
    triggers: ["代码审查", "审查代码", "review", "code review", "看看这段代码", "有没有问题", "帮我检查代码"],
    prompt:
      "以严格的代码审查者身份工作。逐条列出问题，每条包含：所在位置、问题是什么、为什么是问题、建议怎么改。"
      + "按严重程度排序（正确性 > 安全 > 性能 > 可读性）。"
      + "如果代码没问题，直接说没问题，不要为了凑数而编造意见。",
  },
  {
    id: "debugger",
    name: "调试助手",
    summary: "从报错信息出发定位根因，而不是猜着改",
    triggers: ["报错", "调试", "debug", "异常", "崩溃", "stack trace", "堆栈", "跑不起来", "不生效", "为什么不对"],
    prompt:
      "以调试者身份工作。先复述你对现象和报错的理解，再按可能性从高到低列出根因假设，"
      + "对每个假设说明如何验证。改代码前先确认根因，不要同时改多处导致无法归因。"
      + "如果信息不足，明确列出还需要哪些信息。",
  },
  {
    id: "refactor-pro",
    name: "重构工程师",
    summary: "在保持行为不变的前提下改善结构，改完能验证等价性",
    triggers: ["重构", "refactor", "优化结构", "代码太乱", "提取函数", "解耦", "拆分模块"],
    prompt:
      "以保守的重构工程师身份工作。铁律：重构不改变外部行为。"
      + "先说明当前结构的坏味道与重构目标，再给出分步骤的小改动方案，每步都可独立验证。"
      + "指出哪些地方有测试覆盖、哪些没有——没有覆盖的地方要先补测试再重构。",
  },
  {
    id: "test-writer",
    name: "单元测试编写",
    summary: "补齐边界值与失败路径，而不只测顺利情况",
    triggers: ["写测试", "单元测试", "test", "unit test", "覆盖率", "pytest", "jest", "加个测试"],
    prompt:
      "以测试工程师身份工作。覆盖四类情况：正常路径、边界值（空、零、最大、最小）、错误路径、并发或重复调用。"
      + "优先测那些容易出错的地方，而不是追求行覆盖率的数字。"
      + "测试要能真正失败——如果一个测试在实现写错时仍然通过，那它没有价值，请指出这一点。",
  },
  {
    id: "sql-expert",
    name: "SQL 与数据库",
    summary: "写查询、看执行计划、排查慢查询与索引问题",
    triggers: ["sql", "查询", "数据库", "索引", "慢查询", "执行计划", "join", "建表", "迁移", "mysql", "postgres", "sqlite"],
    prompt:
      "以数据库工程师身份工作。写 SQL 时明确说明方言（MySQL / PostgreSQL / SQLite）。"
      + "涉及性能时先看执行计划再下结论，指出全表扫描、索引失效、隐式类型转换等问题。"
      + "任何写操作（UPDATE / DELETE / DDL）都要先给出影响行数的预估，并提醒先备份或先 SELECT 验证。",
  },
  {
    id: "docker-pro",
    name: "容器与部署",
    summary: "写 Dockerfile 与编排，关注体积、缓存与安全",
    triggers: ["docker", "容器", "镜像", "dockerfile", "compose", "部署", "k8s", "kubernetes"],
    prompt:
      "以容器工程师身份工作。Dockerfile 要利用层缓存（先拷依赖清单再装依赖，最后拷源码）、"
      + "用多阶段构建减小体积、以非 root 用户运行、固定基础镜像版本。"
      + "指出镜像里不该出现的敏感信息（密钥、.env、.git）。",
  },
  {
    id: "doc-writer",
    name: "中文技术文档",
    summary: "写给人看的中文说明，结构清晰、不说空话",
    triggers: ["写文档", "文档", "readme", "说明文档", "注释", "写个教程", "使用说明"],
    prompt:
      "以中文技术写作身份工作。原则：先讲这个功能解决什么问题，再讲怎么用，最后讲边界与注意事项。"
      + "用短句，少用形容词，不用「强大」「优雅」「极致」这类没有信息量的词。"
      + "示例代码要能直接跑通，不要写伪代码还标着可运行。",
  },
  {
    id: "performance",
    name: "性能优化",
    summary: "先测量再优化，拒绝凭感觉猜测瓶颈",
    triggers: ["性能", "优化速度", "太慢", "卡顿", "performance", "耗时", "内存占用", "带宽"],
    prompt:
      "以性能工程师身份工作。第一步永远是测量：先确定瓶颈在哪，再动手。"
      + "不要在没有数据的情况下做优化。给出优化方案时说明预期收益与代价（复杂度、可读性、内存）。"
      + "明确区分「已测量的瓶颈」与「猜测的瓶颈」。",
  },
  {
    id: "api-designer",
    name: "API 设计",
    summary: "设计接口的入参、出参、错误码与兼容性",
    triggers: ["api 设计", "接口设计", "设计接口", "restful", "接口文档", "请求参数", "返回格式"],
    prompt:
      "以 API 设计者身份工作。每个接口明确：路径、方法、鉴权方式、请求体、成功响应、各类错误响应与错误码。"
      + "考虑向后兼容：新增字段要可选，不要改已有字段的含义。"
      + "分页、限流、幂等性这些容易被忽略的点要主动提出。",
  },
  {
    id: "git-master",
    name: "Git 操作",
    summary: "处理分支、冲突、回滚与历史整理",
    triggers: ["git", "分支", "合并冲突", "回滚", "rebase", "cherry-pick", "提交历史", "撤销提交"],
    prompt:
      "以 Git 使用者身份工作。给命令时说明每条命令做什么、有没有破坏性。"
      + "涉及 reset --hard、push --force、清理未跟踪文件这类会丢数据的操作时，必须明确警告并给出更安全的替代方案。"
      + "处理冲突时先解释两边改动的意图，再决定保留哪边。",
  },
  {
    id: "security-auditor",
    name: "安全审计",
    summary: "从攻击者视角找漏洞，给出可验证的结论",
    triggers: ["安全", "漏洞", "注入", "xss", "越权", "sec", "security", "密钥泄露", "鉴权"],
    prompt:
      "以安全审计者身份工作。按 OWASP 常见风险逐项检查：注入、鉴权缺陷、敏感信息泄露、越权访问、不安全的反序列化。"
      + "每条结论要说明利用条件与影响面，不要报无法复现的「可能存在风险」。"
      + "指出修复方案时同时说明修复后如何验证。",
    expert: true,
  },
  {
    id: "data-analysis",
    name: "数据分析",
    summary: "从数据里得出结论，并说明结论的可靠边界",
    triggers: ["数据分析", "统计", "报表", "分析数据", "excel", "csv", "pandas", "趋势", "环比"],
    prompt:
      "以数据分析身份工作。先明确要回答的问题，再确认数据口径（时间范围、去重规则、缺失值处理）。"
      + "给出结论时标注样本量，样本太小要说明结论不可靠。"
      + "区分「相关」与「因果」，不要从相关性直接推出因果。",
  },
];

/** 中文与英文的常见连接符、标点，匹配前统一成空格 */
const SEPARATORS = /[\s,，、。.;；:：!！?？"'“”‘’()（）\[\]【】{}<>《》/\\|@#$%^&*+=~`_-]+/;

function normalize(text: string): string {
  return text.toLowerCase().replace(SEPARATORS, " ").trim();
}

/**
 * 紧凑形式：把所有分隔符直接删掉。
 *
 * 为什么需要它：中文写作里标点是可选的，「代码审查」与「代码，审查」表达的是同一件事。
 * 若只做「分隔符 → 空格」的归一化，后者会变成「代码 审查」，与触发词「代码审查」对不上。
 * 因此额外在紧凑文本上匹配一次，中文标点插入便不再影响命中。
 */
function compact(text: string): string {
  return text.toLowerCase().replace(SEPARATORS, "");
}

/**
 * 触发词权重：越长的触发词越具体，命中它说明越相关。
 * 例如「代码审查」比「审查」更能说明意图。
 */
function triggerWeight(trigger: string): number {
  // 中文按字符数、英文按词数近似衡量长度即可
  const length = trigger.trim().length;
  return Math.min(length, 12);
}

/**
 * 根据任务文本匹配应启用的技能。
 *
 * 规则：
 *   · 大小写不敏感
 *   · 命中强度 = 所有命中触发词的权重之和（长触发词权重更高）
 *   · 多命中按强度降序；强度相同时按 id 升序，保证结果稳定可复现
 *   · 无命中返回空数组
 *
 * @param task   当前任务文本（用户输入或会话内容）
 * @param skills 候选技能，默认使用内置技能库
 */
export function matchSkills(task: string, skills: BuiltinSkill[] = BUILTIN_SKILLS): SkillMatch[] {
  const haystack = normalize(task);
  const packed = compact(task);
  if (!haystack) {
    return [];
  }

  const matches: SkillMatch[] = [];
  for (const skill of skills) {
    const hits: string[] = [];
    let score = 0;
    for (const trigger of skill.triggers) {
      const needle = normalize(trigger);
      const packedNeedle = compact(trigger);
      const hit =
        (needle.length > 0 && haystack.includes(needle))
        || (packedNeedle.length > 0 && packed.includes(packedNeedle));
      if (hit) {
        hits.push(trigger);
        score += triggerWeight(trigger);
      }
    }
    if (score > 0) {
      matches.push({ skill, score, hits });
    }
  }

  matches.sort((a, b) => (b.score - a.score) || a.skill.id.localeCompare(b.skill.id));
  return matches;
}

/** 只取最相关的前若干个技能 */
export function topSkillMatches(task: string, limit = 3, skills: BuiltinSkill[] = BUILTIN_SKILLS): SkillMatch[] {
  if (limit <= 0) {
    return [];
  }
  return matchSkills(task, skills).slice(0, limit);
}

/** 常用技能（非进阶） */
export function commonSkills(skills: BuiltinSkill[] = BUILTIN_SKILLS): BuiltinSkill[] {
  return skills.filter((skill) => !skill.expert);
}

/** 按专家模式开关返回应展示的技能列表 */
export function visibleSkills(expertMode: boolean, skills: BuiltinSkill[] = BUILTIN_SKILLS): BuiltinSkill[] {
  return expertMode ? [...skills] : commonSkills(skills);
}
