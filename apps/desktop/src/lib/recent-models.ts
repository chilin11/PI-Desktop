import { isSessionThinkingLevel, type SessionThinkingLevel } from "@pi-desktop/shared";
import type { SessionModelRef } from "./session-model";

/**
 * A model the user actually sent with. `thinkingLevel` is the reasoning level
 * of that send, so picking the model again (or a new chat inheriting it)
 * restores the level instead of resetting to the binding default.
 */
export type RecentModel = {
  providerId: string;
  modelId: string;
  thinkingLevel?: SessionThinkingLevel;
};
const KEY = "pi.desktop.recentModels";
const LIMIT = 20;

export function sameRecentModel(left: SessionModelRef, right: SessionModelRef): boolean {
  return !!left.providerId && left.providerId === right.providerId &&
    !!left.modelId && !!right.modelId &&
    left.modelId.toLowerCase() === right.modelId.toLowerCase();
}

export function rememberModelInList(
  list: readonly RecentModel[],
  model: SessionModelRef & { thinkingLevel?: unknown },
): RecentModel[] {
  if (!model.providerId?.trim() || !model.modelId?.trim()) return [...list];
  const selected: RecentModel = {
    providerId: model.providerId,
    modelId: model.modelId,
    ...(isSessionThinkingLevel(model.thinkingLevel) ? { thinkingLevel: model.thinkingLevel } : {}),
  };
  return [selected, ...list.filter(entry => !sameRecentModel(entry, selected))].slice(0, LIMIT);
}

/** Reasoning level last sent with this exact provider/model, if recorded. */
export function rememberedThinkingLevel(
  list: readonly RecentModel[] | undefined,
  model: SessionModelRef,
): SessionThinkingLevel | undefined {
  return list?.find(entry => sameRecentModel(entry, model))?.thinkingLevel;
}

export function loadRecentModels(): RecentModel[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    // Entries saved before levels were recorded load without one; an invalid
    // level is dropped rather than discarding the model.
    return parsed.filter((entry): entry is RecentModel =>
      entry !== null && typeof entry === "object" &&
      typeof entry.providerId === "string" && !!entry.providerId.trim() &&
      typeof entry.modelId === "string" && !!entry.modelId.trim(),
    ).reduceRight<RecentModel[]>((list, entry) => rememberModelInList(list, entry), []);
  } catch {
    return [];
  }
}

export function saveRecentModels(models: readonly RecentModel[]): void {
  localStorage.setItem(KEY, JSON.stringify(models));
}
