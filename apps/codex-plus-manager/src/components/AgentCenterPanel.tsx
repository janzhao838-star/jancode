import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { t, tf } from "@/i18n";
import {
  BUILTIN_ROLES,
  CUSTOM_ROLES_STORAGE_KEY,
  SELECTED_ROLE_STORAGE_KEY,
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
  MAX_SUMMARY_LENGTH,
  type Role,
  type RoleDraft,
} from "../roles-store";

/**
 * 智能体中心。
 *
 * 版面参考 AionClaw 的智能体页（顶部当前选中 + 卡片网格 + 编辑弹层），
 * 配色沿用本应用自己的深色紫青。
 *
 * ★ 关于「选中之后会发生什么」，这里必须说实话：
 *   选中的角色记录在 localStorage（jancode.roles.selected），**当前版本还没有任何地方
 *   读它**——Rust 侧不认识角色，注入脚本也不读这个键。所以选中本身不改变 Codex 的行为。
 *   这一页把「复制提示词」做成主要动作，用户复制后粘到 Codex 的自定义指令或 AGENTS.md
 *   里才真正生效。界面上如实写明这一点，不让人以为点了「选用」就已经生效。
 *   （把选中状态接到 Codex 是需要改 Rust 的活儿，不在本次范围内。）
 */

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

const buttonStyle = (primary = false): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "5px 12px",
  borderRadius: 999,
  fontSize: 12,
  cursor: "pointer",
  border: `1px solid ${primary ? "hsl(var(--primary))" : "hsl(var(--border))"}`,
  background: primary ? "hsl(var(--primary) / 0.16)" : "transparent",
  color: "hsl(var(--foreground))",
});

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* 存储不可用只影响下次打开的记忆，不该阻断当前操作 */
  }
}

