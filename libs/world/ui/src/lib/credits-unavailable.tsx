import './credits.css';

export interface CreditsUnavailableProps {
  readonly message?: string;
}

/**
 * Shown in place of the Credits button when the credits cannot be derived (a shipped asset
 * has no attribution record). Says so plainly instead of hiding the problem.
 */
export function CreditsUnavailable({
  message = 'Credits unavailable — licence error',
}: CreditsUnavailableProps) {
  return (
    <p role="alert" className="world-credits__unavailable" lang="en" dir="ltr">
      {message}
    </p>
  );
}
