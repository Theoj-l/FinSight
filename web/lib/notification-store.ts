"use client";

import { useSyncExternalStore } from "react";
import { restoreNotificationPreferences, type NotificationPreferences } from "./notifications";

const temporary = new Map<string, string>();
const EVENT = "finsight-notifications";
export const notificationSettingsKey = (userId: string) => `finsight:notifications:v1:${userId}`;
export const notificationInboxKey = (userId: string) => `finsight:notification-inbox:v1:${userId}`;

export function subscribeNotifications(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(EVENT, callback);
  window.addEventListener("kpi-settings", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("kpi-settings", callback);
  };
}
export function readNotificationStorage(key: string) {
  if (temporary.has(key)) return temporary.get(key)!;
  try { return localStorage.getItem(key); } catch { return null; }
}
export function writeNotificationStorage(key: string, value: string) {
  try { localStorage.setItem(key, value); temporary.delete(key); }
  catch { temporary.set(key, value); }
  window.dispatchEvent(new Event(EVENT));
}
export const notificationStorageIsTemporary = (key: string) => temporary.has(key);

export function useNotificationPreferences(userId: string) {
  const key = notificationSettingsKey(userId);
  const raw = useSyncExternalStore(subscribeNotifications, () => readNotificationStorage(key), () => null);
  return {
    preferences: restoreNotificationPreferences(raw),
    save: (preferences: NotificationPreferences) => writeNotificationStorage(key, JSON.stringify(preferences)),
    sessionOnly: notificationStorageIsTemporary(key),
  };
}
