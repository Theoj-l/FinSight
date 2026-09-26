import { describe, expect, it } from "vitest";

import { parseBlocks, parseInline } from "./markdown";

const text = (value: string) => ({ type: "text", text: value });

describe("parseInline", () => {
  it("parses bold, italic and inline code", () => {
    expect(parseInline("Total **$1,200** is *up* `x`")).toEqual([
      text("Total "),
      { type: "bold", children: [text("$1,200")] },
      text(" is "),
      { type: "italic", children: [text("up")] },
      text(" "),
      { type: "code", text: "x" },
    ]);
  });

  it("nests italic inside bold", () => {
    expect(parseInline("**bold *it* more**")).toEqual([
      { type: "bold", children: [text("bold "), { type: "italic", children: [text("it")] }, text(" more")] },
    ]);
  });

  it("treats an unclosed ** as bold-so-far while streaming", () => {
    expect(parseInline("Revenue is **$1,2")).toEqual([text("Revenue is "), { type: "bold", children: [text("$1,2")] }]);
    // a dangling opener renders nothing rather than flashing raw asterisks
    expect(parseInline("Done **")).toEqual([text("Done "), { type: "bold", children: [] }]);
  });

  it("leaves math-style asterisks and snake_case identifiers alone", () => {
    expect(parseInline("5 * 3 * 2")).toEqual([text("5 * 3 * 2")]);
    expect(parseInline("doc_no and net_profit")).toEqual([text("doc_no and net_profit")]);
  });

  it("keeps an empty ** pair literal", () => {
    expect(parseInline("a **** b")).toEqual([text("a **** b")]);
  });

  it("leaves an unclosed backtick literal", () => {
    expect(parseInline("run `select")).toEqual([text("run `select")]);
  });
});

describe("parseBlocks", () => {
  it("parses a paragraph, list and heading", () => {
    expect(parseBlocks("### Summary\nRevenue rose.\n\n- one\n- two")).toEqual([
      { type: "heading", level: 3, text: "Summary" },
      { type: "paragraph", text: "Revenue rose." },
      { type: "list", ordered: false, items: ["one", "two"] },
    ]);
  });

  it("clamps deep headings to level 4", () => {
    expect(parseBlocks("###### tiny")).toEqual([{ type: "heading", level: 4, text: "tiny" }]);
  });

  it("accepts -, *, • bullets and numbered lists", () => {
    expect(parseBlocks("* a\n* b")).toEqual([{ type: "list", ordered: false, items: ["a", "b"] }]);
    expect(parseBlocks("• a\n• b")).toEqual([{ type: "list", ordered: false, items: ["a", "b"] }]);
    expect(parseBlocks("1. first\n2) second")).toEqual([{ type: "list", ordered: true, items: ["first", "second"] }]);
  });

  it("merges list items separated by a single blank line", () => {
    expect(parseBlocks("- a\n\n- b")).toEqual([{ type: "list", ordered: false, items: ["a", "b"] }]);
  });

  it("ends a paragraph where a list starts and keeps soft line breaks", () => {
    expect(parseBlocks("Intro:\n- a\n- b")).toEqual([
      { type: "paragraph", text: "Intro:" },
      { type: "list", ordered: false, items: ["a", "b"] },
    ]);
    expect(parseBlocks("Line one\nLine two")).toEqual([{ type: "paragraph", text: "Line one\nLine two" }]);
  });

  it("parses a GFM table with alignment", () => {
    const table = "| Customer | Sales |\n|:--|--:|\n| ACME | 1,200 |\n| Beta | 900 |";
    expect(parseBlocks(table)).toEqual([
      {
        type: "table",
        header: ["Customer", "Sales"],
        align: ["left", "right"],
        rows: [
          ["ACME", "1,200"],
          ["Beta", "900"],
        ],
      },
    ]);
  });

  it("pads short table rows and drops extra cells", () => {
    const [table] = parseBlocks("| a | b |\n|---|---|\n| 1 |\n| 1 | 2 | 3 |");
    expect(table).toMatchObject({
      type: "table",
      rows: [
        ["1", ""],
        ["1", "2"],
      ],
    });
  });

  it("does not treat a pipe row as a table until the separator has arrived", () => {
    expect(parseBlocks("| a | b |")).toEqual([{ type: "paragraph", text: "| a | b |" }]);
  });

  it("unescapes \\| inside table cells", () => {
    const [table] = parseBlocks("| a |\n|---|\n| x \\| y |");
    expect(table).toMatchObject({ rows: [["x | y"]] });
  });

  it("parses code fences, including one that is still open", () => {
    expect(parseBlocks("```\nselect 1;\n```\nafter")).toEqual([
      { type: "code", text: "select 1;" },
      { type: "paragraph", text: "after" },
    ]);
    expect(parseBlocks("```sql\nselect 1")).toEqual([{ type: "code", text: "select 1" }]);
  });

  it("parses horizontal rules", () => {
    expect(parseBlocks("a | b\n---")).toEqual([{ type: "paragraph", text: "a | b" }, { type: "rule" }]);
  });

  it("returns nothing for empty input", () => {
    expect(parseBlocks("")).toEqual([]);
    expect(parseBlocks("\n\n  \n")).toEqual([]);
  });
});
