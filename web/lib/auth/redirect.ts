/** Only allow local paths after authentication. */
export function authDestination(next: unknown): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !/[\\\x00-\x20]/.test(next)
    ? next
    : "/home";
}
