function callbackParams(hash = '') {
  return new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
}

export function parseCallbackError(search = '', hash = '') {
  const query = new URLSearchParams(search);
  const fragment = callbackParams(hash);
  const read = key => query.get(key) || fragment.get(key);
  const code = read('error_code');
  const name = read('error');
  const description = read('error_description');

  if (!(code || name || description)) return null;
  if (code === 'otp_expired' || name === 'otp_expired') {
    return 'The verification link has expired. Please request a new verification email.';
  }
  if ((code === 'access_denied' || name === 'access_denied') && !description) {
    return 'Verification was denied. The link may have expired or already been used.';
  }
  // URLSearchParams already decodes percent escapes and form-encoded spaces.
  // A second decode can throw on literal percent signs or change literal '+'.
  return description || name || code || 'Verification failed. Please request a new link.';
}

export function getAuthCallbackState({
  search = '', hash = '', user = null, loading = false,
  isTransitioning = false, authError = null, timedOut = false,
  callbackPending = false, callbackError = null,
} = {}) {
  const urlError = parseCallbackError(search, hash);
  const hasCode = Boolean(new URLSearchParams(search).get('code')?.trim());
  const hasAccessToken = Boolean(callbackParams(hash).get('access_token')?.trim());
  const missingCodeError = !user && !loading && !isTransitioning && !callbackPending && !hasCode && !hasAccessToken
    ? 'No verification code was found. Please open the link from your email or sign in directly.'
    : null;
  const error = urlError || callbackError || authError || missingCodeError || (timedOut
    ? 'Sign-in confirmation is taking longer than expected. Check your connection and sign in with your email and password.'
    : null);

  return {
    error,
    canNavigate: Boolean(user && !loading && !isTransitioning && !callbackPending && !error),
  };
}
