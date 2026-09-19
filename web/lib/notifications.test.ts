import { describe, expect, it } from "vitest";
import { clearNotifications, defaultNotificationPreferences, deliverNotifications, nextDeliveryAt, restoreInbox, restoreNotificationPreferences, viewNotifications } from "./notifications";

const now = "2026-09-19T08:00:00Z";
const later = "2026-09-19T09:00:00Z";

describe("notification delivery", () => {
  it("delivers only new issues and leaves them unread until viewed", () => {
    const inbox = deliverNotifications(restoreInbox(null), ["one", "two"], defaultNotificationPreferences, now);
    expect(inbox.collapsed).toBe(true);
    expect(inbox.entries.one).toEqual({ notifiedAt: now });
    expect(deliverNotifications(inbox, ["one", "two"], defaultNotificationPreferences, later)).toBe(inbox);
    const next = deliverNotifications(inbox, ["one", "two", "three"], defaultNotificationPreferences, later);
    expect(next.entries.one.notifiedAt).toBe(now);
    expect(next.entries.three.notifiedAt).toBe(later);
  });

  it.each([['daily', '2026-09-20T08:00:00Z'], ['weekly', '2026-09-26T08:00:00Z']] as const)("batches %s issues until the interval expires", (frequency, dueAt) => {
    const preferences = { enabled: true, frequency };
    const inbox = deliverNotifications(restoreInbox(null), ["one"], preferences, now);
    expect(nextDeliveryAt(inbox, frequency)).toBe(Date.parse(dueAt));
    expect(deliverNotifications(inbox, ["one", "two"], preferences, later)).toBe(inbox);
    expect(deliverNotifications(inbox, ["one", "two"], preferences, new Date(Date.parse(dueAt) - 1).toISOString())).toBe(inbox);
    const next = deliverNotifications(inbox, ["one", "two"], preferences, dueAt);
    expect(next.entries.two).toEqual({ notifiedAt: dueAt });
    expect(next.entries.one.notifiedAt).toBe(now);
    expect(next.lastDeliveredAt).toBe(dueAt);
  });

  it("honors paused notifications and switching back to immediate delivery", () => {
    const inbox = deliverNotifications(restoreInbox(null), ["one"], defaultNotificationPreferences, now);
    expect(deliverNotifications(inbox, ["two"], { enabled: false, frequency: "immediate" }, later)).toBe(inbox);
    expect(deliverNotifications(inbox, ["two"], { enabled: true, frequency: "daily" }, later)).toBe(inbox);
    expect(deliverNotifications(inbox, ["two"], defaultNotificationPreferences, later).entries.two.notifiedAt).toBe(later);
  });

  it("does not deliver issues that resolved before a scheduled batch", () => {
    const preferences = { enabled: true, frequency: "daily" as const };
    const inbox = deliverNotifications(restoreInbox(null), ["one"], preferences, now);
    expect(deliverNotifications(inbox, ["one", "resolved"], preferences, later)).toBe(inbox);
    expect(deliverNotifications(inbox, ["one"], preferences, "2026-09-20T08:00:00Z")).toBe(inbox);
  });
});

describe("viewing and clearing", () => {
  it("clears only viewed items, preserving unseen pages and first-viewed dates", () => {
    const original = deliverNotifications(restoreInbox(null), ["one", "two", "three", "four"], defaultNotificationPreferences, now);
    const viewed = viewNotifications(original, ["one", "two"], later);
    expect(viewNotifications(viewed, ["one"], "2026-09-19T10:00:00Z")).toBe(viewed);
    const cleared = clearNotifications(viewed, ["one", "two", "three", "four"], later);
    expect(cleared.entries.one.clearedAt).toBe(later);
    expect(cleared.entries.two.clearedAt).toBe(later);
    expect(cleared.entries.three).toEqual({ notifiedAt: now });
    expect(cleared.entries.four).toEqual({ notifiedAt: now });
    expect(original.entries.one.viewedAt).toBeUndefined();
  });

  it("keeps cleared issues cleared after reloads and later delivery intervals", () => {
    const initial = deliverNotifications(restoreInbox(null), ["period-one:profit"], defaultNotificationPreferences, now);
    const cleared = clearNotifications(viewNotifications(initial, ["period-one:profit"], later), ["period-one:profit"], later);
    const reloaded = restoreInbox(JSON.stringify(cleared));
    expect(deliverNotifications(reloaded, ["period-one:profit"], defaultNotificationPreferences, "2026-10-19T08:00:00Z")).toBe(reloaded);
    const nextMonth = deliverNotifications(reloaded, ["period-two:profit"], defaultNotificationPreferences, "2026-10-19T08:00:00Z");
    expect(nextMonth.entries['period-two:profit'].clearedAt).toBeUndefined();
    expect(nextMonth.entries['period-one:profit'].clearedAt).toBe(later);
  });

  it("restores prior timestamps without treating every previously available item as viewed", () => {
    const inbox = restoreInbox(null, JSON.stringify({ legacy: now }));
    expect(inbox.entries.legacy).toEqual({ notifiedAt: now });
    expect(clearNotifications(inbox, ['legacy'], later)).toBe(inbox);
  });

  it("handles invalid storage and never mixes another account's entries into an empty inbox", () => {
    expect(restoreInbox('invalid')).toEqual(restoreInbox(null));
    expect(restoreInbox(JSON.stringify({ collapsed: 'false', entries: { invalid: { notifiedAt: 'bad' }, valid: { notifiedAt: now, viewedAt: 'bad' } } }))).toMatchObject({ collapsed: true, entries: { valid: { notifiedAt: now } } });
    expect(restoreInbox(null).entries).toEqual({});
    expect(restoreNotificationPreferences(JSON.stringify({ enabled: 'false', frequency: 'hourly' }))).toEqual(defaultNotificationPreferences);
    expect(restoreNotificationPreferences('null')).toEqual(defaultNotificationPreferences);
  });
});
