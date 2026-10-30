import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SETTINGS_THEMES,
  WEEK_START_OPTIONS,
  buildTimezoneOptions,
  isSupportedTimezone,
  validateDeleteAccountConfirmation,
  validateUpdateSettingsInput,
} from './settings-utils';

test('SETTINGS_THEMES and WEEK_START_OPTIONS match supported DB constraints', () => {
  assert.deepEqual(SETTINGS_THEMES, ['light', 'dark', 'system']);
  for (const option of WEEK_START_OPTIONS) {
    assert.ok(option.value >= 0 && option.value <= 6);
  }
});

test('isSupportedTimezone and buildTimezoneOptions validate IANA timezones and include custom valid zones', () => {
  assert.equal(isSupportedTimezone('Asia/Kathmandu'), true);
  assert.equal(isSupportedTimezone('America/New_York'), true);
  assert.equal(isSupportedTimezone('Invalid/Not_A_Timezone'), false);

  const list = buildTimezoneOptions('Pacific/Honolulu', 'Europe/Rome');
  assert.equal(
    list.some((item) => item.value === 'Pacific/Honolulu'),
    true
  );
  assert.equal(
    list.some((item) => item.value === 'Europe/Rome'),
    true
  );
});

test('validateUpdateSettingsInput accepts valid profile, appearance, and preference updates and rejects invalid values', () => {
  const valid = validateUpdateSettingsInput({
    displayName: '  Kamalesh Koiri  ',
    theme: 'dark',
    timezone: 'Asia/Kathmandu',
    weekStartsOn: 1,
    image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  });

  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.value.displayName, 'Kamalesh Koiri');
    assert.equal(valid.value.theme, 'dark');
    assert.equal(valid.value.timezone, 'Asia/Kathmandu');
    assert.equal(valid.value.weekStartsOn, 1);
  }

  const clearAvatar = validateUpdateSettingsInput({
    image: null,
  });
  assert.equal(clearAvatar.ok, true);
  if (clearAvatar.ok) {
    assert.equal(clearAvatar.value.image, null);
  }

  assert.equal(validateUpdateSettingsInput({ displayName: '   ' }).ok, false);
  assert.equal(
    validateUpdateSettingsInput({ displayName: 'a'.repeat(85) }).ok,
    false
  );
  assert.equal(
    validateUpdateSettingsInput({ theme: 'solarized' }).ok,
    false
  );
  assert.equal(
    validateUpdateSettingsInput({ timezone: 'Not/Real' }).ok,
    false
  );
  assert.equal(
    validateUpdateSettingsInput({ weekStartsOn: 9 }).ok,
    false
  );
  assert.equal(validateUpdateSettingsInput({}).ok, false);
});

test('validateDeleteAccountConfirmation requires exact DELETE confirmation', () => {
  assert.equal(
    validateDeleteAccountConfirmation({ confirmation: 'DELETE' }).ok,
    true
  );
  assert.equal(
    validateDeleteAccountConfirmation({ confirmation: '  DELETE  ' }).ok,
    true
  );
  assert.equal(
    validateDeleteAccountConfirmation({ confirmation: 'delete' }).ok,
    false
  );
  assert.equal(
    validateDeleteAccountConfirmation({ confirmation: '' }).ok,
    false
  );
});
