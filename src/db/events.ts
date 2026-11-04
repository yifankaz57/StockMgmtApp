import { useSyncExternalStore } from 'react';

// DB の変更を画面に通知するための小さなストア
let version = 0;
const listeners = new Set<() => void>();

export function notifyDataChanged(): void {
  version += 1;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** データが変更されるたびに増える番号。useEffect の依存配列に入れて再読み込みに使う */
export function useDataVersion(): number {
  return useSyncExternalStore(subscribe, () => version);
}
