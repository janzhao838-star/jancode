import { useCallback, useEffect, useMemo, useState } from "react";
import { Power, PowerOff, Search, Star } from "lucide-react";
import { t } from "@/i18n";
import { BUILTIN_ROLES, activeRole, type Role } from "../roles-library";
import { CUSTOM_ROLES_STORAGE_KEY, mergeRoles, parseCustomRoles } from "../roles-store";
import { CAPABILITY_TOGGLES } from "../capability-toggles";
import {
  BUILTIN_SKILLS,
  matchSkills,
  visibleSkills,
  type BuiltinSkill,
} from "../skills-library";

/**
 * 技能中心面板。
 *
 * 两个标签页：
 *   · 技能库 —— 浏览内置技能，逐个启用/停用，可切换专家模式查看进阶技能
 *   · 触发测试 —— 输入一段任务描述，实时看会命中哪些技能、命中强度多少
 *
 * 设计参考 ZeroCode（零度code）的技能系统：技能由「名称 + 说明 + 触发词 + 提示词正文」
 * 描述，按任务文本自动匹配。
 *
 * 关于持久化：启用状态存在 webview 的 localStorage 里（键前缀 jancode.skills.）。
 * 之所以没写进 BackendSettings，是为了避免为此改动 Rust 结构体的 serde 定义与
 * Default 实现、进而牵连已有的 settings 测试；这是纯界面偏好，与后端配置无关。
 */

const ENABLED_STORAGE_KEY = "jancode.skills.enabled";
const EXPERT_STORAGE_KEY = "jancode.skills.expert";
const ROLE_STORAGE_KEY = "jancode.roles.selected";

function loadEnabledIds(): Set<string> {
  try {
    const raw = window.localStorage.getItem(ENABLED_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    // 只保留仍然存在的技能 id，避免历史数据残留在界面外
    const known = new Set(BUILTIN_SKILLS.map((skill) => skill.id));
    return new Set(parsed.filter((id): id is string => typeof id === "string" && known.has(id)));
  } catch {
    return new Set();
  }
}

function persistEnabledIds(ids: Set<string>) {
  try {
    window.localStorage.setItem(ENABLED_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    /* 存储不可用时仅影响下次打开的记忆，不影响本次使用 */
  }
}

function persistExpertMode(value: boolean) {
  try {
    window.localStorage.setItem(EXPERT_STORAGE_KEY, value ? "1" : "0");
  } catch {
    /* 同上 */
  }
}

const panelStyle: React.CSSProperties = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 14,
  padding: 16,
};

const chipStyle = (active: boolean): React.CSSProperties => ({
  padding: "6px 14px",
  borderRadius: 999,
  cursor: "pointer",
  fontSize: 13,
  border: "1px solid " + (active ? "hsl(var(--brand-accent))" : "hsl(var(--border))"),
  background: active
    ? "linear-gradient(135deg, hsl(var(--brand-accent)), hsl(var(--brand-accent-2)))"
    : "transparent",
  color: active ? "#fff" : "hsl(var(--muted-foreground))",
});

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--input))",
  color: "hsl(var(--foreground))",
  fontSize: 14,
};


