import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { createElement, Component } from 'react';
import { renderToString } from 'react-dom/server';
import { RouteErrorBoundary, RouteLoadingFallback } from '../src/components/RouteErrorBoundary.js';
import { runBrowserAppSmokeVerification } from './runBrowserAppSmoke.mjs';

test('RouteLoadingFallback: renders accessible status and spinner', () => {
  const html = renderToString(createElement(RouteLoadingFallback));
  assert.ok(html.includes('role="status"'), 'Must have role="status"');
  assert.ok(html.includes('aria-busy="true"'), 'Must indicate busy state');
  assert.ok(html.includes('auth-spinner'), 'Must render spinner');
  assert.ok(html.includes('Loading…'), 'Must announce loading text');
});

test('RouteErrorBoundary: renders children normally when no error occurs', () => {
  const child = createElement('div', { id: 'child-view' }, 'Child content');
  const html = renderToString(createElement(RouteErrorBoundary, null, child));
  assert.ok(html.includes('Child content'), 'Children must render');
});

test('RouteErrorBoundary: catches errors, renders accessible alert and retry control', () => {
  class ExplodingComponent extends Component {
    render() {
      throw new Error('Simulated chunk load failure');
    }
  }

  // Silence expected console.error during ErrorBoundary test
  const origError = console.error;
  console.error = () => {};

  try {
    let capturedError = null;
    const boundary = new RouteErrorBoundary({
      onError: (err) => { capturedError = err; },
    });

    // Simulate getDerivedStateFromError
    const nextState = RouteErrorBoundary.getDerivedStateFromError(new Error('Chunk load failed'));
    assert.equal(nextState.hasError, true);
    assert.equal(nextState.error.message, 'Chunk load failed');

    boundary.state = nextState;
    boundary.setState = (patch) => {
      boundary.state = { ...boundary.state, ...patch };
    };
    const rendered = boundary.render();
    const html = renderToString(rendered);

    assert.ok(html.includes('role="alert"'), 'Must have role="alert"');
    assert.ok(html.includes('Unable to load page'), 'Must show actionable title');
    assert.ok(html.includes('Check your connection and try again'), 'Must suggest user action');
    assert.ok(html.includes('Retry'), 'Must offer retry button');
    assert.ok(html.includes('Back to Home'), 'Must offer navigation back to home');

    // Verify retry resets error state
    boundary.handleRetry();
    assert.equal(boundary.state.hasError, false);
    assert.equal(boundary.state.error, null);
  } finally {
    console.error = origError;
  }
});

test('Real Browser App Smoke: verifies guest startup, learning routes, protected routing, and auth callback in real browser', async (t) => {
  const browserRes = await runBrowserAppSmokeVerification();
  if (browserRes.skipped) {
    t.skip(`Browser check skipped: ${browserRes.reason}`);
    return;
  }
  assert.equal(browserRes.passed, true, 'Real browser app smoke tests must pass');
  assert.ok(browserRes.results.length >= 5, 'Must report all 5 smoke scenarios');
});
