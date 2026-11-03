/**
 * Safely navigates back within the app.
 *
 * Note: window.history.length > 1 does NOT prove internal app origin,
 * because external sites visited before navigating to the app also increment history.length.
 *
 * In HTML5 History API used by React Router, `window.history.state?.idx` tracks the
 * zero-based index of router navigations within this app session.
 * - If idx > 0, there is a verified previous internal entry in this app session, so navigate(-1) is safe.
 * - If idx is 0 or undefined (direct link entry, new tab, or page reload),
 *   navigating -1 would exit the web application to an external origin, so we
 *   safely navigate to fallbackPath instead.
 */
export function hasInternalHistory() {
  if (typeof window === 'undefined' || !window.history) return false;
  return typeof window.history.state?.idx === 'number' && window.history.state.idx > 0;
}

export function safeNavigateBack(navigate, fallbackPath) {
  if (hasInternalHistory()) {
    navigate(-1);
  } else {
    navigate(fallbackPath);
  }
}
