export const notificationFrequencies = ["immediate", "daily", "weekly"] as const;
export type NotificationFrequency = typeof notificationFrequencies[number];
export type NotificationPreferences = { enabled: boolean; frequency: NotificationFrequency };
export const defaultNotificationPreferences: NotificationPreferences = { enabled: true, frequency: "immediate" };
export type NotificationEntry = { notifiedAt: string; viewedAt?: string; clearedAt?: string };
export type NotificationInbox = { entries: Record<string, NotificationEntry>; lastDeliveredAt: string | null; collapsed: boolean };

const isDate = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
function object(raw: string | null): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(raw ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch { return {}; }
}

export function restoreNotificationPreferences(raw: string | null): NotificationPreferences {
  const value = object(raw);
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    frequency: notificationFrequencies.includes(value.frequency as NotificationFrequency) ? value.frequency as NotificationFrequency : "immediate",
  };
}

export function restoreInbox(raw: string | null, legacyHistory: string | null = null): NotificationInbox {
  const value = object(raw);
  const entries: NotificationInbox["entries"] = {};
  if (value.entries && typeof value.entries === "object" && !Array.isArray(value.entries)) {
    for (const [id, entry] of Object.entries(value.entries)) {
      if (!entry || typeof entry !== "object" || !isDate(entry.notifiedAt)) continue;
      entries[id] = { notifiedAt: entry.notifiedAt,
        ...(isDate(entry.viewedAt) ? { viewedAt: entry.viewedAt } : {}),
        ...(isDate(entry.clearedAt) ? { clearedAt: entry.clearedAt } : {}) };
    }
  } else if (!raw) {
    // Earlier Home versions recorded availability, not actual viewport visibility.
    for (const [id, date] of Object.entries(object(legacyHistory))) if (isDate(date)) entries[id] = { notifiedAt: date };
  }
  return { entries, lastDeliveredAt: isDate(value.lastDeliveredAt) ? value.lastDeliveredAt : null, collapsed: typeof value.collapsed === "boolean" ? value.collapsed : true };
}

export function nextDeliveryAt(inbox: NotificationInbox, frequency: NotificationFrequency): number | null {
  if (frequency === "immediate" || !inbox.lastDeliveredAt) return null;
  return Date.parse(inbox.lastDeliveredAt) + (frequency === "daily" ? 1 : 7) * 24 * 60 * 60 * 1000;
}

/** Deliver each issue once. Frequency batches new issues; it never revives cleared ones. */
export function deliverNotifications(inbox: NotificationInbox, activeIds: string[], preferences: NotificationPreferences, now: string): NotificationInbox {
  if (!preferences.enabled) return inbox;
  const next = nextDeliveryAt(inbox, preferences.frequency);
  if (next !== null && Date.parse(now) < next) return inbox;
  const newIds = activeIds.filter(id => !Object.hasOwn(inbox.entries, id));
  if (newIds.length === 0) return inbox;
  return { ...inbox, lastDeliveredAt: now, entries: { ...inbox.entries, ...Object.fromEntries(newIds.map(id => [id, { notifiedAt: now }])) } };
}

export function viewNotifications(inbox: NotificationInbox, ids: string[], now: string): NotificationInbox {
  const entries = { ...inbox.entries };
  let changed = false;
  for (const id of ids) {
    const entry = entries[id];
    if (entry && !entry.viewedAt && !entry.clearedAt) { entries[id] = { ...entry, viewedAt: now }; changed = true; }
  }
  return changed ? { ...inbox, entries } : inbox;
}

export function clearNotifications(inbox: NotificationInbox, ids: string[], now: string): NotificationInbox {
  const entries = { ...inbox.entries };
  let changed = false;
  for (const id of ids) {
    const entry = entries[id];
    // Bulk clear can never remove a notification the user has not viewed.
    if (entry?.viewedAt && !entry.clearedAt) { entries[id] = { ...entry, clearedAt: now }; changed = true; }
  }
  return changed ? { ...inbox, entries } : inbox;
}
