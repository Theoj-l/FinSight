"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { restoreThresholds, type KpiData } from "@/app/dashboard/data/kpi-presentation";
import { clearNotifications, deliverNotifications, nextDeliveryAt, restoreInbox, viewNotifications, type NotificationInbox } from "@/lib/notifications";
import { notificationInboxKey, notificationStorageIsTemporary, readNotificationStorage as read, subscribeNotifications as subscribe, useNotificationPreferences, writeNotificationStorage as write } from "@/lib/notification-store";
import { thresholdAlerts } from "./overview-data";

export function useHomeAlerts(userId: string, data?: KpiData | null) {
  const settingsKey = `finsight:kpi-thresholds:v1:${userId}`;
  const legacyKey = `finsight:home-alerts:v1:${userId}`;
  const inboxKey = notificationInboxKey(userId);
  const rawSettings = useSyncExternalStore(subscribe, () => read(settingsKey), () => null);
  const rawInbox = useSyncExternalStore(subscribe, () => read(inboxKey), () => null);
  const rawLegacy = useSyncExternalStore(subscribe, () => read(legacyKey), () => null);
  const ready = useSyncExternalStore(subscribe, () => true, () => false);
  const { preferences, sessionOnly } = useNotificationPreferences(userId);
  const { enabled, frequency } = preferences;
  const thresholds = restoreThresholds(rawSettings);
  const candidates = data && ready ? thresholdAlerts(data, thresholds) : [];
  const inbox = restoreInbox(rawInbox, rawLegacy);
  const ids = JSON.stringify(candidates.map(alert => alert.id));

  const updateInbox = useCallback((update: (current: NotificationInbox) => NotificationInbox) => {
    const current = restoreInbox(read(inboxKey), read(legacyKey));
    const updated = update(current);
    if (updated !== current) write(inboxKey, JSON.stringify(updated));
  }, [inboxKey, legacyKey]);

  useEffect(() => {
    if (!ready) return;
    const deliver = () => updateInbox(current => deliverNotifications(current, JSON.parse(ids), { enabled, frequency }, new Date().toISOString()));
    deliver();
    const timer = window.setInterval(deliver, 30_000);
    window.addEventListener("focus", deliver);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", deliver); };
  }, [ready, ids, enabled, frequency, updateInbox]);

  const markViewed = useCallback((ids: string[]) => {
    updateInbox(current => viewNotifications(current, ids, new Date().toISOString()));
  }, [updateInbox]);
  const alerts = enabled ? candidates.filter(alert => inbox.entries[alert.id] && !inbox.entries[alert.id].clearedAt) : [];
  const viewedIds = alerts.filter(alert => inbox.entries[alert.id].viewedAt).map(alert => alert.id);
  const pendingCount = enabled ? candidates.filter(alert => !inbox.entries[alert.id]).length : 0;

  return {
    alerts, thresholds, inbox, ready, preferences, markViewed,
    sessionOnly: ready && (sessionOnly || notificationStorageIsTemporary(inboxKey)),
    unreadCount: alerts.length - viewedIds.length,
    viewedCount: viewedIds.length,
    pendingCount, nextDelivery: pendingCount ? nextDeliveryAt(inbox, frequency) : null,
    clearViewed: () => updateInbox(current => clearNotifications(current, viewedIds, new Date().toISOString())),
    clearOne: (id: string) => updateInbox(current => {
      const now = new Date().toISOString();
      return clearNotifications(viewNotifications(current, [id], now), [id], now);
    }),
    toggleCollapsed: () => updateInbox(current => ({ ...current, collapsed: !current.collapsed })),
  };
}
