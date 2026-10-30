export interface SignUpFormInput {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  acceptTerms: boolean;
}

export interface SignInFormInput {
  email: string;
  password: string;
}

export interface ValidationErrors {
  name?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  acceptTerms?: string;
  otp?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  const trimmed = email.trim();
  return trimmed.length > 3 && trimmed.length <= 254 && EMAIL_REGEX.test(trimmed);
}

export function validatePasswordRequirements(password: string): string | undefined {
  if (!password) {
    return 'Password is required.';
  }
  if (password.length < 8) {
    return 'Password must be at least 8 characters long.';
  }
  if (password.length > 128) {
    return 'Password must be 128 characters or fewer.';
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must include at least one letter and one number.';
  }
  return undefined;
}

export function validateSignUpForm(input: SignUpFormInput): ValidationErrors {
  const errors: ValidationErrors = {};

  const trimmedName = input.name.trim();
  if (!trimmedName) {
    errors.name = 'Full name is required.';
  } else if (trimmedName.length < 2) {
    errors.name = 'Please enter at least 2 characters for your name.';
  }

  if (!input.email.trim()) {
    errors.email = 'Email address is required.';
  } else if (!isValidEmail(input.email)) {
    errors.email = 'Please enter a valid email address.';
  }

  const passwordError = validatePasswordRequirements(input.password);
  if (passwordError) {
    errors.password = passwordError;
  }

  if (!input.confirmPassword) {
    errors.confirmPassword = 'Please confirm your password.';
  } else if (input.password !== input.confirmPassword) {
    errors.confirmPassword = 'Passwords do not match.';
  }

  if (!input.acceptTerms) {
    errors.acceptTerms = 'You must accept the Terms and Privacy Policy to create an account.';
  }

  return errors;
}

export function validateSignInForm(input: SignInFormInput): ValidationErrors {
  const errors: ValidationErrors = {};

  if (!input.email.trim()) {
    errors.email = 'Email address is required.';
  } else if (!isValidEmail(input.email)) {
    errors.email = 'Please enter a valid email address.';
  }

  if (!input.password) {
    errors.password = 'Password is required.';
  }

  return errors;
}

export function validateVerificationCode(code: string): string | undefined {
  const trimmed = code.trim();
  if (!trimmed) {
    return 'Please enter the verification code from your email.';
  }
  if (!/^\d{6}$/.test(trimmed)) {
    return 'Verification code must be a 6-digit number.';
  }
  return undefined;
}

export function validateResetPasswordForm(
  password: string,
  confirmPassword: string
): ValidationErrors {
  const errors: ValidationErrors = {};
  const passwordError = validatePasswordRequirements(password);
  if (passwordError) {
    errors.password = passwordError;
  }
  if (!confirmPassword) {
    errors.confirmPassword = 'Please confirm your new password.';
  } else if (password !== confirmPassword) {
    errors.confirmPassword = 'Passwords do not match.';
  }
  return errors;
}

/**
 * Sanitizes a post-login redirect path so only internal relative paths
 * are permitted (prevents open-redirect attacks).
 */
export function sanitizeRedirectPath(
  redirectParam: string | null | undefined,
  fallback = '/app'
): string {
  if (!redirectParam || typeof redirectParam !== 'string') {
    return fallback;
  }
  const trimmed = redirectParam.trim();
  if (
    !trimmed.startsWith('/') ||
    trimmed.startsWith('//') ||
    trimmed.includes('://') ||
    trimmed.startsWith('/sign-in') ||
    trimmed.startsWith('/signin') ||
    trimmed.startsWith('/sign-up') ||
    trimmed.startsWith('/get-started')
  ) {
    return fallback;
  }
  return trimmed;
}

export interface FriendlyAuthError {
  message: string;
  code?: string;
  requiresEmailVerification?: boolean;
  isOriginConfigIssue?: boolean;
}

