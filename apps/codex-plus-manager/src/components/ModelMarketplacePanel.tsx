import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, Check, Filter, Loader2, RefreshCw, Search, Store } from "lucide-react";
import { t, tf } from "@/i18n";
import {
  buildCatalog,
  catalogSummary,
  displayName,
  filterCatalog,
  groupCatalog,
  tagFacets,
  type CatalogModel,
  type CatalogSource,
  type GroupKey,
} from "../model-marketplace";
import type { RelayProfile } from "../App";

/**
 * 模型广场。
 *
 * 版面参考 AionClaw 的模型广场（左侧筛选栏 + 搜索 + 卡片网格），
 * 但**只取版面，不取它的配色**——本应用已有自己的深色紫青品牌色。
 *
 * 一条硬规矩贯穿全页：**没有数据来源的字段一律不显示**。
 * AionClaw 的卡片上有输入/输出单价、延迟、吞吐，这些本应用拿不到：
 * 中转站的 /v1/models 只返回模型 id。这一页宁可留白并写明「未提供」，
 * 也不编造一组看着专业的数字——假价格比没有价格更害人。
 * 唯一有真实来源的是 Sub2API 倍率，且只对启用了 Sub2API 的供应商请求。
 */

/** 只取面板真正用到的字段，避免把 App.tsx 的一堆类型拖进来 */
interface BillingInfo {
  effectiveRateMultiplier: number;
  observedAt: string;
}

export interface ModelMarketplacePanelProps {
  profiles: RelayProfile[];
  /** 走 App 里已有的 fetchRelayProfileModels（它返回的就是模型数组，失败为 null） */
  loadModels: (profile: RelayProfile) => Promise<string[] | null>;
  /** 走 App 里已有的 fetch_sub2api_billing；失败返回 null */
  loadBilling: (profile: RelayProfile) => Promise<BillingInfo | null>;
  /** 一个供应商都没配时，引导去供应商配置页 */
  onOpenProviders: () => void;
}

interface SourceStatus {
  profileId: string;
  profileName: string;
  /** 供应商的接口地址，来自配置本身（不依赖拉取是否成功） */
  baseUrl: string;
  count: number;
  failed: boolean;
  multiplier?: number;
}

const panelStyle: React.CSSProperties = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 14,
  padding: 16,
};

const chipStyle = (active: boolean): React.CSSProperties => ({
  padding: "5px 12px",
  borderRadius: 999,
  cursor: "pointer",
  fontSize: 12,
  border: `1px solid ${active ? "hsl(var(--primary))" : "hsl(var(--border))"}`,
  background: active ? "hsl(var(--primary) / 0.16)" : "transparent",
  color: active ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",
  userSelect: "none",
});

/** 供应商里本地已经配置过的模型 id（modelList 是每行一个） */
function configuredIds(profile: RelayProfile): Set<string> {
  const ids = new Set<string>();
  for (const line of (profile.modelList ?? "").split(/\r?\n/)) {
    // 允许 "deepseek-v3[1M]" 这种带窗口后缀的写法，只取模型名部分
    const id = line.trim().split(/\s+/)[0]?.split("[")[0]?.trim();
    if (id) ids.add(id);
  }
  return ids;
}

