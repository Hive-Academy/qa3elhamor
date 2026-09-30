import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryState {
  readonly failed: boolean;
}

/**
 * Last line of defence for the moderation page: a render error shows a way out instead of a
 * blank screen. React only offers this as a class component. The error itself is logged without
 * props or state, so the token (held in state) never reaches the console.
 */
export class ModerationErrorBoundary extends Component<{ readonly children: ReactNode }, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Moderation console crashed:', error.message, info.componentStack);
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="mod-shell">
        <div className="mod-alert mod-alert--error" role="alert">
          <p>The moderation console hit an unexpected error.</p>
          <button type="button" className="mod-button" onClick={() => window.location.reload()}>
            Reload the page
          </button>
        </div>
      </div>
    );
  }
}
