import { useId, useState, type FormEvent } from 'react';

export interface SignInFormProps {
  /** Shown above the field, e.g. after the server refused the previous token. */
  readonly error: string | null;
  readonly onSubmit: (token: string) => void;
}

export function SignInForm({ error, onSubmit }: SignInFormProps) {
  const [token, setToken] = useState('');
  const fieldId = useId();
  const errorId = useId();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = token.trim();
    if (trimmed === '') return;
    setToken('');
    onSubmit(trimmed);
  };

  return (
    <form className="mod-signin" onSubmit={submit} aria-labelledby={`${fieldId}-title`}>
      <h2 id={`${fieldId}-title`}>Sign in</h2>
      <p className="mod-muted">
        Enter the moderation token. It is kept in this tab only and forgotten when the tab closes.
      </p>
      {error !== null && (
        <p id={errorId} className="mod-alert mod-alert--error" role="alert">
          {error}
        </p>
      )}
      <label htmlFor={fieldId}>Moderation token</label>
      <input
        id={fieldId}
        type="password"
        autoComplete="off"
        spellCheck={false}
        required
        value={token}
        aria-invalid={error !== null}
        aria-describedby={error !== null ? errorId : undefined}
        onChange={(event) => setToken(event.target.value)}
      />
      <button type="submit" className="mod-button mod-button--primary">
        Sign in
      </button>
    </form>
  );
}
