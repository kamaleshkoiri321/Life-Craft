import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSignUpForm,
  validateSignInForm,
  validateVerificationCode,
  validateResetPasswordForm,
  sanitizeRedirectPath,
  formatAuthError,
} from './validation';

describe('Phase 2 authentication validation & security helpers', () => {
  it('validates sign-up fields including password strength, confirmation, and terms', () => {
    const emptyErrors = validateSignUpForm({
      name: '',
      email: 'not-an-email',
      password: 'short',
      confirmPassword: 'different',
      acceptTerms: false,
    });
    assert.ok(emptyErrors.name);
    assert.ok(emptyErrors.email);
    assert.ok(emptyErrors.password);
    assert.ok(emptyErrors.confirmPassword);
    assert.ok(emptyErrors.acceptTerms);

    const validErrors = validateSignUpForm({
      name: 'Maya Lin',
      email: 'maya@example.com',
      password: 'CalmPassword2026',
      confirmPassword: 'CalmPassword2026',
      acceptTerms: true,
    });
    assert.deepEqual(validErrors, {});
  });

  it('validates sign-in and 6-digit verification codes', () => {
    assert.ok(validateSignInForm({ email: '', password: '' }).email);
    assert.deepEqual(
      validateSignInForm({ email: 'maya@example.com', password: 'secret' }),
      {}
    );

    assert.ok(validateVerificationCode('123'));
    assert.ok(validateVerificationCode('abcdef'));
    assert.equal(validateVerificationCode('482910'), undefined);
  });

  it('validates reset password requirements and confirmation', () => {
    const mismatch = validateResetPasswordForm('SecurePass123', 'SecurePass999');
    assert.ok(mismatch.confirmPassword);

    const valid = validateResetPasswordForm('SecurePass123', 'SecurePass123');
    assert.deepEqual(valid, {});
  });

  it('sanitizes redirect paths to prevent open redirects', () => {
    assert.equal(sanitizeRedirectPath('/app'), '/app');
    assert.equal(sanitizeRedirectPath('https://evil.example.com'), '/app');
    assert.equal(sanitizeRedirectPath('//evil.example.com'), '/app');
    assert.equal(sanitizeRedirectPath('/sign-in'), '/app');
  });

  it('maps Neon Auth errors to accessible, non-leaking messages', () => {
    const invalidCreds = formatAuthError({
      code: 'INVALID_EMAIL_OR_PASSWORD',
      message: 'Invalid email or password',
    });
    assert.equal(invalidCreds.code, 'INVALID_EMAIL_OR_PASSWORD');

    const unverified = formatAuthError({
      code: 'EMAIL_NOT_VERIFIED',
      message: 'Email not verified',
    });
    assert.equal(unverified.requiresEmailVerification, true);

    const originErr = formatAuthError({
      code: 'INVALID_ORIGIN',
      message: 'Invalid origin',
    });
    assert.equal(originErr.isOriginConfigIssue, true);

    const popupOauthUrlErr = formatAuthError(new Error('Failed to get OAuth URL'));
    assert.equal(popupOauthUrlErr.isOriginConfigIssue, true);

    const callbackUrlErr = formatAuthError({
      code: 'INVALID_CALLBACKURL',
      error: 'Invalid callbackURL',
    });
    assert.equal(callbackUrlErr.isOriginConfigIssue, true);
  });
});