export function SkillsCenterPanel({
  settings,
  onToggleCapability,
}: {
  settings?: Record<string, unknown> | null;
  onToggleCapability?: (field: string, next: boolean) => void;
}) {
  const [tab, setTab] = useState<"library" | "tester" | "roles" | "toggles">("library");
  const [expertMode, setExpertMode] = useState(false);
  const [enabledIds, setEnabledIds] = useState<Set<string>>(new Set());
  const [keyword, setKeyword] = useState("");
  const [probeText, setProbeText] = useState("");

  // 首次挂载时读回本地状态
  useEffect(() => {
    setEnabledIds(loadEnabledIds());
    try {
      setExpertMode(window.localStorage.getItem(EXPERT_STORAGE_KEY) === "1");
    } catch {
      setExpertMode(false);
    }
  }, []);

  const toggleSkill = useCallback((id: string) => {
    setEnabledIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persistEnabledIds(next);
      return next;
    });
  }, []);

  const toggleExpertMode = useCallback(() => {
    setExpertMode((previous) => {
      const next = !previous;
      persistExpertMode(next);
      return next;
    });
  }, []);

  const shownSkills = useMemo(() => {
    const base = visibleSkills(expertMode);
    const needle = keyword.trim().toLowerCase();
    if (!needle) return base;
    return base.filter((skill) =>
      skill.name.toLowerCase().includes(needle)
      || skill.summary.toLowerCase().includes(needle)
      || skill.triggers.some((trigger) => trigger.toLowerCase().includes(needle)),
    );
  }, [expertMode, keyword]);

  const probeMatches = useMemo(() => matchSkills(probeText), [probeText]);

  const enabledCount = useMemo(
    () => BUILTIN_SKILLS.filter((skill) => enabledIds.has(skill.id)).length,
    [enabledIds],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" style={chipStyle(tab === "library")} onClick={() => setTab("library")}>
          {t("技能库")}
        </button>
        <button type="button" style={chipStyle(tab === "tester")} onClick={() => setTab("tester")}>
          {t("触发测试")}
        </button>
        <button type="button" style={chipStyle(tab === "roles")} onClick={() => setTab("roles")}>
          {t("角色库")}
        </button>
        <button type="button" style={chipStyle(tab === "toggles")} onClick={() => setTab("toggles")}>
          {t("能力开关")}
        </button>
        <span style={{ flex: 1 }} />
        {tab === "library" ? (
          <button type="button" style={chipStyle(expertMode)} onClick={toggleExpertMode}>
            {expertMode ? t("专家模式：开") : t("专家模式：关")}
          </button>
        ) : null}
      </div>

      {tab === "library" ? (
        <>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: "1 1 240px" }}>
              <Search
                size={15}
                style={{
                  position: "absolute",
                  left: 11,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "hsl(var(--muted-foreground))",
                }}
              />
              <input
                type="text"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder={t("搜索技能名称、说明或触发词")}
                style={{ ...inputStyle, paddingLeft: 32 }}
              />
            </div>
            <span style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>
              {t("已启用")} {enabledCount} / {BUILTIN_SKILLS.length}
            </span>
          </div>

          {shownSkills.length === 0 ? (
            <div style={{ ...panelStyle, color: "hsl(var(--muted-foreground))", fontSize: 14 }}>
              {t("没有匹配的技能。")}{expertMode ? "" : t("试试打开专家模式查看进阶技能。")}
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: 12,
              }}
            >
              {shownSkills.map((skill) => (
                <SkillCard
                  key={skill.id}
                  skill={skill}
                  enabled={enabledIds.has(skill.id)}
                  onToggle={toggleSkill}
                />
              ))}
            </div>
          )}
        </>
      ) : null}

      {tab === "tester" ? (
        <TriggerTester value={probeText} onChange={setProbeText} matches={probeMatches} />
      ) : null}

      {tab === "roles" ? <RoleGallery /> : null}

      {tab === "toggles" ? (
        <CapabilityToggles settings={settings ?? null} onToggle={onToggleCapability} />
      ) : null}
    </div>
  );
}