export function formatAuthError(error: unknown): FriendlyAuthError {
  if (!error) {
    return { message: 'An unexpected authentication error occurred. Please try again.' };
  }

  const errObj = error as {
    code?: string;
    message?: string;
    status?: number;
    error?: string;
  };

  const rawCode = (errObj.code || '').toUpperCase();
  const rawMessage = errObj.message || errObj.error || '';
  const lowerMsg = rawMessage.toLowerCase();

  if (
    rawCode === 'INVALID_ORIGIN' ||
    rawCode === 'INVALID_CALLBACKURL' ||
    rawCode === 'OAUTH_CALLBACK_FAILED' ||
    rawCode === 'BAD_OAUTH_CALLBACK' ||
    lowerMsg.includes('invalid origin') ||
    lowerMsg.includes('invalid callbackurl') ||
    lowerMsg.includes('failed to get oauth url') ||
    lowerMsg.includes('invalid oauth callback')
  ) {
    return {
      code: rawCode || 'INVALID_CALLBACKURL',
      isOriginConfigIssue: true,
      message:
        'Google Sign-In requires this preview URL to be added to your Neon Auth Trusted Domains list. Add the URL below in Neon Console → Auth → Configuration → Trusted Domains, or sign in with Email & Password right away.',
    };
  }

  if (
    rawCode === 'EMAIL_NOT_VERIFIED' ||
    rawCode === 'EMAIL_NOT_CONFIRMED' ||
    lowerMsg.includes('email not verified') ||
    lowerMsg.includes('email verification required')
  ) {
    return {
      code: 'EMAIL_NOT_VERIFIED',
      requiresEmailVerification: true,
      message: 'Please verify your email address before signing in.',
    };
  }

  if (
    rawCode === 'USER_ALREADY_EXISTS' ||
    rawCode === 'EMAIL_EXISTS' ||
    errObj.status === 409 ||
    lowerMsg.includes('already exists') ||
    lowerMsg.includes('already registered')
  ) {
    return {
      code: 'USER_ALREADY_EXISTS',
      message: 'An account with this email address already exists. Try signing in instead.',
    };
  }

  if (
    rawCode === 'INVALID_EMAIL_OR_PASSWORD' ||
    rawCode === 'INVALID_CREDENTIALS' ||
    rawCode === 'INVALID_PASSWORD' ||
    lowerMsg.includes('invalid email or password') ||
    lowerMsg.includes('invalid login')
  ) {
    return {
      code: 'INVALID_EMAIL_OR_PASSWORD',
      message: 'Incorrect email or password. Please check your credentials and try again.',
    };
  }

  if (rawCode === 'OTP_EXPIRED' || lowerMsg.includes('otp expired')) {
    return {
      code: 'OTP_EXPIRED',
      message: 'That verification code has expired. Please request a new code.',
    };
  }

  if (
    rawCode === 'INVALID_OTP' ||
    rawCode === 'OTP_NOT_FOUND' ||
    lowerMsg.includes('invalid otp') ||
    lowerMsg.includes('otp not found')
  ) {
    return {
      code: 'INVALID_OTP',
      message: 'Invalid verification code. Please check the 6-digit code and try again.',
    };
  }

  if (
    rawCode === 'TOO_MANY_ATTEMPTS' ||
    rawCode === 'OVER_REQUEST_RATE_LIMIT' ||
    rawCode === 'OVER_EMAIL_SEND_RATE_LIMIT' ||
    errObj.status === 429 ||
    lowerMsg.includes('too many') ||
    lowerMsg.includes('rate limit')
  ) {
    return {
      code: 'RATE_LIMITED',
      message: 'Too many attempts. Please wait a moment before trying again.',
    };
  }

  if (
    rawCode === 'INVALID_TOKEN' ||
    rawCode === 'BAD_JWT' ||
    lowerMsg.includes('invalid token') ||
    lowerMsg.includes('expired token')
  ) {
    return {
      code: 'INVALID_TOKEN',
      message:
        'This recovery link is invalid or has expired. Please request a new password reset.',
    };
  }

  if (
    lowerMsg.includes('popup blocked') ||
    lowerMsg.includes('allow popups')
  ) {
    return {
      code: 'POPUP_BLOCKED',
      message: 'Sign-in popup was blocked by your browser. Please allow popups for this site and try again.',
    };
  }

  if (
    lowerMsg.includes('popup was closed') ||
    lowerMsg.includes('cancelled') ||
    lowerMsg.includes('canceled')
  ) {
    return {
      code: 'OAUTH_CANCELLED',
      message: 'Google sign-in was cancelled before completion. You can try again whenever you are ready.',
    };
  }

  if (
    rawCode === 'DATABASE_UNAVAILABLE' ||
    rawCode === 'DATABASE_ERROR' ||
    lowerMsg.includes('database is unavailable') ||
    lowerMsg.includes('does not exist') ||
    lowerMsg.includes('project_config')
  ) {
    return {
      code: rawCode || 'DATABASE_UNAVAILABLE',
      message:
        'Neon Auth is still pointed at the deleted "neondb" database and is not yet initialized on "lifecraftdb". Please open Neon Console → Auth and enable/reconfigure Auth for the "lifecraftdb" database.',
    };
  }

  if (
    rawCode.startsWith('NETWORK_') ||
    lowerMsg.includes('failed to fetch') ||
    lowerMsg.includes('network')
  ) {
    return {
      code: 'NETWORK_ERROR',
      message:
        'Unable to reach the authentication service. Please check your internet connection and try again.',
    };
  }

  return {
    code: rawCode || 'AUTH_ERROR',
    message:
      'We could not complete your request right now. Please verify your details and try again.',
  };
}
