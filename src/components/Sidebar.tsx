import { useEffect, useState } from "react";

export type CustomSection = {
  id: string;
  label: string;
  sortOrder: number;
  createdAt: number;
};

type SectionApi = {
  list: () => Promise<CustomSection[]>;
  create: (payload: { label: string }) => Promise<CustomSection>;
  update: (payload: {
    id: string;
    label?: string;
    sortOrder?: number;
  }) => Promise<CustomSection>;
  delete: (id: string) => Promise<void>;
};

type Section = {
  id: string;
  label: string;
  builtin?: boolean;
};

const builtinSections: Section[] = [
  { id: "all", label: "全部笔记", builtin: true },
  { id: "today", label: "今天", builtin: true },
  { id: "important", label: "重要", builtin: true },
];

type SidebarProps = {
  activeSectionId: string;
  onActiveSectionChange: (id: string) => void;
  sectionCounts: Record<string, number>;
  sectionApi: SectionApi;
  onCustomSectionsChange: (sections: CustomSection[]) => void;
  onSectionDeleted?: (id: string) => void;
  saveHint: string;
  storagePath: string;
};

export function Sidebar({
  activeSectionId,
  onActiveSectionChange,
  sectionCounts,
  sectionApi,
  onCustomSectionsChange,
  onSectionDeleted,
  saveHint,
  storagePath,
}: SidebarProps) {
  const [customSections, setCustomSections] = useState<CustomSection[]>([]);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");

  useEffect(() => {
    let isDisposed = false;
    sectionApi.list().then((list) => {
      if (!isDisposed) setCustomSections(list);
    });
    return () => {
      isDisposed = true;
    };
  }, [sectionApi]);

  useEffect(() => {
    onCustomSectionsChange(customSections);
  }, [customSections]);

  const handleAddSection = async () => {
    try {
      const created = await sectionApi.create({ label: "新分类" });
      setCustomSections((prev) => [...prev, created]);
      setEditingSectionId(created.id);
      setEditingLabel(created.label);
    } catch (error) {
      console.error(error);
    }
  };

  const handleRenameSection = async (id: string) => {
    const label = editingLabel.trim();
    if (!label) {
      setEditingSectionId(null);
      return;
    }
    try {
      const updated = await sectionApi.update({ id, label });
      setCustomSections((prev) =>
        prev.map((s) => (s.id === id ? { ...s, label: updated.label } : s)),
      );
    } catch (error) {
      console.error(error);
    }
    setEditingSectionId(null);
  };

  const handleDeleteSection = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (
      !window.confirm(
        "删除分类后，该分类下的笔记将移至「全部笔记」，确定删除？",
      )
    )
      return;
    try {
      await sectionApi.delete(id);
      setCustomSections((prev) => prev.filter((s) => s.id !== id));
      onSectionDeleted?.(id);
    } catch (error) {
      console.error(error);
    }
  };
  return (
    <aside className="glass-sidebar window-no-drag absolute bottom-[6px] left-[6px] top-[6px] z-20 flex w-[278px] flex-col rounded-[28px] bg-gray-50/90 p-3">
      <header className="window-drag-region mb-4 rounded-2xl px-2 pb-3 pt-8">
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
          记事本
        </h1>
      </header>

      <nav className="window-no-drag space-y-1">
        {builtinSections.map((section) => {
          const isActive = section.id === activeSectionId;

          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onActiveSectionChange(section.id)}
              className={`group flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-macBlue text-white"
                  : "text-slate-700 hover:bg-slate-100/80 hover:text-slate-900"
              }`}
            >
              <span>{section.label}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold transition-colors ${
                  isActive
                    ? "bg-white/30 text-white"
                    : "bg-slate-100 text-slate-500 group-hover:text-slate-700"
                }`}
              >
                {sectionCounts[section.id] ?? 0}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="mt-3 flex-1 min-h-0 flex flex-col">
        <div className="flex items-center justify-between px-3 mb-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            自定义分类
          </span>
          <button
            type="button"
            onClick={handleAddSection}
            className="window-no-drag rounded-md p-0.5 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600"
            title="新建分类"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
        <div className="window-no-drag space-y-1 overflow-y-auto min-h-0 flex-1">
          {customSections.map((section) => {
            const isActive = section.id === activeSectionId;
            const isEditing = editingSectionId === section.id;

            if (isEditing) {
              return (
                <div key={section.id} className="px-1">
                  <input
                    type="text"
                    autoFocus
                    value={editingLabel}
                    onChange={(e) => setEditingLabel(e.target.value)}
                    onBlur={() => handleRenameSection(section.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRenameSection(section.id);
                      if (e.key === "Escape") setEditingSectionId(null);
                    }}
                    className="w-full rounded-xl border border-macBlue/40 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none ring-2 ring-macBlue/20"
                  />
                </div>
              );
            }

            return (
              <button
                key={section.id}
                type="button"
                onClick={() => onActiveSectionChange(section.id)}
                onDoubleClick={() => {
                  setEditingSectionId(section.id);
                  setEditingLabel(section.label);
                }}
                className={`group flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-macBlue text-white"
                    : "text-slate-700 hover:bg-slate-100/80 hover:text-slate-900"
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{section.label}</span>
                <div className="flex items-center gap-1">
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => handleDeleteSection(section.id, e)}
                    className={`rounded-md p-0.5 opacity-0 transition-opacity group-hover:opacity-100 ${
                      isActive
                        ? "text-white/70 hover:text-white"
                        : "text-slate-400 hover:text-slate-600"
                    }`}
                    title="删除分类"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold transition-colors ${
                      isActive
                        ? "bg-white/30 text-white"
                        : "bg-slate-100 text-slate-500 group-hover:text-slate-700"
                    }`}
                  >
                    {sectionCounts[section.id] ?? 0}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div
        className="mt-auto border-t py-3 relative"
        style={{ boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.9)" }}
      >
        <p className="text-sm font-semibold text-slate-800">{saveHint}</p>
        <div className="mt-1 flex items-center gap-1.5">
          <p className="min-w-0 flex-1 truncate text-xs text-slate-500">
            {storagePath}
          </p>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(storagePath);
              window.notepad?.showNotification?.({ body: "复制成功" });
            }}
            className="window-no-drag shrink-0 rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600"
            title="复制路径"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect
                width="14"
                height="14"
                x="8"
                y="8"
                rx="2"
                ry="2"
              />
              <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
