/**
 * The moderation token lives in `sessionStorage` only: it survives a reload of this tab and is
 * gone when the tab closes. It is never written to `localStorage`, a cookie or a URL.
 *
 * Storage can be unusable (blocked by privacy settings, a sandboxed frame, a full quota): even
 * reading `window.sessionStorage` can throw. The store then keeps the token in memory for the
 * life of the page and reports `persistent: false`, so the view can say a reload signs out.
 */
const KEY = 'qa3elhamor.moderation-token';

export interface TokenStore {
  read(): string | null;
  write(token: string): void;
  clear(): void;
  /** False once storage has failed: the token is in memory only. */
  readonly persistent: boolean;
}

const defaultStorage = (): Storage | null => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

export const sessionTokenStore = (storage: Storage | null = defaultStorage()): TokenStore => {
  let backing = storage;
  let memory: string | null = null;

  const attempt = <T>(operation: (store: Storage) => T): { ok: true; value: T } | { ok: false } => {
    if (backing === null) return { ok: false };
    try {
      return { ok: true, value: operation(backing) };
    } catch {
      backing = null;
      return { ok: false };
    }
  };

  return {
    read: () => {
      const stored = attempt((store) => store.getItem(KEY));
      const token = stored.ok ? stored.value : memory;
      return token === null || token.trim() === '' ? null : token;
    },
    write: (token) => {
      memory = token;
      attempt((store) => store.setItem(KEY, token));
    },
    clear: () => {
      memory = null;
      attempt((store) => store.removeItem(KEY));
    },
    get persistent() {
      return backing !== null;
    },
  };
};
