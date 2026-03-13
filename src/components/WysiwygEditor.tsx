import { useEffect, useRef, useState } from "react";
import { normalizeBodyHtml, stripHtmlText } from "../utils/html";

export type EditorProps = {
  value: string;
  disabled: boolean;
  placeholder: string;
  onChange: (nextHtml: string) => void;
};

const BLOCK_TAGS = new Set(["P", "H1", "H2", "H3", "LI", "BLOCKQUOTE", "DIV"]);

function normalizeEditorHtml(value: string) {
  const normalized = normalizeBodyHtml(value);
  return normalized || "<p><br></p>";
}

function isEditorEmpty(value: string) {
  return stripHtmlText(value).replace(/\s+/g, "").length === 0;
}

function findBlockElement(node: Node | null, root: HTMLElement) {
  let current: Node | null = node;

  while (current) {
    if (current === root) {
      return null;
    }

    if (current instanceof HTMLElement && BLOCK_TAGS.has(current.tagName)) {
      return current;
    }

    current = current.parentNode;
  }

  return null;
}

function getCollapsedSelection(root: HTMLElement) {
  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);

  if (!range.collapsed || !root.contains(range.startContainer)) {
    return null;
  }

  return { selection, range };
}

function getPrefixText(block: HTMLElement, range: Range) {
  const prefixRange = document.createRange();
  prefixRange.selectNodeContents(block);
  prefixRange.setEnd(range.startContainer, range.startOffset);
  return prefixRange.toString();
}

function placeCaretAtEnd(target: HTMLElement) {
  const selection = window.getSelection();

  if (!selection) {
    return;
  }

  const range = document.createRange();
  range.selectNodeContents(target);
  range.collapse(false);

  selection.removeAllRanges();
  selection.addRange(range);
}

function placeCaretAtStart(target: HTMLElement) {
  const selection = window.getSelection();

  if (!selection) {
    return;
  }

  const range = document.createRange();
  range.selectNodeContents(target);
  range.collapse(true);

  selection.removeAllRanges();
  selection.addRange(range);
}

function ensureBlockHasContent(block: HTMLElement) {
  if ((block.textContent ?? "").length === 0) {
    block.innerHTML = "<br>";
  }
}

function createBlockFromMarker(marker: string, remainingText: string) {
  const safeText = remainingText.trim();

  if (marker === "-") {
    const ul = document.createElement("ul");
    const li = document.createElement("li");
    if (safeText) {
      li.textContent = safeText;
    } else {
      li.innerHTML = "<br>";
    }
    ul.appendChild(li);
    return ul;
  }

  const element = document.createElement(
    marker === "#"
      ? "h1"
      : marker === "##"
        ? "h2"
        : marker === "###"
          ? "h3"
          : "blockquote",
  );

  if (safeText) {
    element.textContent = safeText;
  } else {
    element.innerHTML = "<br>";
  }

  return element;
}

function insertPlainTextAtCaret(text: string) {
  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0) {
    return;
  }

  const range = selection.getRangeAt(0);
  range.deleteContents();

  const textNode = document.createTextNode(text);
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.collapse(true);

  selection.removeAllRanges();
  selection.addRange(range);
}

