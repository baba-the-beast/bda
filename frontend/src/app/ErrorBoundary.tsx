import { Component, type ErrorInfo, type ReactNode } from 'react';

import { Panel, PanelBody } from '../components/ui/Panel';
import { ErrorState } from '../components/ui/States';
import { ApiError } from '../lib/api/errors';

interface Props {
  children: ReactNode;
  /** Changing this clears the error, so navigating away recovers. */
  resetKey?: string;
}

interface State {
  error: Error | null;
  resetKey: string | undefined;
}

/**
 * Catches render-time failures so one broken panel cannot blank the page.
 * Used around the routed outlet and available for individual panels.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null, resetKey: props.resetKey };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey !== state.resetKey) {
      return { error: null, resetKey: props.resetKey };
    }
    return null;
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Render failure', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (error === null) {
      return this.props.children;
    }

    return (
      <Panel>
        <PanelBody>
          <ErrorState
            title="This section failed to render"
            message={error.message}
            correlationId={error instanceof ApiError ? error.correlationId : null}
            onRetry={() => {
              this.setState({ error: null });
            }}
          />
        </PanelBody>
      </Panel>
    );
  }
}
