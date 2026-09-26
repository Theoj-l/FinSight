// ---------------------------------------------------------------------------
// markdown.ts — a small, dependency-free Markdown parser for chat answers.
//
// The backend's response prompt asks Gemini for "Markdown tables or bullet
// lists" and bold figures, so replies need rendering — but a full Markdown
// library isn't worth a new dependency for that subset. Supported:
//
//   blocks  : paragraphs, # headings, - / * / • bullet lists, 1. numbered
//             lists, GFM tables (with :---: alignment), ``` code fences, ---
//   inline  : **bold**, *italic*, `code`
//
// Everything else renders as plain text. The output is a typed tree (never
// HTML), so untrusted model output can't inject markup.
//
// Input arrives half-written while streaming, so every rule is tolerant: an
// unclosed `**` is bold-so-far, an unclosed ``` fence is code-so-far, and a
// table row with no separator yet is just a paragraph line.
// ---------------------------------------------------------------------------

export type Inline =
  | { type: "text"; text: string }
  | { type: "bold"; children: Inline[] }
  | { type: "italic"; children: Inline[] }
  | { type: "code"; text: string };

export type Align = "left" | "right" | "center" | null;

export type Block =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: 1 | 2 | 3 | 4; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; header: string[]; align: Align[]; rows: string[][] }
  | { type: "code"; text: string }
  | { type: "rule" };

// ── Inline ──────────────────────────────────────────────────────────────────

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let buffer = "";
  let i = 0;

  const flush = () => {
    if (buffer) out.push({ type: "text", text: buffer });
    buffer = "";
  };

  while (i < text.length) {
    if (text.startsWith("**", i)) {
      const end = text.indexOf("**", i + 2);
      if (end === i + 2) {
        buffer += "****"; // an empty pair — keep it literal
        i += 4;
        continue;
      }
      flush();
      if (end === -1) {
        // Unclosed: mid-stream, so treat the rest as bold instead of flashing "**".
        out.push({ type: "bold", children: parseInline(text.slice(i + 2)) });
        break;
      }
      out.push({ type: "bold", children: parseInline(text.slice(i + 2, end)) });
      i = end + 2;
      continue;
    }

    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > i + 1) {
        flush();
        out.push({ type: "code", text: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    // *italic* — the opening `*` must hug a word, so "a * b" and "5 * 3" stay literal.
    // Underscore italics are deliberately unsupported: snake_case field names are common here.
    if (text[i] === "*" && text[i + 1] && !/[\s*]/.test(text[i + 1])) {
      let end = text.indexOf("*", i + 1);
      while (end !== -1 && (/\s/.test(text[end - 1]) || text[end + 1] === "*")) {
        end = text.indexOf("*", end + 1);
      }
      if (end !== -1) {
        flush();
        out.push({ type: "italic", children: parseInline(text.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }

    buffer += text[i];
    i++;
  }

  flush();
  return out;
}

// ── Blocks ──────────────────────────────────────────────────────────────────

const FENCE = /^\s*```/;
const FENCE_CLOSE = /^\s*```\s*$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const BULLET = /^\s*[-*•+]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;

function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split(/(?<!\\)\|/).map((cell) => cell.replace(/\\\|/g, "|").trim());
}

function isTableStart(lines: string[], index: number): boolean {
  const separator = lines[index + 1];
  return (
    lines[index].includes("|") &&
    separator !== undefined &&
    separator.includes("|") &&
    TABLE_SEPARATOR.test(separator)
  );
}

function alignmentOf(cell: string): Align {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return null;
}

function startsBlock(lines: string[], index: number): boolean {
  const line = lines[index];
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    RULE.test(line) ||
    BULLET.test(line) ||
    ORDERED.test(line) ||
    isTableStart(lines, index)
  );
}

export function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    if (FENCE.test(line)) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !FENCE_CLOSE.test(lines[i])) code.push(lines[i++]);
      i++; // closing fence (or end of input while still streaming)
      blocks.push({ type: "code", text: code.join("\n") });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ type: "heading", level: Math.min(heading[1].length, 4) as 1 | 2 | 3 | 4, text: heading[2] });
      i++;
      continue;
    }

    if (RULE.test(line)) {
      blocks.push({ type: "rule" });
      i++;
      continue;
    }

    if (isTableStart(lines, i)) {
      const header = splitRow(line);
      const align = splitRow(lines[i + 1]).map(alignmentOf);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) {
        const cells = splitRow(lines[i]);
        // Keep every row exactly as wide as the header.
        rows.push(header.map((_, column) => cells[column] ?? ""));
        i++;
      }
      blocks.push({ type: "table", header, align: header.map((_, column) => align[column] ?? null), rows });
      continue;
    }

    const isBullet = BULLET.test(line);
    if (isBullet || ORDERED.test(line)) {
      const marker = isBullet ? BULLET : ORDERED;
      const items: string[] = [];
      while (i < lines.length) {
        const match = marker.exec(lines[i]);
        if (match) {
          items.push(match[1]);
          i++;
          continue;
        }
        // Tolerate a single blank line between items of the same list.
        if (!lines[i].trim() && i + 1 < lines.length && marker.test(lines[i + 1])) {
          i++;
          continue;
        }
        break;
      }
      blocks.push({ type: "list", ordered: !isBullet, items });
      continue;
    }

    const paragraph: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !startsBlock(lines, i)) paragraph.push(lines[i++]);
    blocks.push({ type: "paragraph", text: paragraph.join("\n") });
  }

  return blocks;
}
