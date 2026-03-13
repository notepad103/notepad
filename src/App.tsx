import { useEffect, useMemo, useRef, useState } from "react";
import { TiptapEditor } from "./components/TiptapEditor";
import { normalizeBodyHtml, stripHtmlText } from "./utils/html";

type Section = {
  id: string;
  label: string;
  builtin?: boolean;
};

type CustomSection = {
  id: string;
  label: string;
  sortOrder: number;
  createdAt: number;
};

type SectionApi = {
  list: () => Promise<CustomSection[]>;
  create: (payload: { label: string }) => Promise<CustomSection>;
  update: (payload: { id: string; label?: string; sortOrder?: number }) => Promise<CustomSection>;
  delete: (id: string) => Promise<void>;
};

type Note = {
  id: string;
  title: string;
  preview: string;
  body: string;
  sectionId: string;
  createdAt: number;
  updatedAt: number;
};

type SaveState = "idle" | "saving" | "saved" | "error";

type NoteApi = {
  list: () => Promise<Note[]>;
  create: (payload?: { sectionId?: string }) => Promise<Note>;
  update: (payload: {
    id: string;
    body?: string;
    sectionId?: string;
    title?: string;
  }) => Promise<Note>;
  delete: (id: string) => Promise<void>;
  storagePath: () => Promise<string>;
};

const builtinSections: Section[] = [
  { id: "all", label: "全部笔记", builtin: true },
  { id: "today", label: "今天", builtin: true },
  { id: "important", label: "重要", builtin: true },
];

const fallbackNotes: Note[] = [];

const SIDEBAR_WIDTH = 278;
const SIDEBAR_MARGIN = 14;

function sortByCreatedAt(notes: Note[]) {
  return [...notes].sort((a, b) => b.createdAt - a.createdAt);
}

function deriveTitle(body: string, fallback = "未命名笔记") {
  const firstLine = stripHtmlText(body)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) {
    return fallback;
  }

  return firstLine.length > 30 ? `${firstLine.slice(0, 30)}...` : firstLine;
}

function derivePreview(body: string) {
  const plain = stripHtmlText(body).replace(/\s+/g, " ").trim();

  if (!plain) {
    return "点击开始记录...";
  }

  return plain.length > 52 ? `${plain.slice(0, 52)}...` : plain;
}

function formatUpdatedAt(timestamp: number) {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const now = new Date();
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const yesterday = today - 24 * 60 * 60 * 1000;
  const noteDay = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();

  if (noteDay === today) {
    return date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  if (noteDay === yesterday) {
    return "昨天";
  }

  return date.toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
  });
}

