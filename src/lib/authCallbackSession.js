const NO_SESSION = 'This browser did not receive a sign-in session. Your email may already be confirmed. Sign in with your email and password, or open a fresh confirmation link in the same browser, browser profile, and app address used to sign up.';

function callbackFailure(error) {
  if (error?.code === 'pkce_verifier_not_found' || error?.name === 'AuthPKCECodeVerifierMissingError') {
    return NO_SESSION;
  }
  if (['flow_state_expired', 'flow_state_not_found', 'bad_code_verifier', 'otp_expired'].includes(error?.code)) {
    return 'This confirmation could not create a sign-in session. The link may have been used, expired, or opened in a different browser. Sign in with your email and password, or request a fresh link.';
  }
  return 'The sign-in session could not be confirmed. Check your connection, then sign in with your email and password or request a fresh verification link.';
}

/**
 * Inspect the SDK's existing automatic URL exchange, not a second exchange.
 * getSession() alone can report no error after URL initialization failed or
 * skipped PKCE because this browser has no matching verifier.
 */
export async function inspectAuthCallbackSession(auth) {
  try {
    const initialized = await auth.initialize();
    if (initialized.error) return callbackFailure(initialized.error);

    const { data, error } = await auth.getSession();
    if (error) return callbackFailure(error);
    return data?.session ? null : NO_SESSION;
  } catch (error) {
    return callbackFailure(error);
  }
}
