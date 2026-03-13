export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function applyInlineMarkdown(value: string) {
  let content = escapeHtml(value);
  content = content.replace(/`([^`]+)`/g, "<code>$1</code>");
  content = content.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  content = content.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return content;
}

export function stripHtmlText(value: string) {
  return String(value ?? "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h1|h2|h3|li|blockquote)>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"');
}

function markdownTextToHtml(value: string) {
  const lines = value.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length === 0) {
      return;
    }
    blocks.push(`<ul>${listItems.join("")}</ul>`);
    listItems = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      blocks.push("<p><br></p>");
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushList();
      const level = heading[1].length;
      blocks.push(`<h${level}>${applyInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const quote = trimmed.match(/^>\s+(.+)$/);
    if (quote) {
      flushList();
      blocks.push(`<blockquote>${applyInlineMarkdown(quote[1])}</blockquote>`);
      continue;
    }

    const list = trimmed.match(/^-\s+(.+)$/);
    if (list) {
      listItems.push(`<li>${applyInlineMarkdown(list[1])}</li>`);
      continue;
    }

    flushList();
    blocks.push(`<p>${applyInlineMarkdown(trimmed)}</p>`);
  }

  flushList();

  if (blocks.length === 0) {
    return "<p><br></p>";
  }

  return blocks.join("");
}

export type HeadingItem = { level: 1 | 2 | 3; text: string };

/** 从 HTML 中解析 h1/h2/h3 作为目录项（保持顺序） */
export function parseHeadings(html: string): HeadingItem[] {
  if (!html?.trim()) return [];
  const div = document.createElement("div");
  div.innerHTML = html;
  const headings: HeadingItem[] = [];
  const nodes = div.querySelectorAll("h1, h2, h3");
  nodes.forEach((el) => {
    const level = parseInt(el.tagName.slice(1), 10) as 1 | 2 | 3;
    const text = (el.textContent ?? "").trim();
    if (text) headings.push({ level, text });
  });
  return headings;
}

export function normalizeBodyHtml(value: string) {
  const content = String(value ?? "").trim();

  if (!content) {
    return "<p><br></p>";
  }

  if (
    /<\s*\/?(p|h1|h2|h3|ul|ol|li|blockquote|strong|em|code|br|hr)\b/i.test(content)
  ) {
    return content
      .replace(/<div><br><\/div>/gi, "<p><br></p>")
      .replace(/<div>/gi, "<p>")
      .replace(/<\/div>/gi, "</p>");
  }

  return markdownTextToHtml(content);
}
