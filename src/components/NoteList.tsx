import { useEffect, useMemo, useState } from "react";
import { stripHtmlText } from "../utils/html";

type CustomSection = {
  id: string;
  label: string;
  sortOrder: number;
  createdAt: number;
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

type NoteListProps = {
  sectionFilteredNotes: Note[];
  onFilteredNotesChange: (notes: Note[]) => void;
  activeNoteId: string | null;
  onActiveNoteChange: (id: string) => void;
  onDeleteNote: (id: string, e: React.MouseEvent) => void;
  onToggleImportant: (id: string, e: React.MouseEvent) => void;
  onMoveToSection: (noteId: string, sectionId: string) => void;
  customSections: CustomSection[];
  isLoading: boolean;
};

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

export function NoteList({
  sectionFilteredNotes,
  onFilteredNotesChange,
  activeNoteId,
  onActiveNoteChange,
  onDeleteNote,
  onToggleImportant,
  onMoveToSection,
  customSections,
  isLoading,
}: NoteListProps) {
  const [searchKeyword, setSearchKeyword] = useState("");
  const [contextMenu, setContextMenu] = useState<{
    noteId: string;
    x: number;
    y: number;
  } | null>(null);

  const filteredNotes = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    if (!keyword) return sectionFilteredNotes;
    return sectionFilteredNotes.filter((note) => {
      const titleMatch = note.title.toLowerCase().includes(keyword);
      const previewMatch = note.preview.toLowerCase().includes(keyword);
      const bodyText = stripHtmlText(note.body).toLowerCase();
      const bodyMatch = bodyText.includes(keyword);
      return titleMatch || previewMatch || bodyMatch;
    });
  }, [sectionFilteredNotes, searchKeyword]);

  useEffect(() => {
    onFilteredNotesChange(filteredNotes);
  }, [filteredNotes, onFilteredNotesChange]);

  const handleNoteContextMenu = (noteId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ noteId, x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
    };
  }, [contextMenu]);

  return (
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
              onContextMenu={(e) => handleNoteContextMenu(note.id, e)}
            >
              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  onActiveNoteChange(note.id);
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
                    onClick={(e) => onDeleteNote(note.id, e)}
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
                    onClick={(e) => onToggleImportant(note.id, e)}
                    className={`flex-shrink-0 rounded-lg p-1.5 transition-colors group-hover:opacity-100 ${
                      note.isImportant
                        ? "text-amber-500 opacity-100"
                        : "text-slate-400 opacity-0 hover:bg-slate-200/80 hover:text-amber-500"
                    }`}
                    title={note.isImportant ? "取消重要" : "标记为重要"}
                    aria-label={note.isImportant ? "取消重要" : "标记为重要"}
                  >
                    {note.isImportant ? (
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
                <div className="mt-2 flex items-center justify-between gap-1.5">
                  <span className="text-[11px] font-medium text-slate-400">
                    {formatUpdatedAt(note.updatedAt)}
                  </span>
                  {(() => {
                    const sectionLabel = customSections.find(
                      (s) => s.id === note.sectionId,
                    )?.label;
                    return sectionLabel ? (
                      <span className="inline-block max-w-[80px] truncate rounded-md bg-macBlue/10 px-1.5 py-0.5 align-middle text-[10px] font-medium leading-4 text-macBlue">
                        {sectionLabel}
                      </span>
                    ) : null;
                  })()}
                </div>
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

      {contextMenu && (
        <div
          className="fixed z-50 min-w-[160px] rounded-xl border border-slate-200 bg-white py-1 shadow-xl shadow-black/10"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            迁移到分组
          </p>
          {customSections
            .map((s) => ({ id: s.id, label: s.label }))
            .map((section) => {
              const currentNote = filteredNotes.find(
                (n) => n.id === contextMenu.noteId,
              );
              const isCurrent = currentNote?.sectionId === section.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  disabled={isCurrent}
                  onClick={() => {
                    onMoveToSection(contextMenu.noteId, section.id);
                    setContextMenu(null);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                    isCurrent
                      ? "cursor-default text-slate-300"
                      : "text-slate-700 hover:bg-macBlue/10 hover:text-macBlue"
                  }`}
                >
                  <span className="flex-1 truncate">{section.label}</span>
                  {isCurrent && (
                    <svg
                      className="h-3.5 w-3.5 shrink-0 text-macBlue"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth={2.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </button>
              );
            })}
        </div>
      )}
    </section>
  );
}