export function WysiwygEditor({
  value,
  disabled,
  placeholder,
  onChange,
}: EditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isEmpty, setIsEmpty] = useState(isEditorEmpty(value));

  useEffect(() => {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    const normalized = normalizeEditorHtml(value);

    if (editor.innerHTML !== normalized) {
      editor.innerHTML = normalized;
    }

    setIsEmpty(isEditorEmpty(normalized));
  }, [value]);

  const emitChange = () => {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    const normalized = normalizeEditorHtml(editor.innerHTML);

    if (editor.innerHTML !== normalized) {
      editor.innerHTML = normalized;
    }

    setIsEmpty(isEditorEmpty(normalized));
    onChange(normalized);
  };

  const transformByShortcut = () => {
    const editor = editorRef.current;

    if (!editor) {
      return false;
    }

    const collapsed = getCollapsedSelection(editor);

    if (!collapsed) {
      return false;
    }

    const block = findBlockElement(collapsed.range.startContainer, editor);

    if (!block) {
      return false;
    }

    const prefix = getPrefixText(block, collapsed.range).replace(
      /\u00a0/g,
      " ",
    );
    const marker = prefix.trim();

    const isHeading = /^#{1,3}$/.test(marker);
    const isList = marker === "-";
    const isQuote = marker === ">";
    const isHr = /^(---|\*\*\*|___)$/.test(marker);

    if (!isHeading && !isList && !isQuote && !isHr) {
      return false;
    }

    const currentText = (block.textContent ?? "").replace(/\u00a0/g, " ");
    const remainingText = currentText.replace(
      /^\s*(---|\*\*\*|___|#{1,3}|>|-)\s*/,
      "",
    );

    if (isHr) {
      const hr = document.createElement("hr");
      const paragraph = document.createElement("p");
      paragraph.innerHTML = remainingText.trim() ? "" : "<br>";
      if (remainingText.trim()) {
        paragraph.textContent = remainingText.trim();
      }
      block.replaceWith(hr, paragraph);
      ensureBlockHasContent(paragraph);
      placeCaretAtStart(paragraph);
      emitChange();
      return true;
    }

    const replacement = createBlockFromMarker(marker, remainingText);

    if (block.tagName === "LI") {
      const listParent = block.parentElement;
      if (
        listParent &&
        (listParent.tagName === "UL" || listParent.tagName === "OL") &&
        listParent.children.length === 1
      ) {
        listParent.replaceWith(replacement);
      } else {
        block.replaceWith(replacement);
      }
    } else {
      block.replaceWith(replacement);
    }

    const caretTarget =
      replacement.tagName === "UL"
        ? (replacement.querySelector("li") as HTMLElement | null)
        : replacement;

    if (caretTarget) {
      ensureBlockHasContent(caretTarget);
      placeCaretAtEnd(caretTarget);
    }

    emitChange();
    return true;
  };

  const resetHeadingOnBackspace = () => {
    const editor = editorRef.current;

    if (!editor) {
      return false;
    }

    const collapsed = getCollapsedSelection(editor);

    if (!collapsed) {
      return false;
    }

    const block = findBlockElement(collapsed.range.startContainer, editor);

    if (!block || !["H1", "H2", "H3", "BLOCKQUOTE"].includes(block.tagName)) {
      return false;
    }

    if (getPrefixText(block, collapsed.range).length !== 0) {
      return false;
    }

    const paragraph = document.createElement("p");
    const text = block.textContent ?? "";

    if (text) {
      paragraph.textContent = text;
    } else {
      paragraph.innerHTML = "<br>";
    }

    block.replaceWith(paragraph);
    placeCaretAtStart(paragraph);
    emitChange();
    return true;
  };

  const handleEnterInHeading = () => {
    const editor = editorRef.current;

    if (!editor) {
      return false;
    }

    const collapsed = getCollapsedSelection(editor);

    if (!collapsed) {
      return false;
    }

    const block = findBlockElement(collapsed.range.startContainer, editor);

    if (!block || !["H1", "H2", "H3"].includes(block.tagName)) {
      return false;
    }

    const prefix = getPrefixText(block, collapsed.range);
    const fullText = (block.textContent ?? "").replace(/\u00a0/g, " ");
    const isAtEnd = prefix.replace(/\u00a0/g, " ").length >= fullText.length;

    if (isAtEnd) {
      const paragraph = document.createElement("p");
      paragraph.innerHTML = "<br>";
      block.insertAdjacentElement("afterend", paragraph);
      placeCaretAtStart(paragraph);
    } else {
      collapsed.range.deleteContents();
      const br = document.createElement("br");
      collapsed.range.insertNode(br);
      collapsed.range.setStartAfter(br);
      collapsed.range.collapse(true);
      collapsed.selection.removeAllRanges();
      collapsed.selection.addRange(collapsed.range);
    }

    emitChange();
    return true;
  };

  return (
    <div
      ref={editorRef}
      contentEditable={!disabled}
      suppressContentEditableWarning
      aria-disabled={disabled}
      data-placeholder={placeholder}
      data-empty={isEmpty ? "true" : "false"}
      className={`wysiwyg-editor rounded-[28px] h-full w-full rounded-2xl bg-white p-5 text-[15px] leading-7 text-slate-800 outline-none transition-colors focus:ring-2 focus:ring-macBlue/35 ${
        disabled ? "cursor-not-allowed opacity-60" : ""
      }`}
      onInput={emitChange}
      onKeyDown={(event) => {
        if (disabled) {
          event.preventDefault();
          return;
        }

        if (event.key === " " && transformByShortcut()) {
          event.preventDefault();
          return;
        }

        if (event.key === "Backspace" && resetHeadingOnBackspace()) {
          event.preventDefault();
          return;
        }

        if (event.key === "Enter" && handleEnterInHeading()) {
          event.preventDefault();
        }
      }}
      onPaste={(event) => {
        if (disabled) {
          event.preventDefault();
          return;
        }

        event.preventDefault();
        const text = event.clipboardData.getData("text/plain");
        insertPlainTextAtCaret(text);
        emitChange();
      }}
    />
  );
}
