import { DEFAULT_TIMEZONE } from '../queries/timezone';

export const SETTINGS_THEMES = ['light', 'dark', 'system'] as const;
export type SettingsTheme = (typeof SETTINGS_THEMES)[number];

export interface WeekStartOption {
  value: number;
  label: string;
  shortLabel: string;
}

export const WEEK_START_OPTIONS: WeekStartOption[] = [
  { value: 1, label: 'Monday', shortLabel: 'Mon' },
  { value: 0, label: 'Sunday', shortLabel: 'Sun' },
  { value: 6, label: 'Saturday', shortLabel: 'Sat' },
];

export interface TimezoneOption {
  value: string;
  label: string;
}

export const COMMON_TIMEZONES: TimezoneOption[] = [
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
  { value: 'America/New_York', label: 'America/New_York (Eastern Time)' },
  { value: 'America/Chicago', label: 'America/Chicago (Central Time)' },
  { value: 'America/Denver', label: 'America/Denver (Mountain Time)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (Pacific Time)' },
  { value: 'America/Toronto', label: 'America/Toronto (Eastern Time - Canada)' },
  { value: 'America/Vancouver', label: 'America/Vancouver (Pacific Time - Canada)' },
  { value: 'America/Sao_Paulo', label: 'America/Sao_Paulo (Brasilia Time)' },
  { value: 'Europe/London', label: 'Europe/London (GMT / BST)' },
  { value: 'Europe/Paris', label: 'Europe/Paris (Central European Time)' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin (Central European Time)' },
  { value: 'Europe/Amsterdam', label: 'Europe/Amsterdam (Central European Time)' },
  { value: 'Europe/Zurich', label: 'Europe/Zurich (Central European Time)' },
  { value: 'Europe/Madrid', label: 'Europe/Madrid (Central European Time)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (Gulf Standard Time)' },
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (India Standard Time)' },
  { value: 'Asia/Kathmandu', label: 'Asia/Kathmandu (Nepal Time)' },
  { value: 'Asia/Dhaka', label: 'Asia/Dhaka (Bangladesh Standard Time)' },
  { value: 'Asia/Bangkok', label: 'Asia/Bangkok (Indochina Time)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (Singapore Standard Time)' },
  { value: 'Asia/Hong_Kong', label: 'Asia/Hong_Kong (Hong Kong Time)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (Japan Standard Time)' },
  { value: 'Asia/Seoul', label: 'Asia/Seoul (Korea Standard Time)' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney (Australian Eastern Time)' },
  { value: 'Australia/Melbourne', label: 'Australia/Melbourne (Australian Eastern Time)' },
  { value: 'Pacific/Auckland', label: 'Pacific/Auckland (New Zealand Time)' },
];

export interface SettingsDataPayload {
  profile: {
    userId: string;
    displayName: string;
    email: string;
    emailVerified: boolean;
    image: string | null;
    timezone: string;
  };
  preferences: {
    theme: SettingsTheme;
    weekStartsOn: number;
  };
  account: {
    providers: string[];
    hasPasswordAccount: boolean;
    createdAt: string | null;
  };
}

export interface ValidatedSettingsUpdate {
  displayName?: string;
  image?: string | null;
  theme?: SettingsTheme;
  timezone?: string;
  weekStartsOn?: number;
}

const DATA_IMAGE_PREFIX_REGEX =
  /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i;

export function isSupportedTimezone(tz: string): boolean {
  const trimmed = tz.trim();
  if (!trimmed || trimmed.length > 100) return false;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: trimmed });
    return true;
  } catch {
    return false;
  }
}

export function buildTimezoneOptions(
  currentTimezone?: string | null,
  browserTimezone?: string | null
): TimezoneOption[] {
  const map = new Map<string, TimezoneOption>();

  for (const item of COMMON_TIMEZONES) {
    map.set(item.value, item);
  }

  for (const extra of [currentTimezone, browserTimezone, DEFAULT_TIMEZONE]) {
    if (extra && isSupportedTimezone(extra) && !map.has(extra.trim())) {
      const clean = extra.trim();
      map.set(clean, { value: clean, label: clean });
    }
  }

  return Array.from(map.values());
}

