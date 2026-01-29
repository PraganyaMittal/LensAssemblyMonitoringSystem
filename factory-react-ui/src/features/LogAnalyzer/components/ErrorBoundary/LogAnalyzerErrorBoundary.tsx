/**
 * LogAnalyzerErrorBoundary - Error boundary specific to the Log Analyzer module.
 * 
 * Catches errors within the Log Analyzer feature and provides:
 * - Graceful fallback UI
 * - Error logging
 * - Recovery action (reset and retry)
 * 
 * This prevents crashes in Log Analyzer from affecting the rest of the app.
 */
import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
    /** Optional callback when an error is caught */
    onError?: (error: Error, errorInfo: ErrorInfo) => void;
    /** Optional callback to reset the component state */
    onReset?: () => void;
    /** Optional custom fallback component */
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

/**
 * Error Boundary for Log Analyzer module.
 * 
 * @example
 * ```tsx
 * <LogAnalyzerErrorBoundary onReset={handleReset}>
 *   <LogAnalyzerPage />
 * </LogAnalyzerErrorBoundary>
 * ```
 */
export class LogAnalyzerErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null,
        };
    }

    static getDerivedStateFromError(error: Error): Partial<State> {
        return {
            hasError: true,
            error,
        };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        // Log error to console
        console.error('LogAnalyzer Error Boundary caught an error:', error);
        console.error('Component stack:', errorInfo.componentStack);

        // Update state with error info
        this.setState({ errorInfo });

        // Call optional error callback
        this.props.onError?.(error, errorInfo);
    }

    handleReset = (): void => {
        this.setState({
            hasError: false,
            error: null,
            errorInfo: null,
        });
        this.props.onReset?.();
    };

    render(): ReactNode {
        if (this.state.hasError) {
            // Custom fallback if provided
            if (this.props.fallback) {
                return this.props.fallback;
            }

            // Default fallback UI
            return (
                <div
                    role="alert"
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: '300px',
                        padding: '2rem',
                        background: 'var(--bg-surface, #1e293b)',
                        borderRadius: '12px',
                        border: '1px solid var(--border-color, #334155)',
                        margin: '1rem',
                    }}
                >
                    {/* Error Icon */}
                    <div
                        style={{
                            width: '60px',
                            height: '60px',
                            borderRadius: '50%',
                            background: 'rgba(239, 68, 68, 0.1)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginBottom: '1.5rem',
                        }}
                    >
                        <svg
                            width="30"
                            height="30"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#ef4444"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                    </div>

                    {/* Error Title */}
                    <h2
                        style={{
                            fontSize: '1.25rem',
                            fontWeight: 600,
                            color: 'var(--text-primary, #f1f5f9)',
                            margin: '0 0 0.5rem 0',
                            textAlign: 'center',
                        }}
                    >
                        Something went wrong in Log Analyzer
                    </h2>

                    {/* Error Message */}
                    <p
                        style={{
                            fontSize: '0.875rem',
                            color: 'var(--text-secondary, #94a3b8)',
                            margin: '0 0 1.5rem 0',
                            textAlign: 'center',
                            maxWidth: '400px',
                        }}
                    >
                        {this.state.error?.message || 'An unexpected error occurred.'}
                    </p>

                    {/* Recovery Actions */}
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <button
                            onClick={this.handleReset}
                            style={{
                                padding: '0.625rem 1.25rem',
                                fontSize: '0.875rem',
                                fontWeight: 500,
                                color: '#fff',
                                background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.transform = 'translateY(-1px)';
                                e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.4)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = 'none';
                            }}
                        >
                            Try Again
                        </button>

                        <button
                            onClick={() => window.location.reload()}
                            style={{
                                padding: '0.625rem 1.25rem',
                                fontSize: '0.875rem',
                                fontWeight: 500,
                                color: 'var(--text-secondary, #94a3b8)',
                                background: 'transparent',
                                border: '1px solid var(--border-color, #334155)',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = '#64748b';
                                e.currentTarget.style.color = '#f1f5f9';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = '#334155';
                                e.currentTarget.style.color = '#94a3b8';
                            }}
                        >
                            Reload Page
                        </button>
                    </div>

                    {/* Error Details (Development Only) */}
                    {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
                        <details
                            style={{
                                marginTop: '2rem',
                                padding: '1rem',
                                background: 'rgba(0, 0, 0, 0.2)',
                                borderRadius: '8px',
                                width: '100%',
                                maxWidth: '600px',
                            }}
                        >
                            <summary
                                style={{
                                    cursor: 'pointer',
                                    fontSize: '0.75rem',
                                    color: '#94a3b8',
                                    marginBottom: '0.5rem',
                                }}
                            >
                                Error Details (Development)
                            </summary>
                            <pre
                                style={{
                                    fontSize: '0.7rem',
                                    color: '#f87171',
                                    overflow: 'auto',
                                    margin: 0,
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                }}
                            >
                                {this.state.error?.stack}
                                {'\n\nComponent Stack:'}
                                {this.state.errorInfo.componentStack}
                            </pre>
                        </details>
                    )}
                </div>
            );
        }

        return this.props.children;
    }
}

export default LogAnalyzerErrorBoundary;
