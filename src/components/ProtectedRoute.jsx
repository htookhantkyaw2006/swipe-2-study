import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/useAuth.js';

/**
 * Route guard component for account-only routes.
 *
 * Behaviors:
 * - During loading / transition: renders a neutral loading indicator; no account-only content is rendered.
 * - For unauthenticated guests: redirects to /login with returnTo query param preserving the target location.
 * - For verified signed-in users: renders child elements.
 */
export default function ProtectedRoute({ children }) {
  const { user, loading, isTransitioning } = useAuth();
  const location = useLocation();

  if (loading || isTransitioning) {
    return (
      <div className="study-page" role="status" aria-busy="true">
        <div className="study-empty">
          <div className="auth-spinner" style={{ margin: '0 auto 16px', width: 36, height: 36 }} />
          <h2>Connecting your account…</h2>
        </div>
      </div>
    );
  }

  if (!user) {
    const returnPath = location.pathname + location.search + location.hash;
    return <Navigate to={`/login?returnTo=${encodeURIComponent(returnPath)}`} replace />;
  }

  return children;
}