export function validateUpdateSettingsInput(
  rawInput: Record<string, unknown>
):
  | { ok: true; value: ValidatedSettingsUpdate }
  | { ok: false; message: string } {
  if (!rawInput || typeof rawInput !== 'object') {
    return { ok: false, message: 'Invalid settings payload.' };
  }

  const update: ValidatedSettingsUpdate = {};
  let hasField = false;

  if (rawInput.displayName !== undefined) {
    if (typeof rawInput.displayName !== 'string') {
      return { ok: false, message: 'Display name must be a text string.' };
    }
    const trimmed = rawInput.displayName.trim();
    if (trimmed.length < 1) {
      return { ok: false, message: 'Display name cannot be empty.' };
    }
    if (trimmed.length > 80) {
      return {
        ok: false,
        message: 'Display name must be 80 characters or fewer.',
      };
    }
    update.displayName = trimmed;
    hasField = true;
  }

  if (rawInput.image !== undefined) {
    if (rawInput.image === null || rawInput.image === '') {
      update.image = null;
      hasField = true;
    } else if (typeof rawInput.image === 'string') {
      const trimmedImage = rawInput.image.trim();
      if (trimmedImage.length > 250_000) {
        return {
          ok: false,
          message: 'Profile image is too large. Please choose a smaller image.',
        };
      }
      const isDataImage = DATA_IMAGE_PREFIX_REGEX.test(trimmedImage);
      const isHttpUrl =
        trimmedImage.length <= 2048 &&
        (trimmedImage.startsWith('https://') ||
          trimmedImage.startsWith('http://') ||
          trimmedImage.startsWith('/'));

      if (!isDataImage && !isHttpUrl) {
        return {
          ok: false,
          message:
            'Profile picture must be a valid PNG, JPEG, WebP, or GIF image.',
        };
      }
      update.image = trimmedImage;
      hasField = true;
    } else {
      return { ok: false, message: 'Invalid profile image format.' };
    }
  }

  if (rawInput.theme !== undefined) {
    if (
      typeof rawInput.theme !== 'string' ||
      !SETTINGS_THEMES.includes(rawInput.theme as SettingsTheme)
    ) {
      return {
        ok: false,
        message: 'Theme must be light, dark, or system.',
      };
    }
    update.theme = rawInput.theme as SettingsTheme;
    hasField = true;
  }

  if (rawInput.timezone !== undefined) {
    if (
      typeof rawInput.timezone !== 'string' ||
      !isSupportedTimezone(rawInput.timezone)
    ) {
      return {
        ok: false,
        message: 'Please select a valid IANA timezone.',
      };
    }
    update.timezone = rawInput.timezone.trim();
    hasField = true;
  }

  if (rawInput.weekStartsOn !== undefined) {
    const parsed =
      typeof rawInput.weekStartsOn === 'number'
        ? rawInput.weekStartsOn
        : Number(rawInput.weekStartsOn);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 6) {
      return {
        ok: false,
        message: 'Week start day must be between Sunday (0) and Saturday (6).',
      };
    }
    update.weekStartsOn = parsed;
    hasField = true;
  }

  if (!hasField) {
    return {
      ok: false,
      message: 'No settings fields were provided to update.',
    };
  }

  return { ok: true, value: update };
}

export function validateDeleteAccountConfirmation(
  rawInput: Record<string, unknown>
): { ok: true } | { ok: false; message: string } {
  const confirmation =
    typeof rawInput?.confirmation === 'string'
      ? rawInput.confirmation.trim()
      : '';
  if (confirmation !== 'DELETE') {
    return {
      ok: false,
      message: 'Please type DELETE in all caps to confirm account deletion.',
    };
  }
  return { ok: true };
}
