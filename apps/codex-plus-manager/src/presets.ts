/**
 * JanCode 供应商预设
 * 基于 cc-switch (MIT) 的 codexProviderPresets.ts，作者 Jason Young
 * https://github.com/farion1231/cc-switch
 *
 * 提供一键填充供应商配置的预设模板，包括 Base URL、协议、模型列表等。
 * 去掉了 cc-switch 原始的商业合作标记（isPartner、partnerPromotionKey）。
 */

// 本定制版只内置国内模型渠道，故不再使用 official / third_party 两类。
export type PresetCategory = "aggregator" | "cn_official";

export type RelayProtocol = "responses" | "chatCompletions";

export interface ProviderPreset {
  id: string;
  name: string;
  websiteUrl?: string;
  apiKeyUrl?: string;
  category: PresetCategory;
  baseUrl: string;
  protocol: RelayProtocol;
  model: string;
  modelList?: string[];
}

/**
 * 预设列表。选择任一预设会自动填充：
 * - name     → 供应商名称
 * - baseUrl  → API 端点
 * - protocol → responses / chatCompletions（根据上游实际协议）
 * - model    → 默认模型名
 * - modelList → 可选模型清单（换行分隔）
 */
export const PRESETS: ProviderPreset[] = [
  // ── 自建中转站（janzhao 自有，排在最前方便一键选用）──
  {
    id: "aionclaw",
    name: "AionClaw 中转站",
    websiteUrl: "https://www.aionclaw.cn",
    apiKeyUrl: "https://router.aionclaw.com/console/token",
    category: "aggregator",
    baseUrl: "https://router.aionclaw.com/v1",
    protocol: "chatCompletions",
    model: "deepseek-v4-pro",
    modelList: [
      "deepseek-v4-pro",
      "deepseek-v4-flash",
      "deepseek-v4-flash-0731",
      "deepseek-v4-pro-0813",
      "glm-5.3",
      "glm-5.3-flash",
      "glm-5.2",
      "kimi-k3",
      "kimi-k2.7-code",
      "kimi-k2.6",
      "qwen3.8-max",
      "qwen3.7-max",
      "qwen3.7-plus",
      "MiniMax-M3",
      "MiniMax-M2.7",
      "doubao-seed-2-1-turbo-260628",
      "mimo-v2.5-pro",
    ],
  },
  {
    id: "junzi-ai",
    name: "钧子AI（自建站点）",
    websiteUrl: "https://charlene.cat:9090/",
    apiKeyUrl: "https://charlene.cat:9090/console",
    category: "aggregator",
    baseUrl: "https://charlene.cat:9090/v1",
    protocol: "chatCompletions",
    model: "deepseek-v4-pro",
  },
  {
    id: "janzhao-dgx-gateway",
    name: "自建 DGX 网关",
    websiteUrl: "https://janzhao.cn:9090/",
    category: "aggregator",
    baseUrl: "https://janzhao.cn:9090/v1",
    protocol: "chatCompletions",
    model: "qwen3.8-27b-sglang",
  },

  // ── 第三方聚合（已按需精简，仅保留国内可用渠道）──

  // ── 中国官方 ──
  {
    id: "deepseek",
    name: "DeepSeek",
    websiteUrl: "https://platform.deepseek.com",
    apiKeyUrl: "https://platform.deepseek.com/api_keys",
    category: "cn_official",
    baseUrl: "https://api.deepseek.com/",
    protocol: "responses",
    model: "deepseek-v4-flash",
    modelList: ["deepseek-v4-flash", "deepseek-v4-pro"],
  },
  {
    id: "zhipu-glm",
    name: "Zhipu GLM",
    websiteUrl: "https://open.bigmodel.cn",
    apiKeyUrl: "https://www.bigmodel.cn/claude-code?ic=RRVJPB5SII",
    category: "cn_official",
    baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
    protocol: "chatCompletions",
    model: "glm-5.1",
    modelList: ["glm-5.1"],
  },
  {
    id: "kimi",
    name: "Kimi",
    websiteUrl: "https://platform.moonshot.cn",
    apiKeyUrl: "https://platform.moonshot.cn/console/api-keys",
    category: "cn_official",
    baseUrl: "https://api.moonshot.cn/v1",
    protocol: "chatCompletions",
    model: "kimi-k2.6",
    modelList: ["kimi-k2.6"],
  },
  {
    id: "bailian",
    name: "Bailian (Qwen)",
    websiteUrl: "https://bailian.console.aliyun.com",
    apiKeyUrl: "https://bailian.console.aliyun.com/#/api-key",
    category: "cn_official",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    protocol: "chatCompletions",
    model: "qwen3-coder-plus",
    modelList: ["qwen3-coder-plus", "qwen3-max"],
  },
  {
    id: "stepfun",
    name: "StepFun",
    websiteUrl: "https://platform.stepfun.com/step-plan",
    apiKeyUrl: "https://platform.stepfun.com/interface-key",
    category: "cn_official",
    baseUrl: "https://api.stepfun.com/step_plan/v1",
    protocol: "chatCompletions",
    model: "step-3.5-flash-2603",
    modelList: ["step-3.5-flash-2603", "step-3.5-flash"],
  },
  {
    id: "minimax",
    name: "MiniMax (China)",
    websiteUrl: "https://platform.minimaxi.com",
    apiKeyUrl: "https://platform.minimaxi.com/subscribe/coding-plan",
    category: "cn_official",
    baseUrl: "https://api.minimaxi.com/v1",
    protocol: "chatCompletions",
    model: "MiniMax-M3",
    modelList: ["MiniMax-M3", "MiniMax-M2.7"],
  },
  {
    id: "volcano-ark",
    name: "火山引擎 Ark",
    websiteUrl: "https://www.volcengine.com/product/ark",
    apiKeyUrl: "https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey",
    category: "cn_official",
    baseUrl: "https://ark.cn-beijing.volces.com/api/coding/v3",
    protocol: "chatCompletions",
    model: "ark-code-latest",
    modelList: ["ark-code-latest"],
  },
  {
    id: "baidu-qianfan",
    name: "百度千帆 Coding Plan",
    category: "cn_official",
    baseUrl: "https://qianfan.baidubce.com/v2/coding",
    protocol: "chatCompletions",
    model: "qianfan-code-latest",
    websiteUrl: "https://cloud.baidu.com/product/qianfan_modelbuilder",
  },
  {
    id: "xiaomi-mimo",
    name: "小米 MiMo",
    category: "cn_official",
    baseUrl: "https://api.xiaomimimo.com/v1",
    protocol: "chatCompletions",
    model: "mimo-v2.5-pro",
    modelList: ["mimo-v2.5-pro"],
    websiteUrl: "https://platform.xiaomimimo.com",
  },
  {
    id: "modelscope",
    name: "ModelScope",
    category: "cn_official",
    baseUrl: "https://api-inference.modelscope.cn/v1",
    protocol: "chatCompletions",
    model: "ZhipuAI/GLM-5.1",
    modelList: ["ZhipuAI/GLM-5.1"],
    websiteUrl: "https://modelscope.cn",
  },
  {
    id: "longcat",
    name: "Longcat",
    category: "cn_official",
    baseUrl: "https://api.longcat.chat/openai/v1",
    protocol: "chatCompletions",
    model: "LongCat-Flash-Chat",
    modelList: ["LongCat-Flash-Chat"],
    websiteUrl: "https://longcat.chat/platform",
  },

  // ── 聚合/中转 ──
  {
    id: "siliconflow",
    name: "SiliconFlow",
    websiteUrl: "https://siliconflow.cn",
    apiKeyUrl: "https://cloud.siliconflow.cn",
    category: "aggregator",
    baseUrl: "https://api.siliconflow.cn/v1",
    protocol: "chatCompletions",
    model: "Pro/MiniMaxAI/MiniMax-M2.7",
    modelList: ["Pro/MiniMaxAI/MiniMax-M2.7"],
  },

  // ── 第三方 ──
];
