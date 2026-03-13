import type { RefObject } from "react";
import type { HeadingItem } from "../utils/html";

const TOC_WIDTH = 180;

type TableOfContentsProps = {
  headings: HeadingItem[];
  editorContainerRef: RefObject<HTMLElement | null>;
  className?: string;
};

function scrollToHeading(editorContainerRef: RefObject<HTMLElement | null>, index: number) {
  const container = editorContainerRef.current;
  if (!container) return;
  const prose = container.querySelector(".ProseMirror");
  const heads = prose?.querySelectorAll("h1, h2, h3");
  const el = heads?.[index] as HTMLElement | undefined;
  el?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function TableOfContents({
  headings,
  editorContainerRef,
  className = "",
}: TableOfContentsProps) {
  if (headings.length === 0) {
    return (
      <aside
        className={`flex shrink-0 flex-col overflow-hidden rounded-2xl bg-slate-50/80 py-4 ${className}`.trim()}
        style={{ width: TOC_WIDTH }}
      >
        <h2 className="px-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
          目录
        </h2>
        <p className="mt-3 px-4 text-xs text-slate-400">暂无标题，使用 # 空格创建标题</p>
      </aside>
    );
  }

  return (
    <aside
      className={`flex shrink-0 flex-col overflow-hidden rounded-2xl bg-slate-50/80 py-4 ${className}`.trim()}
      style={{ width: TOC_WIDTH }}
    >
      <h2 className="px-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
        目录
      </h2>
      <nav className="mt-3 flex-1 space-y-0.5 overflow-y-auto px-2">
        {headings.map((h, i) => (
          <button
            key={`${h.level}-${i}-${h.text.slice(0, 20)}`}
            type="button"
            onClick={() => scrollToHeading(editorContainerRef, i)}
            className={`block w-full rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-slate-200/80 hover:text-slate-900 ${
              h.level === 1
                ? "font-semibold text-slate-800"
                : h.level === 2
                  ? "pl-3 font-medium text-slate-700"
                  : "pl-5 text-slate-600"
            }`}
          >
            <span className="line-clamp-2">{h.text}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