export function AgentCenterPanel() {
  const [custom, setCustom] = useState<Role[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"all" | "builtin" | "custom">("all");
  const [expandedId, setExpandedId] = useState("");
  const [draft, setDraft] = useState<RoleDraft | null>(null);
  const [draftErrors, setDraftErrors] = useState<string[]>([]);
  const [pendingDeleteId, setPendingDeleteId] = useState("");
  const [copiedId, setCopiedId] = useState("");

  useEffect(() => {
    setCustom(parseCustomRoles(readStorage(CUSTOM_ROLES_STORAGE_KEY)));
    setSelectedId(readStorage(SELECTED_ROLE_STORAGE_KEY) ?? "");
  }, []);

  const persistCustom = useCallback((next: Role[]) => {
    setCustom(next);
    writeStorage(CUSTOM_ROLES_STORAGE_KEY, serializeCustomRoles(next));
  }, []);

  const allRoles = useMemo(() => mergeRoles(custom), [custom]);
  const active = resolveActiveRole(selectedId, allRoles);

  const visible = useMemo(() => {
    const byScope = allRoles.filter((role) => {
      if (scope === "builtin") return isBuiltinRole(role.id);
      if (scope === "custom") return !isBuiltinRole(role.id);
      return true;
    });
    return filterRoles(byScope, query);
  }, [allRoles, scope, query]);

  const choose = useCallback((id: string) => {
    // 单选：再点一次已选中的表示取消
    setSelectedId((previous) => {
      const next = previous === id ? "" : id;
      writeStorage(SELECTED_ROLE_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const copyPrompt = useCallback(async (role: Role) => {
    try {
      await navigator.clipboard.writeText(role.prompt);
      setCopiedId(role.id);
      // 一秒半后收回提示，避免一排卡片都挂着「已复制」
      window.setTimeout(() => setCopiedId((current) => (current === role.id ? "" : current)), 1500);
    } catch {
      // 剪贴板被系统拒绝时，至少让用户能手动选中复制
      setExpandedId(role.id);
      setCopiedId("");
    }
  }, []);

  const openNew = () => {
    setDraft({ id: "", name: "", summary: "", prompt: "" });
    setDraftErrors([]);
  };

  const openEdit = (role: Role) => {
    setDraft({ id: role.id, name: role.name, summary: role.summary, prompt: role.prompt });
    setDraftErrors([]);
  };

  /** 以现有角色为模板新建一份——内置角色不能改，但可以照它的样子改出自己的 */
  const cloneAsDraft = (role: Role) => {
    setDraft({
      id: "",
      name: `${role.name}${t("（副本）")}`,
      summary: role.summary,
      prompt: role.prompt,
    });
    setDraftErrors([]);
  };

  const saveDraft = () => {
    if (!draft) return;
    const errors = validateRoleDraft(
      draft,
      allRoles,
      draft.id && !isBuiltinRole(draft.id) ? draft.id : undefined,
    );
    if (errors.length > 0) {
      setDraftErrors(errors);
      return;
    }
    const id = draft.id || createRoleId(draft.name, allRoles);
    persistCustom(
      upsertRole(custom, {
        id,
        name: draft.name.trim(),
        summary: draft.summary.trim(),
        prompt: draft.prompt.trim(),
      }),
    );
    setDraft(null);
    setDraftErrors([]);
  };

  const confirmDelete = (id: string) => {
    persistCustom(removeRole(custom, id));
    setPendingDeleteId("");
    // 删掉的正好是当前生效的那个，就把生效状态一起清掉，不留一个指向不存在角色的 id
    if (selectedId === id) {
      setSelectedId("");
      writeStorage(SELECTED_ROLE_STORAGE_KEY, "");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* ── 当前生效 ── */}
      <div
        style={{
          ...panelStyle,
          background:
            "linear-gradient(135deg, hsl(var(--brand-accent) / 0.16), hsl(var(--brand-accent-2) / 0.08) 60%, transparent)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Sparkles size={15} />
          <strong style={{ fontSize: 13 }}>{t("当前生效的智能体")}</strong>
        </div>
        {active ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <strong style={{ fontSize: 16 }}>{active.name}</strong>
              <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
                {active.summary}
              </span>
            </div>
            <div
              style={{
                fontSize: 12,
                color: "hsl(var(--muted-foreground))",
                lineHeight: 1.7,
                background: "hsl(var(--surface-sunken))",
                borderRadius: 10,
                padding: 10,
              }}
            >
              {promptPreview(active.prompt, 160)}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button type="button" style={buttonStyle(true)} onClick={() => void copyPrompt(active)}>
                <Copy size={12} />
                {copiedId === active.id ? t("已复制") : t("复制提示词")}
              </button>
              <button
                type="button"
                style={buttonStyle()}
                onClick={() => setExpandedId(expandedId === active.id ? "" : active.id)}
              >
                {expandedId === active.id ? t("收起") : t("查看全文")}
              </button>
              <button type="button" style={buttonStyle()} onClick={() => choose(active.id)}>
                <X size={12} />
                {t("取消生效")}
              </button>
            </div>
            {expandedId === active.id ? (
              <pre
                style={{
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontSize: 12,
                  lineHeight: 1.7,
                  color: "hsl(var(--foreground))",
                  background: "hsl(var(--surface-sunken))",
                  borderRadius: 10,
                  padding: 10,
                  maxHeight: 240,
                  overflow: "auto",
                  fontFamily: "inherit",
                }}
              >
                {active.prompt}
              </pre>
            ) : null}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", lineHeight: 1.7 }}>
            {t("还没有选择智能体。选一个作为回答的立场与口吻——同一时刻只有一个生效。")}
          </div>
        )}
      </div>

      {/* ── 如实说明 ── */}
      <div
        style={{
          ...panelStyle,
          padding: 12,
          fontSize: 12,
          lineHeight: 1.8,
          color: "hsl(var(--muted-foreground))",
        }}
      >
        <div style={{ color: "hsl(var(--status-warning))", marginBottom: 4 }}>
          {t("选中还不等于生效：当前版本不会把角色自动写进 Codex。")}
        </div>
        {t("要让它真正起作用，请点「复制提示词」，粘贴到 Codex 的自定义指令或 AGENTS.md 里。自动注入需要改动后端，尚未实现。")}
      </div>

      {/* ── 工具条 ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div
          style={{
            flex: 1,
            minWidth: 180,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "7px 12px",
            borderRadius: 999,
            border: "1px solid hsl(var(--border))",
            background: "hsl(var(--surface-sunken))",
          }}
        >
          <Search size={14} style={{ color: "hsl(var(--muted-foreground))" }} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("搜索名称、说明或提示词…")}
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
          <span style={chipStyle(scope === "all")} onClick={() => setScope("all")}>
            {t("全部")} {allRoles.length}
          </span>
          <span style={chipStyle(scope === "builtin")} onClick={() => setScope("builtin")}>
            {t("内置")} {BUILTIN_ROLES.length}
          </span>
          <span style={chipStyle(scope === "custom")} onClick={() => setScope("custom")}>
            {t("自定义")} {custom.length}
          </span>
        </div>
        <button type="button" style={{ ...buttonStyle(true), padding: "7px 14px" }} onClick={openNew}>
          <Plus size={13} />
          {t("新建智能体")}
        </button>
      </div>

      {/* ── 卡片网格 ── */}
      {visible.length === 0 ? (
        <div
          style={{
            ...panelStyle,
            padding: 28,
            textAlign: "center",
            color: "hsl(var(--muted-foreground))",
            fontSize: 13,
          }}
        >
          {t("没有匹配的智能体。换个关键词，或切到「全部」。")}
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: 12,
          }}
        >
          {visible.map((role) => {
            const builtin = isBuiltinRole(role.id);
            const isActive = role.id === selectedId;
            return (
              <div
                key={role.id}
                style={{
                  ...panelStyle,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  borderColor: isActive ? "hsl(var(--primary))" : "hsl(var(--border))",
                  background: isActive ? "hsl(var(--primary) / 0.08)" : "hsl(var(--card))",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <UserRound size={14} style={{ color: "hsl(var(--muted-foreground))" }} />
                  <strong style={{ fontSize: 13.5 }}>{role.name}</strong>
                  {isActive ? (
                    <span
                      style={{
                        fontSize: 11,
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: "hsl(var(--primary) / 0.2)",
                        color: "hsl(var(--foreground))",
                      }}
                    >
                      {t("生效中")}
                    </span>
                  ) : null}
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: 11,
                      color: "hsl(var(--muted-foreground))",
                    }}
                  >
                    {builtin ? t("内置") : t("自定义")}
                  </span>
                </div>

                {role.summary ? (
                  <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
                    {role.summary}
                  </div>
                ) : null}

                <div
                  style={{
                    fontSize: 11.5,
                    lineHeight: 1.7,
                    color: "hsl(var(--muted-foreground))",
                    background: "hsl(var(--surface-sunken))",
                    borderRadius: 9,
                    padding: 9,
                  }}
                >
                  {expandedId === role.id ? role.prompt : promptPreview(role.prompt)}
                </div>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    style={buttonStyle(!isActive && !builtin)}
                    onClick={() => choose(role.id)}
                  >
                    {isActive ? <Check size={12} /> : null}
                    {isActive ? t("已生效") : t("选用")}
                  </button>
                  <button
                    type="button"
                    style={buttonStyle()}
                    onClick={() => setExpandedId(expandedId === role.id ? "" : role.id)}
                  >
                    {expandedId === role.id ? t("收起") : t("查看")}
                  </button>
                  <button type="button" style={buttonStyle()} onClick={() => void copyPrompt(role)}>
                    <Copy size={12} />
                    {copiedId === role.id ? t("已复制") : t("复制")}
                  </button>
                  {builtin ? (
                    <button type="button" style={buttonStyle()} onClick={() => cloneAsDraft(role)}>
                      {t("复制为副本")}
                    </button>
                  ) : (
                    <>
                      <button type="button" style={buttonStyle()} onClick={() => openEdit(role)}>
                        <Pencil size={12} />
                        {t("编辑")}
                      </button>
                      {pendingDeleteId === role.id ? (
                        <button
                          type="button"
                          style={{ ...buttonStyle(), borderColor: "hsl(var(--destructive))" }}
                          onClick={() => confirmDelete(role.id)}
                        >
                          {t("确认删除")}
                        </button>
                      ) : (
                        <button
                          type="button"
                          style={buttonStyle()}
                          onClick={() => setPendingDeleteId(role.id)}
                        >
                          <Trash2 size={12} />
                          {t("删除")}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── 编辑弹层 ── */}
      {draft ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "hsl(var(--shadow-color) / 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            zIndex: 60,
          }}
          onClick={() => setDraft(null)}
        >
          <div
            style={{ ...panelStyle, width: "min(680px, 100%)", maxHeight: "86vh", overflow: "auto" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
              <strong style={{ fontSize: 14 }}>
                {draft.id ? t("编辑智能体") : t("新建智能体")}
              </strong>
              <button
                type="button"
                style={{ ...buttonStyle(), marginLeft: "auto", border: 0 }}
                onClick={() => setDraft(null)}
              >
                <X size={14} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
                  {tf("名称（最多 {0} 个字）", [MAX_NAME_LENGTH])}
                </span>
                <input
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 9,
                    border: "1px solid hsl(var(--border))",
                    background: "hsl(var(--surface-sunken))",
                    color: "hsl(var(--foreground))",
                    fontSize: 13,
                    outline: "none",
                  }}
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
                  {tf("一句话说明（最多 {0} 个字）", [MAX_SUMMARY_LENGTH])}
                </span>
                <input
                  value={draft.summary}
                  onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 9,
                    border: "1px solid hsl(var(--border))",
                    background: "hsl(var(--surface-sunken))",
                    color: "hsl(var(--foreground))",
                    fontSize: 13,
                    outline: "none",
                  }}
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
                  {tf("系统提示词（最多 {0} 个字，当前 {1}）", [
                    MAX_PROMPT_LENGTH,
                    draft.prompt.length,
                  ])}
                </span>
                <textarea
                  value={draft.prompt}
                  onChange={(event) => setDraft({ ...draft, prompt: event.target.value })}
                  rows={10}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 9,
                    border: "1px solid hsl(var(--border))",
                    background: "hsl(var(--surface-sunken))",
                    color: "hsl(var(--foreground))",
                    fontSize: 13,
                    lineHeight: 1.7,
                    outline: "none",
                    resize: "vertical",
                    fontFamily: "inherit",
                  }}
                />
              </label>

              {draftErrors.length > 0 ? (
                <div
                  style={{
                    fontSize: 12,
                    lineHeight: 1.7,
                    color: "hsl(var(--status-error))",
                    background: "hsl(var(--status-error) / 0.1)",
                    borderRadius: 9,
                    padding: 10,
                  }}
                >
                  {draftErrors.map((error) => (
                    <div key={error}>· {error}</div>
                  ))}
                </div>
              ) : null}

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button type="button" style={buttonStyle()} onClick={() => setDraft(null)}>
                  {t("取消")}
                </button>
                <button
                  type="button"
                  style={{ ...buttonStyle(true), padding: "7px 18px" }}
                  onClick={saveDraft}
                >
                  {t("保存")}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