function SkillCard({
  skill,
  enabled,
  onToggle,
}: {
  skill: BuiltinSkill;
  enabled: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <div
      style={{
        ...panelStyle,
        borderColor: enabled ? "hsl(var(--brand-accent))" : "hsl(var(--border))",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Star
          size={15}
          style={{ color: enabled ? "hsl(var(--brand-accent))" : "hsl(var(--muted-foreground))" }}
        />
        <strong style={{ fontSize: 14, flex: 1 }}>{skill.name}</strong>
        {skill.expert ? (
          <span
            style={{
              fontSize: 11,
              padding: "2px 7px",
              borderRadius: 999,
              border: "1px solid hsl(var(--status-warning))",
              color: "hsl(var(--status-warning))",
            }}
          >
            {t("进阶")}
          </span>
        ) : null}
      </div>

      <div style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", lineHeight: 1.55 }}>
        {skill.summary}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {skill.triggers.slice(0, 5).map((trigger) => (
          <span
            key={trigger}
            style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 999,
              background: "hsl(var(--muted))",
              color: "hsl(var(--muted-foreground))",
            }}
          >
            {trigger}
          </span>
        ))}
        {skill.triggers.length > 5 ? (
          <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
            +{skill.triggers.length - 5}
          </span>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => onToggle(skill.id)}
        style={{
          ...chipStyle(enabled),
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          justifyContent: "center",
        }}
      >
        {enabled ? <Power size={13} /> : <PowerOff size={13} />}
        {enabled ? t("已启用") : t("启用")}
      </button>
    </div>
  );
}

function TriggerTester({
  value,
  onChange,
  matches,
}: {
  value: string;
  onChange: (next: string) => void;
  matches: ReturnType<typeof matchSkills>;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", lineHeight: 1.6 }}>
        {t("输入一段任务描述，看看会自动命中哪些技能。命中强度按触发词的数量与具体程度累加，越靠前表示越相关。")}
      </div>

      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        placeholder={t("例如：帮我做一次代码审查，顺便看看这段 SQL 的索引有没有问题")}
        style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
      />

      {value.trim().length === 0 ? (
        <div style={{ ...panelStyle, color: "hsl(var(--muted-foreground))", fontSize: 13 }}>
          {t("还没有输入内容。")}
        </div>
      ) : matches.length === 0 ? (
        <div style={{ ...panelStyle, color: "hsl(var(--muted-foreground))", fontSize: 13 }}>
          {t("没有命中任何技能。这是正常的——技能只在任务确实相关时才会启用。")}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {matches.map((match, index) => (
            <div key={match.skill.id} style={{ ...panelStyle, padding: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    fontSize: 12,
                    minWidth: 22,
                    textAlign: "center",
                    color: "hsl(var(--muted-foreground))",
                  }}
                >
                  #{index + 1}
                </span>
                <strong style={{ fontSize: 14, flex: 1 }}>{match.skill.name}</strong>
                <span
                  style={{
                    fontSize: 12,
                    padding: "2px 9px",
                    borderRadius: 999,
                    background: "linear-gradient(135deg, hsl(var(--brand-accent)), hsl(var(--brand-accent-2)))",
                    color: "#fff",
                  }}
                >
                  {t("强度")} {match.score}
                </span>
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "hsl(var(--muted-foreground))",
                  marginTop: 8,
                  paddingLeft: 30,
                }}
              >
                {t("命中触发词：")}{match.hits.join("、")}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RoleGallery() {
  const [selected, setSelected] = useState("");
  const [roles, setRoles] = useState<Role[]>(BUILTIN_ROLES);

  useEffect(() => {
    try {
      setSelected(window.localStorage.getItem(ROLE_STORAGE_KEY) ?? "");
    } catch {
      setSelected("");
    }
    // 自定义角色在「智能体」页里维护。这里一并读出来——否则在那边选中的自定义角色
    // 到这边会因为查不到而显示成「未选择」，看起来像选择丢了。
    try {
      setRoles(mergeRoles(parseCustomRoles(window.localStorage.getItem(CUSTOM_ROLES_STORAGE_KEY))));
    } catch {
      setRoles(BUILTIN_ROLES);
    }
  }, []);

  const choose = useCallback((id: string) => {
    // 角色是单选：再点一次已选中的角色表示取消选择
    setSelected((previous) => {
      const next = previous === id ? "" : id;
      try {
        window.localStorage.setItem(ROLE_STORAGE_KEY, next);
      } catch {
        /* 存储不可用只影响下次打开的记忆 */
      }
      return next;
    });
  }, []);

  const current = activeRole(selected, roles);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", lineHeight: 1.6 }}>
        {t("选择一个角色作为回答的立场与口吻。角色是单选——同一时刻只有一个生效，再点一次可取消。")}
      </div>

      <div style={{ ...panelStyle, padding: 12, fontSize: 13 }}>
        {current ? (
          <>
            {t("当前角色：")}
            <strong>{current.name}</strong>
            <span style={{ color: "hsl(var(--muted-foreground))" }}> — {current.summary}</span>
          </>
        ) : (
          <span style={{ color: "hsl(var(--muted-foreground))" }}>
            {t("当前未指定角色。")}
          </span>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
        {roles.map((role) => {
          const isActive = role.id === selected;
          return (
            <button
              key={role.id}
              type="button"
              onClick={() => choose(role.id)}
              style={{
                ...panelStyle,
                textAlign: "left",
                cursor: "pointer",
                borderColor: isActive ? "hsl(var(--brand-accent))" : "hsl(var(--border))",
                background: isActive
                  ? "linear-gradient(135deg, hsl(var(--brand-accent) / 0.14), hsl(var(--brand-accent-2) / 0.14))"
                  : "hsl(var(--card))",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <strong style={{ fontSize: 14, flex: 1, color: "hsl(var(--foreground))" }}>{role.name}</strong>
                {isActive ? (
                  <span
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: "linear-gradient(135deg, hsl(var(--brand-accent)), hsl(var(--brand-accent-2)))",
                      color: "#fff",
                    }}
                  >
                    {t("生效中")}
                  </span>
                ) : null}
              </div>
              <div style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", lineHeight: 1.55 }}>
                {role.summary}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CapabilityToggles({
  settings,
  onToggle,
}: {
  settings: Record<string, unknown> | null;
  onToggle?: (field: string, next: boolean) => void;
}) {
  if (!settings) {
    return (
      <div style={{ ...panelStyle, color: "hsl(var(--muted-foreground))", fontSize: 14 }}>
        {t("正在读取设置…")}
      </div>
    );
  }

  const masterOff = settings.enhancementsEnabled === false;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", lineHeight: 1.6 }}>
        {t("这些开关直接写入 JanCode 设置文件。总开关关闭时，其余增强功能即使勾选也不会生效。")}
      </div>

      {masterOff ? (
        <div
          style={{
            ...panelStyle,
            padding: 12,
            fontSize: 13,
            borderColor: "hsl(var(--status-warning))",
            color: "hsl(var(--status-warning))",
          }}
        >
          {t("增强总开关已关闭，下面的开关当前不会生效。")}
        </div>
      ) : null}

      {CAPABILITY_TOGGLES.map((item) => {
        const value = settings[item.field] === true;
        const isMaster = item.field === "enhancementsEnabled";
        const dimmed = masterOff && !isMaster;
        return (
          <div
            key={item.field}
            style={{
              ...panelStyle,
              padding: 12,
              display: "flex",
              alignItems: "center",
              gap: 12,
              opacity: dimmed ? 0.55 : 1,
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {item.title}
                {isMaster ? (
                  <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginLeft: 8 }}>
                    {t("总开关")}
                  </span>
                ) : null}
              </div>
              <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", marginTop: 4 }}>
                {item.summary}
              </div>
              <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginTop: 4, fontFamily: "monospace" }}>
                {item.field}
              </div>
            </div>
            <button
              type="button"
              disabled={!onToggle}
              onClick={() => onToggle?.(item.field, !value)}
              style={{ ...chipStyle(value), cursor: onToggle ? "pointer" : "not-allowed" }}
            >
              {value ? t("已开启") : t("已关闭")}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default SkillsCenterPanel;
