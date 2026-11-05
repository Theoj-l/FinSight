// ---------------------------------------------------------------------------
// chat-method.ts — the two ways the assistant can answer, and which one a chat uses.
//
// Both ask the same Gemini model; they differ in how the data is found:
//   sql      Direct SQL: Gemini writes a read-only query, can point at charts and tables.
//   classic  Fixed functions: Gemini picks a built-in lookup, text answers only.
//
// The choice belongs to one conversation: it can be changed only before the first
// question, or after "New chat", so one conversation never mixes the two. Pure: no React.
// ---------------------------------------------------------------------------

export type ChatMethod = "sql" | "classic";

export interface ChatMethodInfo {
  id: ChatMethod;
  label: string;
  endpoint: string;
  /** One line shown as a tooltip. */
  hint: string;
}

export const CHAT_METHODS: readonly ChatMethodInfo[] = [
  {
    id: "sql",
    label: "Direct SQL",
    endpoint: "/api/chat-sql",
    hint: "Gemini writes a read-only database query. Can open the right page and point at charts and tables.",
  },
  {
    id: "classic",
    label: "Fixed functions",
    endpoint: "/api/chat",
    hint: "Gemini picks one of the built-in lookups. Text answers only, no charts pointed at.",
  },
];

/** Where a method sends its questions. */
export function endpointFor(method: ChatMethod): string {
  return (CHAT_METHODS.find((item) => item.id === method) ?? CHAT_METHODS[0]).endpoint;
}

/** The method a new chat starts with: the one the app is configured for (NEXT_PUBLIC_CHAT_ENDPOINT). */
export function defaultChatMethod(configuredEndpoint: string): ChatMethod {
  return CHAT_METHODS.find((item) => item.endpoint === configuredEndpoint)?.id ?? "classic";
}

/** The method can be changed only while the conversation is empty. */
export const canChangeMethod = (messageCount: number) => messageCount === 0;
