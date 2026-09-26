import { Fragment, type ReactNode } from "react";
import { parseBlocks, parseInline, type Align, type Block, type Inline } from "./markdown";

function renderInline(nodes: Inline[]): ReactNode {
  return nodes.map((node, index) => {
    switch (node.type) {
      case "text":
        return <Fragment key={index}>{node.text}</Fragment>;
      case "bold":
        return (
          <strong key={index} className="font-semibold">
            {renderInline(node.children)}
          </strong>
        );
      case "italic":
        return <em key={index}>{renderInline(node.children)}</em>;
      case "code":
        return (
          <code key={index} className="rounded bg-slate-200/70 px-1 py-0.5 font-mono text-[0.85em]">
            {node.text}
          </code>
        );
    }
  });
}

const alignClass: Record<NonNullable<Align>, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

const headingClass: Record<1 | 2 | 3 | 4, string> = {
  1: "text-base font-semibold text-brand-navy",
  2: "text-[0.9375rem] font-semibold text-brand-navy",
  3: "text-sm font-semibold text-brand-navy",
  4: "text-sm font-semibold",
};

function renderBlock(block: Block, index: number): ReactNode {
  switch (block.type) {
    case "paragraph":
      return (
        <p key={index} className="whitespace-pre-line">
          {renderInline(parseInline(block.text))}
        </p>
      );

    case "heading":
      return (
        <p key={index} className={headingClass[block.level]}>
          {renderInline(parseInline(block.text))}
        </p>
      );

    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag key={index} className={`space-y-1 pl-5 ${block.ordered ? "list-decimal" : "list-disc"}`}>
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex} className="pl-0.5">
              {renderInline(parseInline(item))}
            </li>
          ))}
        </Tag>
      );
    }

    case "table":
      return (
        <div key={index} className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full border-collapse text-xs">
            <thead className="bg-slate-50 text-brand-navy">
              <tr>
                {block.header.map((cell, column) => (
                  <th
                    key={column}
                    scope="col"
                    className={`whitespace-nowrap px-2.5 py-1.5 font-semibold ${alignClass[block.align[column] ?? "left"]}`}
                  >
                    {renderInline(parseInline(cell))}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-t border-slate-100">
                  {row.map((cell, column) => (
                    <td
                      key={column}
                      className={`px-2.5 py-1.5 align-top tabular-nums ${alignClass[block.align[column] ?? "left"]}`}
                    >
                      {renderInline(parseInline(cell))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "code":
      return (
        <pre key={index} className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs leading-5 text-slate-100">
          <code className="font-mono">{block.text}</code>
        </pre>
      );

    case "rule":
      return <hr key={index} className="border-slate-200" />;
  }
}

/** Renders chat-style Markdown as React elements (never raw HTML). */
export function Markdown({ text }: { text: string }) {
  return <div className="flex flex-col gap-2">{parseBlocks(text).map(renderBlock)}</div>;
}