export function ModelMarketplacePanel({
  profiles,
  loadModels,
  loadBilling,
  onOpenProviders,
}: ModelMarketplacePanelProps) {
  const [catalog, setCatalog] = useState<CatalogModel[]>([]);
  const [statuses, setStatuses] = useState<SourceStatus[]>([]);
  const [query, setQuery] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [groupKey, setGroupKey] = useState<GroupKey>("vendor");
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  const configured = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const profile of profiles) map.set(profile.id, configuredIds(profile));
    return map;
  }, [profiles]);

  const refresh = useCallback(async () => {
    if (profiles.length === 0) return;
    setLoading(true);
    const sources: CatalogSource[] = [];
    const nextStatuses: SourceStatus[] = [];
    try {
      // 逐个供应商拉取。刻意串行：并发打多个中转站容易被风控，
      // 而且这里的失败提示需要能明确对应到某一个供应商。
      for (const profile of profiles) {
        const result = await loadModels(profile);
        if (result) {
          sources.push({
            profileId: profile.id,
            profileName: profile.name,
            models: result,
          });
        }
        const status: SourceStatus = {
          profileId: profile.id,
          profileName: profile.name,
          baseUrl: profile.baseUrl,
          count: result?.length ?? 0,
          failed: !result,
        };
        // 倍率只有 Sub2API 供应商有；非 Sub2API 的供应商连请求都不发
        if (profile.sub2apiEnabled) {
          const billing = await loadBilling(profile);
          if (billing) status.multiplier = billing.effectiveRateMultiplier;
        }
        nextStatuses.push(status);
      }
      setCatalog(buildCatalog(sources));
      setStatuses(nextStatuses);
      setFetched(true);
      // 换了数据源之后旧标签可能已经不存在，清掉避免筛出空列表
      setActiveTags([]);
    } finally {
      setLoading(false);
    }
  }, [profiles, loadModels, loadBilling]);

  const visible = useMemo(
    () => filterCatalog(catalog, query, activeTags),
    [catalog, query, activeTags],
  );
  const facets = useMemo(() => tagFacets(catalog), [catalog]);
  const summary = useMemo(() => catalogSummary(catalog), [catalog]);
  const groups = useMemo(() => groupCatalog(visible, groupKey), [visible, groupKey]);

  const toggleTag = (tag: string) =>
    setActiveTags((previous) =>
      previous.includes(tag) ? previous.filter((item) => item !== tag) : [...previous, tag],
    );

  if (profiles.length === 0) {
    return (
      <div style={{ ...panelStyle, display: "flex", flexDirection: "column", gap: 10 }}>
        <strong style={{ fontSize: 14 }}>{t("还没有配置供应商")}</strong>
        <div style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", lineHeight: 1.7 }}>
          {t("模型广场从中转站读取可用模型，所以先要有至少一个供应商。")}
        </div>
        <button
          type="button"
          onClick={onOpenProviders}
          style={{
            alignSelf: "flex-start",
            padding: "7px 16px",
            borderRadius: 9,
            border: "1px solid hsl(var(--border))",
            background: "hsl(var(--primary) / 0.16)",
            color: "hsl(var(--foreground))",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          {t("去配置供应商")}
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
      {/* ── 左栏：数据来源与筛选 ── */}
      <div style={{ width: 280, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ ...panelStyle, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Store size={15} />
            <strong style={{ fontSize: 13 }}>{t("数据来源")}</strong>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "8px 0",
              borderRadius: 9,
              border: "1px solid hsl(var(--border))",
              background: "hsl(var(--primary) / 0.16)",
              color: "hsl(var(--foreground))",
              cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.6 : 1,
              fontSize: 13,
            }}
          >
            {loading ? (
              // styles.css 里只有 @keyframes spin，没有 .spin 类，所以用内联动画
              <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
            ) : (
              <RefreshCw size={14} />
            )}
            {fetched ? t("重新获取") : t("获取模型列表")}
          </button>
          <div style={{ fontSize: 11.5, color: "hsl(var(--muted-foreground))", lineHeight: 1.7 }}>
            {t("从每个供应商的 /v1/models 读取。不会自动请求——中转站可能很慢或不可达。")}
          </div>
          {statuses.map((status) => (
            <div
              key={status.profileId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                color: status.failed ? "hsl(var(--status-error))" : "hsl(var(--muted-foreground))",
              }}
            >
              {status.failed ? <AlertTriangle size={12} /> : <Check size={12} />}
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {status.profileName}
              </span>
              <span>{status.failed ? t("失败") : tf("{0} 个", [status.count])}</span>
              {status.multiplier !== undefined ? (
                <span style={{ color: "hsl(var(--muted-foreground))" }}>
                  {tf("{0}x", [status.multiplier])}
                </span>
              ) : null}
            </div>
          ))}
        </div>

        {fetched && facets.length > 0 ? (
          <div style={{ ...panelStyle, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Filter size={15} />
              <strong style={{ fontSize: 13 }}>{t("按标签筛选")}</strong>
              {activeTags.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setActiveTags([])}
                  style={{
                    marginLeft: "auto",
                    border: 0,
                    background: "transparent",
                    color: "hsl(var(--muted-foreground))",
                    cursor: "pointer",
                    fontSize: 11.5,
                  }}
                >
                  {t("清空")}
                </button>
              ) : null}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {facets.map((facet) => (
                <span
                  key={facet.tag}
                  style={chipStyle(activeTags.includes(facet.tag))}
                  onClick={() => toggleTag(facet.tag)}
                >
                  {facet.tag} {facet.count}
                </span>
              ))}
            </div>
            <div style={{ fontSize: 11.5, color: "hsl(var(--muted-foreground))", lineHeight: 1.7 }}>
              {t("标签由模型 id 推导，不是上游声明的参数。")}
            </div>
          </div>
        ) : null}
      </div>

      {/* ── 右栏：搜索与模型卡片 ── */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div
            style={{
              flex: 1,
              minWidth: 200,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 12px",
              borderRadius: 9,
              border: "1px solid hsl(var(--border))",
              background: "hsl(var(--surface-sunken))",
            }}
          >
            <Search size={14} style={{ color: "hsl(var(--muted-foreground))" }} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("搜索模型、厂商或标签…")}
              style={{
                flex: 1,
                border: 0,
                outline: "none",
                background: "transparent",
                color: "hsl(var(--foreground))",
                fontSize: 13,
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <span style={chipStyle(groupKey === "vendor")} onClick={() => setGroupKey("vendor")}>
              {t("按厂商")}
            </span>
            <span style={chipStyle(groupKey === "profile")} onClick={() => setGroupKey("profile")}>
              {t("按供应商")}
            </span>
          </div>
        </div>

        {fetched ? (
          <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
            {tf("共 {0} 个模型条目 · {1} 个厂商 · {2} 个供应商", [
              summary.total,
              summary.vendors,
              summary.profiles,
            ])}
            {summary.uniqueIds !== summary.total
              ? tf("（其中 {0} 个 id 被多个供应商同时提供）", [summary.total - summary.uniqueIds])
              : ""}
          </div>
        ) : null}

        {!fetched ? (
          <div
            style={{
              ...panelStyle,
              padding: 28,
              textAlign: "center",
              color: "hsl(var(--muted-foreground))",
              fontSize: 13,
              lineHeight: 1.8,
            }}
          >
            {t("还没有获取模型列表。点左侧「获取模型列表」从中转站读取当前可用模型。")}
          </div>
        ) : visible.length === 0 ? (
          <div
            style={{
              ...panelStyle,
              padding: 28,
              textAlign: "center",
              color: "hsl(var(--muted-foreground))",
              fontSize: 13,
            }}
          >
            {t("没有匹配的模型。换个关键词，或清空标签筛选。")}
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.key} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <strong style={{ fontSize: 13 }}>{group.label}</strong>
                <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
                  {tf("{0} 个", [group.models.length])}
                </span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                  gap: 10,
                }}
              >
                {group.models.map((model) => {
                  const isConfigured = configured.get(model.profileId)?.has(model.id) ?? false;
                  return (
                    <div
                      key={`${model.profileId}::${model.id}`}
                      style={{ ...panelStyle, padding: 12, display: "flex", flexDirection: "column", gap: 6 }}
                    >
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                        <strong style={{ fontSize: 13, wordBreak: "break-all" }}>
                          {displayName(model.id)}
                        </strong>
                        <span
                          style={{
                            marginLeft: "auto",
                            fontSize: 11,
                            color: "hsl(var(--muted-foreground))",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {model.vendor}
                        </span>
                      </div>
                      {displayName(model.id) !== model.id ? (
                        <div
                          style={{
                            fontSize: 11,
                            color: "hsl(var(--muted-foreground))",
                            wordBreak: "break-all",
                          }}
                        >
                          {model.id}
                        </div>
                      ) : null}
                      {model.tags.length > 0 ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                          {model.tags.map((tag) => (
                            <span
                              key={tag}
                              style={{
                                fontSize: 11,
                                padding: "2px 8px",
                                borderRadius: 999,
                                background: "hsl(var(--secondary))",
                                color: "hsl(var(--secondary-foreground))",
                              }}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          fontSize: 11.5,
                          color: "hsl(var(--muted-foreground))",
                        }}
                      >
                        <span>{model.profileName}</span>
                        {isConfigured ? (
                          <span style={{ color: "hsl(var(--status-success))" }}>{t("已配置")}</span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}

        <div style={{ fontSize: 11.5, color: "hsl(var(--muted-foreground))", lineHeight: 1.8 }}>
          {t("说明：本页只展示上游真实提供的信息（模型 id 与来源）。单价、延迟、吞吐这些中转站的 /v1/models 并不返回，因此这里不显示，也不做估算。")}
        </div>
      </div>
    </div>
  );
}
