import { describe, expect, it } from "vitest";

import { parseBlocks } from "./markdown";
import { MOCK_ERROR_COMMAND, mockReplyFor } from "./mock-replies";

const reply = (message: string) => mockReplyFor(message) ?? "";

describe("mockReplyFor — routing", () => {
  it("answers each suggested question with its own topic", () => {
    expect(reply("Which customer has the highest sales?")).toContain("has the highest sales");
    expect(reply("What are our outstanding receivables?")).toContain("Outstanding receivables total");
    expect(reply("How did net profit change versus last month?")).toContain("Net profit was");
  });

  it("prefers receivables over sales when both are mentioned", () => {
    expect(reply("outstanding receivables by customer")).toContain("Outstanding receivables total");
  });

  it("explains what it can do when greeted", () => {
    expect(reply("hello")).toContain("I can help with three areas");
    expect(reply("What can you do?")).toContain("I can help with three areas");
  });

  it("declines unrelated questions the way the real backend does", () => {
    expect(reply("What's the weather in Singapore?")).toContain(
      "I can only answer questions related to Profit & Loss, Sales, and Accounts Receivable.",
    );
  });

  it("returns null for the error command, ignoring case and spacing", () => {
    expect(mockReplyFor(MOCK_ERROR_COMMAND)).toBeNull();
    expect(mockReplyFor("  /ERROR ")).toBeNull();
  });
});

describe("mockReplyFor — content", () => {
  const numeric = [
    "Which customer has the highest sales?",
    "What are our outstanding receivables?",
    "How did net profit change versus last month?",
  ];

  it("labels every answer that contains figures as sample data", () => {
    for (const question of numeric) expect(reply(question)).toContain("Sample data");
  });

  it("says demo mode on the non-numeric answers too", () => {
    expect(reply("hello")).toContain("Demo mode");
    expect(reply("tell me a joke")).toContain("Demo mode");
  });

  it("renders as real tables with no missing cells", () => {
    for (const question of numeric) {
      const tables = parseBlocks(reply(question)).flatMap((block) => (block.type === "table" ? [block] : []));
      expect(tables, question).toHaveLength(1);
      const [table] = tables;
      expect(table.rows.length).toBeGreaterThan(1);
      // The parser pads short rows with "", so an empty body cell means a malformed canned row.
      for (const row of table.rows) expect(row.every((cell) => cell.length > 0), `${question}: ${row}`).toBe(true);
    }
  });
});
