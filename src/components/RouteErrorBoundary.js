import React, { createElement, Component } from 'react';

export function RouteLoadingFallback() {
  return createElement(
    'div',
    { className: 'study-page', role: 'status', 'aria-busy': 'true', 'aria-live': 'polite' },
    createElement(
      'div',
      { className: 'study-empty' },
      createElement('div', { className: 'auth-spinner', style: { margin: '0 auto 16px', width: 36, height: 36 }, 'aria-hidden': 'true' }),
      createElement('h2', null, 'Loading…')
    )
  );
}

export class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    if (typeof this.props.onError === 'function') {
      this.props.onError(error, errorInfo);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    if (typeof this.props.onRetry === 'function') {
      this.props.onRetry();
    }
    if (typeof window !== 'undefined' && typeof window.location?.reload === 'function') {
      const isChunkError = /dynamically imported module|Loading chunk|Failed to fetch/i.test(this.state.error?.message || '');
      if (isChunkError) {
        try { window.location.reload(); } catch {}
      }
    }
  };

  render() {
    if (this.state.hasError) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback({ error: this.state.error, retry: this.handleRetry });
      }
      return createElement(
        'div',
        { className: 'study-page', role: 'alert', 'aria-live': 'assertive' },
        createElement(
          'div',
          { className: 'study-empty' },
          createElement('h2', null, 'Unable to load page'),
          createElement(
            'p',
            { style: { maxWidth: 420, margin: '0 auto 18px', fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--color-text-subtle)' } },
            'Check your connection and try again.'
          ),
          createElement(
            'div',
            { style: { display: 'flex', gap: 12, justifyContent: 'center' } },
            createElement(
              'button',
              { type: 'button', className: 'btn-primary', onClick: this.handleRetry },
              'Retry'
            ),
            createElement(
              'a',
              { href: '/', className: 'btn-secondary', style: { textDecoration: 'none', display: 'inline-flex', alignItems: 'center' } },
              'Back to Home'
            )
          )
        )
      );
    }
    return this.props.children;
  }
}
