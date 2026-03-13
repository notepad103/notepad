import { useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import { normalizeBodyHtml } from "../utils/html";

export type EditorProps = {
  value: string;
  disabled: boolean;
  placeholder: string;
  onChange: (nextHtml: string) => void;
  /** 切换笔记时传入不同 key，用于同步外部 value 到编辑器 */
  contentKey?: string;
  /** 外层容器样式，可用来设置高度，如 className="min-h-[400px]" 或 "h-full" */
  className?: string;
};

const emptyHtml = "<p><br></p>";

function normalizeContent(html: string) {
  const normalized = normalizeBodyHtml(html);
  return normalized || emptyHtml;
}

export function TiptapEditor({
  value,
  disabled,
  placeholder,
  onChange,
  contentKey = "",
  className = "",
}: EditorProps) {
  const lastContentKey = useRef(contentKey);
  const lastValueRef = useRef<string | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({
        placeholder,
        showOnlyWhenEditable: true,
      }),
      Image.configure({
        inline: false,
        allowBase64: true,
      }),
    ],
    content: normalizeContent(value),
    editable: !disabled,
    onUpdate: ({ editor }: { editor: { getHTML: () => string } }) => {
      const html = editor.getHTML();
      onChange(html === "<p></p>" ? emptyHtml : html);
    },
    editorProps: {
      attributes: {
        class:
          "wysiwyg-editor rounded-[28px] h-full w-full min-h-[200px] rounded-2xl bg-white p-5 text-[15px] leading-7 text-slate-800 outline-none transition-colors focus:ring-2 focus:ring-macBlue/35 prose prose-sm max-w-none",
      },
    },
  });

  // 仅当 contentKey 变化（如切换笔记）时从外部同步 value
  useEffect(() => {
    if (!editor) return;
    const normalized = normalizeContent(value);

    // contentKey 变化（切换笔记）时，强制用外部 value 覆盖
    if (lastContentKey.current !== contentKey) {
      lastContentKey.current = contentKey;
      lastValueRef.current = normalized;
      editor.commands.setContent(normalized, false);
      return;
    }

    // 即使 key 不变，如果外部 value 变了且和编辑器内容不一致，也同步一次
    if (lastValueRef.current !== normalized && editor.getHTML() !== normalized) {
      lastValueRef.current = normalized;
      editor.commands.setContent(normalized, false);
    }
  }, [editor, contentKey, value]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  // 空内容时点击编辑区时光标会落在 <br> 后（第二行），统一移到开头
  useEffect(() => {
    if (!editor) return;
    const onFocus = () => {
      if (editor.isEmpty) {
        queueMicrotask(() => editor.commands.focus("start"));
      }
    };
    editor.on("focus", onFocus);
    return () => {
      editor.off("focus", onFocus);
    };
  }, [editor]);

  if (!editor) {
    return (
      <div
        className={`wysiwyg-editor rounded-2xl bg-white p-5 text-[15px] leading-7 text-slate-800 min-h-[200px] ${
          disabled ? "cursor-not-allowed opacity-60" : ""
        }`}
      >
        <p><br /></p>
      </div>
    );
  }

  return (
    <div
      className={`${disabled ? "cursor-not-allowed opacity-60" : ""} ${className}`.trim()}
      data-placeholder={placeholder}
      style={{ height: "100%", minHeight: 0 }}
    >
      <EditorContent
        editor={editor}
        className="h-full min-h-0 w-full"
        style={{ height: "100%", minHeight: 0 }}
      />
    </div>
  );
}
