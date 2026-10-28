import { parseCallbackError } from './authCallbackState.js';

export const RESET_LINK_REQUIRED = 'Please open the newest link from your password reset email. Older links may need the browser and app address where you requested them.';
export const RESET_EMAIL_SENT = 'If an account can receive a reset email at this address, check your inbox and spam folder for the link.';

export function validateNewPassword(password, confirmation) {
  if (!password || password.length < 6) return 'Use at least 6 characters for your new password.';
  if (password !== confirmation) return 'The passwords do not match.';
  return null;
}

function safeAuthError(error, fallback) {
  if (error?.code === 'over_email_send_rate_limit') {
    return 'The email sending limit has been reached. Please try again later; sending another request now will not help.';
  }
  if (error?.status === 429 || error?.code === 'over_email_send_rate_limit' || error?.code === 'over_request_rate_limit') {
    return 'Too many requests. Please wait before trying again.';
  }
  if (error?.code === 'same_password') return 'Choose a different password from your current one.';
  if (error?.code === 'weak_password') return 'This password does not meet the account’s password requirements. Try a stronger one.';
  return fallback;
}

export async function requestPasswordRecovery(auth, email, origin) {
  const trimmed = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return { error: 'Enter a valid email address.' };
  try {
    const redirectTo = new URL('/reset-password', origin).href;
    const { error } = await auth.resetPasswordForEmail(trimmed, { redirectTo });
    if (error) return {
      error: safeAuthError(error, 'Could not request a reset link. Please try again.'),
      cooldownSeconds: error.status === 429 || error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit' ? 60 : 0,
    };
    return { error: null, message: RESET_EMAIL_SENT, cooldownSeconds: 60 };
  } catch {
    return { error: 'Could not request a reset link. Check your connection and try again.' };
  }
}

export function recoveryVerificationError(error) {
  if (error?.code === 'otp_expired') return 'This reset link has expired or already been used. Please request a new reset email.';
  return safeAuthError(error, 'This reset link could not be verified. Please request a new reset email.');
}

export function recoveryLinkError(search = '', hash = '') {
  const parsed = parseCallbackError(search, hash);
  if (!parsed) return null;
  return `${parsed} Please request a fresh password reset email.`;
}

export async function updateRecoveredPassword(auth, { password, confirmation, expectedUserId, isAllowed }) {
  const validation = validateNewPassword(password, confirmation);
  if (validation) return { error: validation };
  if (!expectedUserId || !isAllowed(expectedUserId)) return { error: RESET_LINK_REQUIRED };
  try {
    // Verify the intended account again immediately before submission. A cached
    // session alone, or a normal sign-in on this URL, is not a recovery grant.
    const verified = await auth.getUser();
    if (verified.error || verified.data?.user?.id !== expectedUserId || !isAllowed(expectedUserId)) return { error: RESET_LINK_REQUIRED };
    const current = await auth.getSession();
    if (current.error || current.data?.session?.user?.id !== expectedUserId || !isAllowed(expectedUserId)) return { error: RESET_LINK_REQUIRED };
    const result = await auth.updateUser({ password });
    if (result.error) return { error: safeAuthError(result.error, 'Could not update your password. Please try again or request a fresh link.') };
    if (result.data?.user?.id !== expectedUserId || !isAllowed(expectedUserId)) return { error: RESET_LINK_REQUIRED };
    return { error: null };
  } catch {
    return { error: 'Could not update your password. Check your connection and try again.' };
  }
}