function createFallbackSectionApi(): SectionApi {
  let data: CustomSection[] = [];
  return {
    list: async () => [...data],
    create: async (payload) => {
      const section: CustomSection = {
        id: `section-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        label: payload.label || "新分类",
        sortOrder: data.length,
        createdAt: Date.now(),
      };
      data = [...data, section];
      return section;
    },
    update: async (payload) => {
      const idx = data.findIndex((s) => s.id === payload.id);
      if (idx === -1) throw new Error("分类不存在");
      const updated = { ...data[idx] };
      if (payload.label) updated.label = payload.label;
      if (payload.sortOrder !== undefined) updated.sortOrder = payload.sortOrder;
      data = data.map((s) => (s.id === updated.id ? updated : s));
      return updated;
    },
    delete: async (id) => {
      data = data.filter((s) => s.id !== id);
    },
  };
}

function createFallbackApi(): NoteApi {
  let data = sortByCreatedAt(
    fallbackNotes.map((note) => ({
      ...note,
      body: normalizeBodyHtml(note.body),
      preview: derivePreview(note.body),
    })),
  );

  return {
    list: async () => sortByCreatedAt(data),
    create: async (payload) => {
      const sectionId = payload?.sectionId?.trim()
        ? payload.sectionId.trim()
        : "all";
      const body = "<p><br></p>";
      const now = Date.now();
      const note: Note = {
        id: `note-${now}-${Math.random().toString(36).slice(2, 8)}`,
        title: "新建笔记",
        preview: derivePreview(body),
        body,
        sectionId,
        createdAt: now,
        updatedAt: now,
      };

      data = sortByCreatedAt([note, ...data]);
      return note;
    },
    update: async (payload) => {
      const current = data.find((note) => note.id === payload.id);

      if (!current) {
        throw new Error("笔记不存在");
      }

      const nextBody = normalizeBodyHtml(
        typeof payload.body === "string" ? payload.body : current.body,
      );
      const nextSectionId = payload.sectionId?.trim()
        ? payload.sectionId.trim()
        : current.sectionId;
      const updated: Note = {
        ...current,
        title: payload.title?.trim()
          ? payload.title.trim()
          : deriveTitle(nextBody, current.title),
        body: nextBody,
        preview: derivePreview(nextBody),
        sectionId: nextSectionId,
        updatedAt: Date.now(),
      };

      data = sortByCreatedAt(
        data.map((note) => (note.id === updated.id ? updated : note)),
      );
      return updated;
    },
    delete: async (id) => {
      data = data.filter((note) => note.id !== id);
    },
    storagePath: async () => "浏览器预览模式（未连接 Electron 主进程）",
  };
}

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const noteApiRef = useRef<NoteApi>(
    window.notepad?.notes ?? createFallbackApi(),
  );
  const sectionApiRef = useRef<SectionApi>(
    window.notepad?.sections ?? createFallbackSectionApi(),
  );

  const [activeSectionId, setActiveSectionId] = useState("all");
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [editorHtml, setEditorHtml] = useState("<p><br></p>");
  const [lastSavedBody, setLastSavedBody] = useState("<p><br></p>");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [isLoading, setIsLoading] = useState(true);
  const [storagePath, setStoragePath] = useState("读取中...");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [customSections, setCustomSections] = useState<CustomSection[]>([]);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");

  useEffect(() => {
    let isDisposed = false;

    const loadNotes = async () => {
      try {
        const [initialNotes, path, initialSections] = await Promise.all([
          noteApiRef.current.list(),
          noteApiRef.current.storagePath(),
          sectionApiRef.current.list(),
        ]);

        if (isDisposed) {
          return;
        }

        const normalized = sortByCreatedAt(
          initialNotes.map((note) => ({
            ...note,
            body: normalizeBodyHtml(note.body),
          })),
        );

        setNotes(normalized);
        setActiveNoteId(normalized[0]?.id ?? null);
        setStoragePath(path);
        setCustomSections(initialSections);
      } catch (error) {
        if (!isDisposed) {
          console.error(error);
          setStoragePath("加载存储路径失败");
        }
      } finally {
        if (!isDisposed) {
          setIsLoading(false);
        }
      }
    };

    loadNotes();

    return () => {
      isDisposed = true;
    };
  }, []);

  const sectionCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: notes.length,
      today: 0,
      important: 0,
    };

    for (const section of customSections) {
      counts[section.id] = 0;
    }

    const now = new Date();
    const todayYear = now.getFullYear();
    const todayMonth = now.getMonth();
    const todayDate = now.getDate();

    for (const note of notes) {
      const d = new Date(note.createdAt);
      if (
        d.getFullYear() === todayYear &&
        d.getMonth() === todayMonth &&
        d.getDate() === todayDate
      ) {
        counts.today += 1;
      }
      if (note.sectionId === "important") counts.important += 1;
      if (note.sectionId in counts && note.sectionId !== "all" && note.sectionId !== "today" && note.sectionId !== "important") {
        counts[note.sectionId] += 1;
      }
    }

    return counts;
  }, [notes, customSections]);

  const filteredNotes = useMemo(() => {
    let list = notes;
    if (activeSectionId === "today") {
      const now = new Date();
      list = list.filter((note) => {
        const d = new Date(note.createdAt);
        return (
          d.getFullYear() === now.getFullYear() &&
          d.getMonth() === now.getMonth() &&
          d.getDate() === now.getDate()
        );
      });
    } else if (activeSectionId !== "all") {
      list = list.filter((note) => note.sectionId === activeSectionId);
    }

    const keyword = searchKeyword.trim().toLowerCase();
    if (!keyword) {
      return list;
    }
    return list.filter((note) => {
      const titleMatch = note.title.toLowerCase().includes(keyword);
      const previewMatch = note.preview.toLowerCase().includes(keyword);
      const bodyText = stripHtmlText(note.body).toLowerCase();
      const bodyMatch = bodyText.includes(keyword);
      return titleMatch || previewMatch || bodyMatch;
    });
  }, [activeSectionId, notes, searchKeyword]);

  // 当筛选结果变化（切换分类/搜索）时，默认选中并展示第一条
  useEffect(() => {
    const firstId = filteredNotes[0]?.id ?? null;
    setActiveNoteId(firstId);
  }, [filteredNotes]);

  useEffect(() => {
    const currentNote =
      filteredNotes.find((note) => note.id === activeNoteId) ??
      filteredNotes[0] ??
      null;

    if (!currentNote) {
      setEditorHtml("<p><br></p>");
      setLastSavedBody("<p><br></p>");
      setSaveState("idle");
      return;
    }

    if (activeNoteId !== currentNote.id) {
      setActiveNoteId(currentNote.id);
    }

    const normalizedBody = normalizeBodyHtml(currentNote.body);
    setEditorHtml(normalizedBody);
    setLastSavedBody(normalizedBody);
    setSaveState("idle");
  }, [activeNoteId, filteredNotes]);

  useEffect(() => {
    if (isLoading || !activeNoteId) {
      return;
    }

    if (editorHtml === lastSavedBody) {
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        setSaveState("saving");

        const updated = await noteApiRef.current.update({
          id: activeNoteId,
          body: editorHtml,
        });

        const normalized = {
          ...updated,
          body: normalizeBodyHtml(updated.body),
        };

        setNotes((currentNotes) =>
          sortByCreatedAt(
            currentNotes.map((note) =>
              note.id === normalized.id ? normalized : note,
            ),
          ),
        );
        setLastSavedBody(normalized.body);
        setSaveState("saved");
      } catch (error) {
        console.error(error);
        setSaveState("error");
      }
    }, 320);

    return () => {
      window.clearTimeout(timer);
    };
  }, [editorHtml]);

  const contentOffset = SIDEBAR_WIDTH + SIDEBAR_MARGIN * 2;
  const saveHint =
    saveState === "saving"
      ? "保存中..."
      : saveState === "saved"
        ? "已保存到 SQLite"
        : saveState === "error"
          ? "保存失败"
          : "本地 SQLite 持久化";

  const handleCreateNote = async () => {
    try {
      const sectionId = activeSectionId === "all" ? "all" : activeSectionId;
      const created = await noteApiRef.current.create({ sectionId });
      const normalized = { ...created, body: normalizeBodyHtml(created.body) };

      setNotes((currentNotes) =>
        sortByCreatedAt([normalized, ...currentNotes]),
      );
      setActiveSectionId(sectionId);
      setActiveNoteId(normalized.id);
      setEditorHtml(normalized.body);
      setLastSavedBody(normalized.body);
      setSaveState("idle");
    } catch (error) {
      console.error(error);
      setSaveState("error");
    }
  };

  const handleDeleteNote = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("确定要删除这条笔记吗？")) return;
    try {
      await noteApiRef.current.delete(id);
      setNotes((current) => current.filter((n) => n.id !== id));
      if (activeNoteId === id) {
        setActiveNoteId(notes.filter((n) => n.id !== id)[0]?.id ?? null);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleAddSection = async () => {
    try {
      const created = await sectionApiRef.current.create({ label: "新分类" });
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
      const updated = await sectionApiRef.current.update({ id, label });
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
    if (!window.confirm("删除分类后，该分类下的笔记将移至「全部笔记」，确定删除？")) return;
    try {
      await sectionApiRef.current.delete(id);
      setCustomSections((prev) => prev.filter((s) => s.id !== id));
      setNotes((prev) =>
        prev.map((n) => (n.sectionId === id ? { ...n, sectionId: "all" } : n)),
      );
      if (activeSectionId === id) setActiveSectionId("all");
    } catch (error) {
      console.error(error);
    }
  };

  const handleToggleImportant = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const note = notes.find((n) => n.id === id);
    if (!note) return;
    const nextSectionId = note.sectionId === "important" ? "all" : "important";
    try {
      const updated = await noteApiRef.current.update({
        id,
        sectionId: nextSectionId,
      });
      setNotes((current) =>
        sortByCreatedAt(
          current.map((n) =>
            n.id === id ? { ...n, ...updated, sectionId: nextSectionId } : n,
          ),
        ),
      );
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative h-screen w-screen overflow-hidden rounded-[32px] bg-white/[0.98] p-[6px] text-slate-900"
    >
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
                onClick={() => setActiveSectionId(section.id)}
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
                  onClick={() => setActiveSectionId(section.id)}
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
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold transition-colors ${
                        isActive
                          ? "bg-white/30 text-white"
                          : "bg-slate-100 text-slate-500 group-hover:text-slate-700"
                      }`}
                    >
                      {sectionCounts[section.id] ?? 0}
                    </span>
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

      <main
        className="window-no-drag absolute inset-y-0 right-0 z-10 overflow-hidden rounded-r-[32px] "
        style={{ left: `${contentOffset}px` }}
      >
        <div className="window-drag-region flex h-[64px] items-center justify-between pr-4">
          <div>
            <p className="text-slate-500">笔记列表</p>
          </div>
          <div className="window-no-drag flex items-center gap-2">
            {activeNoteId ? (
              <button
                type="button"
                onClick={(e) => handleToggleImportant(activeNoteId, e)}
                className={`rounded-xl px-3 py-1.5 text-sm font-medium transition-colors ${
                  filteredNotes.find((note) => note.id === activeNoteId)
                    ?.sectionId === "important"
                    ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
                title={
                  filteredNotes.find((note) => note.id === activeNoteId)
                    ?.sectionId === "important"
                    ? "取消重要"
                    : "标记为重要"
                }
              >
                {filteredNotes.find((note) => note.id === activeNoteId)
                  ?.sectionId === "important"
                  ? "取消重要"
                  : "标记为重要"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleCreateNote}
              className="rounded-xl bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200"
            >
              新建笔记
            </button>
          </div>
        </div>

        <div className="grid h-[calc(100%-70px)] grid-cols-[300px_1fr] pr-[6px]">
          <section className="flex min-h-0 flex-col rounded-xl bg-slate-50/90 p-4">
            <div className="mb-3 rounded-xl bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                快速搜索
              </p>
              <input
                type="text"
                placeholder="输入关键字筛选笔记"
                className="mt-2 w-full rounded-lg bg-slate-50 px-2.5 py-2 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:ring-2 focus:ring-macBlue/35"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
              />
            </div>
            <div className="notes-list-scroll min-h-0 flex-1 space-y-2 overflow-y-auto">
              {filteredNotes.map((note) => {
                const isSelected = note.id === activeNoteId;

                return (
                  <div
                    key={note.id}
                    className="relative group"
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setActiveNoteId(note.id);
                      }}
                      className={`flex w-full cursor-pointer flex-col rounded-xl border px-3 py-2 text-left transition-all duration-200 ${
                        isSelected
                          ? "border-macBlue/30 bg-macBlue/12"
                          : "border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
                          {note.title}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteNote(note.id, e)}
                          className="flex-shrink-0 rounded-lg p-1.5 text-slate-400 opacity-0 transition-opacity hover:bg-slate-200/80 hover:text-slate-600 group-hover:opacity-100"
                          title="删除笔记"
                          aria-label="删除笔记"
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleToggleImportant(note.id, e)}
                          className={`flex-shrink-0 rounded-lg p-1.5 transition-colors group-hover:opacity-100 ${
                            note.sectionId === "important"
                              ? "text-amber-500 opacity-100"
                              : "text-slate-400 opacity-0 hover:bg-slate-200/80 hover:text-amber-500"
                          }`}
                          title={
                            note.sectionId === "important"
                              ? "取消重要"
                              : "标记为重要"
                          }
                          aria-label={
                            note.sectionId === "important"
                              ? "取消重要"
                              : "标记为重要"
                          }
                        >
                          {note.sectionId === "important" ? (
                            <svg
                              className="h-4 w-4"
                              fill="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                            </svg>
                          ) : (
                            <svg
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                              />
                            </svg>
                          )}
                        </button>
                      </div>
                      <span className="mt-1 text-xs text-slate-500">
                        {note.preview}
                      </span>
                      <span className="mt-2 text-[11px] font-medium text-slate-400">
                        {formatUpdatedAt(note.updatedAt)}
                      </span>
                    </div>
                  </div>
                );
              })}
              {!isLoading && filteredNotes.length === 0 ? (
                <div className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500">
                  当前分组暂无笔记。
                </div>
              ) : null}
            </div>
          </section>

          <section className="flex min-h-0 flex-col">
            <div className="min-h-0 flex-1">
              <TiptapEditor
                className="h-full"
                value={editorHtml}
                onChange={setEditorHtml}
                disabled={!activeNoteId || isLoading}
                placeholder={
                  isLoading ? "正在读取笔记..." : "输入 # + 空格 可快速创建标题"
                }
                contentKey={activeNoteId ?? ""}
              />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

export default App;
