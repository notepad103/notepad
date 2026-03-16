import { useEffect, useMemo, useRef, useState } from "react";
import { NoteList } from "./components/NoteList";
import { Sidebar, type CustomSection } from "./components/Sidebar";
import { TiptapEditor } from "./components/TiptapEditor";
import { normalizeBodyHtml, parseHeadings, stripHtmlText } from "./utils/html";
import { TableOfContents } from "./components/TableOfContents";

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
  isImportant: boolean;
  createdAt: number;
  updatedAt: number;
};

type SaveState = "idle" | "saving" | "saved" | "error";

type NoteApi = {
  list: () => Promise<Note[]>;
  create: (payload?: { sectionId?: string; isImportant?: boolean }) => Promise<Note>;
  update: (payload: {
    id: string;
    body?: string;
    sectionId?: string;
    isImportant?: boolean;
    title?: string;
  }) => Promise<Note>;
  delete: (id: string) => Promise<void>;
  storagePath: () => Promise<string>;
};

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
      const isImportant =
        typeof payload?.isImportant === "boolean"
          ? payload.isImportant
          : sectionId === "important";
      const body = "<p><br></p>";
      const now = Date.now();
      const note: Note = {
        id: `note-${now}-${Math.random().toString(36).slice(2, 8)}`,
        title: "新建笔记",
        preview: derivePreview(body),
        body,
        sectionId,
        isImportant,
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
      const nextIsImportant =
        typeof payload.isImportant === "boolean"
          ? payload.isImportant
          : current.isImportant;
      const updated: Note = {
        ...current,
        title: payload.title?.trim()
          ? payload.title.trim()
          : deriveTitle(nextBody, current.title),
        body: nextBody,
        preview: derivePreview(nextBody),
        sectionId: nextSectionId,
        isImportant: nextIsImportant,
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

const TOC_WIDTH = 180;

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorSectionRef = useRef<HTMLElement>(null);
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
  const [customSections, setCustomSections] = useState<CustomSection[]>([]);
  const [filteredNotes, setFilteredNotes] = useState<Note[]>([]);
  useEffect(() => {
    let isDisposed = false;

    const loadNotes = async () => {
      try {
        const [initialNotes, path] = await Promise.all([
          noteApiRef.current.list(),
          noteApiRef.current.storagePath(),
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

  const tocHeadings = useMemo(() => parseHeadings(editorHtml), [editorHtml]);

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
      if (note.isImportant) counts.important += 1;
      if (note.sectionId in counts && note.sectionId !== "all" && note.sectionId !== "today" && note.sectionId !== "important") {
        counts[note.sectionId] += 1;
      }
    }

    return counts;
  }, [notes, customSections]);

  const sectionFilteredNotes = useMemo(() => {
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
    } else if (activeSectionId === "important") {
      list = list.filter((note) => note.isImportant);
    } else if (activeSectionId !== "all") {
      list = list.filter((note) => note.sectionId === activeSectionId);
    }
    return list;
  }, [activeSectionId, notes]);

  useEffect(() => {
    setFilteredNotes(sectionFilteredNotes);
  }, [sectionFilteredNotes]);

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
      const isImportant = activeSectionId === "important";
      const created = await noteApiRef.current.create({ sectionId, isImportant });
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

  const handleSectionDeleted = (id: string) => {
    setNotes((prev) =>
      prev.map((n) => (n.sectionId === id ? { ...n, sectionId: "all" } : n)),
    );
    setActiveSectionId((current) => (current === id ? "all" : current));
  };

  const handleMoveToSection = async (noteId: string, targetSectionId: string) => {
    try {
      const updated = await noteApiRef.current.update({
        id: noteId,
        sectionId: targetSectionId,
      });
      setNotes((current) =>
        sortByCreatedAt(
          current.map((n) =>
            n.id === noteId ? { ...n, ...updated, sectionId: targetSectionId } : n,
          ),
        ),
      );
    } catch (error) {
      console.error(error);
    }
  };

  const handleToggleImportant = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const note = notes.find((n) => n.id === id);
    if (!note) return;
    const nextImportant = !note.isImportant;
    try {
      const updated = await noteApiRef.current.update({
        id,
        isImportant: nextImportant,
      });
      setNotes((current) =>
        sortByCreatedAt(
          current.map((n) =>
            n.id === id ? { ...n, ...updated, isImportant: nextImportant } : n,
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
      <Sidebar
        activeSectionId={activeSectionId}
        onActiveSectionChange={setActiveSectionId}
        sectionCounts={sectionCounts}
        sectionApi={sectionApiRef.current}
        onCustomSectionsChange={setCustomSections}
        onSectionDeleted={handleSectionDeleted}
        saveHint={saveHint}
        storagePath={storagePath}
      />

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
                    ?.isImportant
                    ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
                title={
                  filteredNotes.find((note) => note.id === activeNoteId)
                    ?.isImportant
                    ? "取消重要"
                    : "标记为重要"
                }
              >
                {filteredNotes.find((note) => note.id === activeNoteId)
                  ?.isImportant
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

        <div
          className="grid h-[calc(100%-70px)] pr-[6px]"
          style={{ gridTemplateColumns: `300px 1fr ${TOC_WIDTH}px` }}
        >
          <NoteList
            sectionFilteredNotes={sectionFilteredNotes}
            onFilteredNotesChange={setFilteredNotes}
            activeNoteId={activeNoteId}
            onActiveNoteChange={setActiveNoteId}
            onDeleteNote={handleDeleteNote}
            onToggleImportant={handleToggleImportant}
            onMoveToSection={handleMoveToSection}
            customSections={customSections}
            isLoading={isLoading}
          />

          <section
            ref={editorSectionRef}
            className="flex min-h-0 flex-col"
          >
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

          <TableOfContents
            headings={tocHeadings}
            editorContainerRef={editorSectionRef}
            className="self-stretch"
          />
        </div>
      </main>
    </div>
  );
}

export default App;
