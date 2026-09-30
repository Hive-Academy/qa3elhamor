import { useCallback, useMemo, useState } from 'react';
import { createModerationClient, type ModerationClient } from './api';
import { ModerationQueue } from './moderation-queue';
import { SignInForm } from './sign-in-form';
import { sessionTokenStore, type TokenStore } from './token-store';

const INVALID_TOKEN = 'Invalid token. Enter the moderation token again.';
const MEMORY_ONLY =
  'This browser blocks session storage, so the token is kept in memory only: reloading the page signs you out.';

export interface ModerationAppProps {
  readonly tokenStore?: TokenStore;
  readonly createClient?: (token: string) => ModerationClient;
  readonly confirm?: (message: string) => boolean;
}

export function ModerationApp({
  tokenStore,
  createClient = (token) => createModerationClient({ token }),
  confirm,
}: ModerationAppProps) {
  const store = useMemo(() => tokenStore ?? sessionTokenStore(), [tokenStore]);
  const [token, setToken] = useState<string | null>(() => store.read());
  const [signInError, setSignInError] = useState<string | null>(null);

  // Built once per token; `createClient` is a construction-time option, not a live dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const client = useMemo(() => (token === null ? null : createClient(token)), [token]);

  const signIn = (value: string) => {
    store.write(value);
    setSignInError(null);
    setToken(value);
  };

  const signOut = useCallback(() => {
    store.clear();
    setToken(null);
  }, [store]);

  const onUnauthorized = useCallback(() => {
    store.clear();
    setSignInError(INVALID_TOKEN);
    setToken(null);
  }, [store]);

  return (
    <div className="mod-shell">
      <header className="mod-header">
        <h1>Complaints moderation</h1>
        {client !== null && (
          <button type="button" className="mod-button" onClick={() => {
            setSignInError(null);
            signOut();
          }}>
            Sign out
          </button>
        )}
      </header>
      <main>
        {client !== null && !store.persistent && (
          <p className="mod-alert" role="status">
            {MEMORY_ONLY}
          </p>
        )}
        {client === null ? (
          <SignInForm error={signInError} onSubmit={signIn} />
        ) : (
          <ModerationQueue client={client} onUnauthorized={onUnauthorized} confirm={confirm} />
        )}
      </main>
    </div>
  );
}
