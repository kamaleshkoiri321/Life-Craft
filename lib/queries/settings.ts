import { eq, sql } from 'drizzle-orm';
import { getDb, isDatabaseConfigured, schema } from '../db';
import {
  ensureUserProfile,
  type AuthenticatedUserIdentity,
} from './dashboard';
import {
  DEFAULT_TIMEZONE,
  resolveDisplayName,
  resolveValidTimezone,
} from './timezone';
import {
  validateDeleteAccountConfirmation,
  validateUpdateSettingsInput,
  type SettingsDataPayload,
  type SettingsTheme,
} from '../settings/settings-utils';
import { deletePrivateStorageObject } from '../storage/neon-storage';
import { sanitizeServerErrorMessage } from '../security/api-guard';

export type SettingsQueryResult =
  | { status: 'ok'; data: SettingsDataPayload }
  | { status: 'db_unconfigured'; message: string }
  | { status: 'db_error'; message: string };

export type SettingsMutationResult =
  | { status: 'ok'; data: SettingsDataPayload }
  | { status: 'validation_error'; message: string }
  | { status: 'db_unconfigured'; message: string }
  | { status: 'db_error'; message: string };

export type AccountDeleteResult =
  | { status: 'ok' }
  | { status: 'validation_error'; message: string }
  | { status: 'db_unconfigured'; message: string }
  | { status: 'db_error'; message: string };

type NeonAuthUserRow = {
  name: string | null;
  email: string | null;
  emailVerified: boolean | null;
  image: string | null;
  createdAt: string | Date | null;
};

type NeonAuthAccountRow = {
  providerId: string;
  hasPassword: boolean;
};

async function fetchNeonAuthAccountMeta(
  userId: string
): Promise<{
  authRow: NeonAuthUserRow | null;
  providers: string[];
  hasPasswordAccount: boolean;
}> {
  const db = getDb();
  try {
    const [userRes, accountRes] = await Promise.all([
      db.execute<NeonAuthUserRow>(sql`
        SELECT
          name,
          email,
          "emailVerified",
          image,
          "createdAt"
        FROM neon_auth."user"
        WHERE id::text = ${userId}
        LIMIT 1
      `),
      db.execute<NeonAuthAccountRow>(sql`
        SELECT
          "providerId",
          ("password" IS NOT NULL AND char_length("password") > 0) AS "hasPassword"
        FROM neon_auth.account
        WHERE "userId"::text = ${userId}
      `),
    ]);

    const authRow = userRes.rows[0] ?? null;
    const providerSet = new Set<string>();
    let hasPasswordAccount = false;

    for (const acc of accountRes.rows) {
      if (acc.providerId) {
        providerSet.add(acc.providerId);
      }
      if (acc.hasPassword || acc.providerId === 'credential') {
        hasPasswordAccount = true;
      }
    }

    return {
      authRow,
      providers: Array.from(providerSet),
      hasPasswordAccount,
    };
  } catch {
    return {
      authRow: null,
      providers: [],
      hasPasswordAccount: false,
    };
  }
}

export async function getSettingsForUser(
  authUser: AuthenticatedUserIdentity
): Promise<SettingsQueryResult> {
  if (!isDatabaseConfigured()) {
    return {
      status: 'db_unconfigured',
      message: 'Settings storage service is not configured.',
    };
  }

  try {
    const [{ profile, preferences }, authMeta] = await Promise.all([
      ensureUserProfile(authUser),
      fetchNeonAuthAccountMeta(authUser.id),
    ]);

    const displayName = resolveDisplayName(
      profile.displayName,
      authMeta.authRow?.name ?? authUser.name,
      authMeta.authRow?.email ?? authUser.email
    );

    const rawTheme = preferences.theme;
    const theme: SettingsTheme =
      rawTheme === 'dark' || rawTheme === 'system' ? rawTheme : 'light';

    const weekStartsOn =
      typeof preferences.weekStartsOn === 'number' &&
      preferences.weekStartsOn >= 0 &&
      preferences.weekStartsOn <= 6
        ? preferences.weekStartsOn
        : 1;

    const image =
      authMeta.authRow !== null
        ? authMeta.authRow.image ?? null
        : (authUser.image ?? null);

    const email = authMeta.authRow?.email || authUser.email;
    const emailVerified =
      authMeta.authRow?.emailVerified !== undefined &&
      authMeta.authRow?.emailVerified !== null
        ? Boolean(authMeta.authRow.emailVerified)
        : Boolean(authUser.emailVerified);

    const createdAtIso = authMeta.authRow?.createdAt
      ? new Date(authMeta.authRow.createdAt).toISOString()
      : profile.createdAt
        ? new Date(profile.createdAt).toISOString()
        : null;

    return {
      status: 'ok',
      data: {
        profile: {
          userId: authUser.id,
          displayName,
          email,
          emailVerified,
          image,
          timezone: resolveValidTimezone(profile.timezone || DEFAULT_TIMEZONE),
        },
        preferences: {
          theme,
          weekStartsOn,
        },
        account: {
          providers: authMeta.providers,
          hasPasswordAccount: authMeta.hasPasswordAccount,
          createdAt: createdAtIso,
        },
      },
    };
  } catch (err) {
    console.error('[LifeCraft Settings] Failed to load settings:', err);
    return {
      status: 'db_error',
      message: sanitizeServerErrorMessage(
        err,
        'Unable to load your settings right now. Please try again.'
      ),
    };
  }
}

export async function updateSettingsForUser(
  authUser: AuthenticatedUserIdentity,
  rawInput: Record<string, unknown>
): Promise<SettingsMutationResult> {
  if (!isDatabaseConfigured()) {
    return {
      status: 'db_unconfigured',
      message: 'Database is not configured.',
    };
  }

  const validation = validateUpdateSettingsInput(rawInput);
  if (!validation.ok) {
    return {
      status: 'validation_error',
      message: validation.message,
    };
  }

  try {
    const db = getDb();
    await ensureUserProfile(authUser);

    const { displayName, image, theme, timezone, weekStartsOn } =
      validation.value;
    const now = new Date();

    if (displayName !== undefined || timezone !== undefined) {
      const profilePatch: {
        displayName?: string;
        timezone?: string;
        updatedAt: Date;
      } = { updatedAt: now };

      if (displayName !== undefined) {
        profilePatch.displayName = displayName;
      }
      if (timezone !== undefined) {
        profilePatch.timezone = resolveValidTimezone(timezone);
      }

      await db
        .update(schema.userProfiles)
        .set(profilePatch)
        .where(eq(schema.userProfiles.userId, authUser.id));
    }

    if (theme !== undefined || weekStartsOn !== undefined) {
      const prefPatch: {
        theme?: SettingsTheme;
        weekStartsOn?: number;
        updatedAt: Date;
      } = { updatedAt: now };

      if (theme !== undefined) {
        prefPatch.theme = theme;
      }
      if (weekStartsOn !== undefined) {
        prefPatch.weekStartsOn = weekStartsOn;
      }

      await db
        .update(schema.userPreferences)
        .set(prefPatch)
        .where(eq(schema.userPreferences.userId, authUser.id));
    }

    // Synchronize displayName / avatar image with neon_auth."user" for the authenticated user
    if (displayName !== undefined && image !== undefined) {
      await db.execute(sql`
        UPDATE neon_auth."user"
        SET
          name = ${displayName},
          image = ${image},
          "updatedAt" = now()
        WHERE id::text = ${authUser.id}
      `);
    } else if (displayName !== undefined) {
      await db.execute(sql`
        UPDATE neon_auth."user"
        SET
          name = ${displayName},
          "updatedAt" = now()
        WHERE id::text = ${authUser.id}
      `);
    } else if (image !== undefined) {
      await db.execute(sql`
        UPDATE neon_auth."user"
        SET
          image = ${image},
          "updatedAt" = now()
        WHERE id::text = ${authUser.id}
      `);
    }

    return await getSettingsForUser(authUser);
  } catch (err) {
    console.error('[LifeCraft Settings] Failed to update settings:', err);
    return {
      status: 'db_error',
      message: sanitizeServerErrorMessage(
        err,
        'Could not save your settings changes. Please try again.'
      ),
    };
  }
}

export async function deleteAccountForUser(
  authUser: AuthenticatedUserIdentity,
  rawInput: Record<string, unknown>
): Promise<AccountDeleteResult> {
  if (!isDatabaseConfigured()) {
    return {
      status: 'db_unconfigured',
      message: 'Database is not configured.',
    };
  }

  const validation = validateDeleteAccountConfirmation(rawInput);
  if (!validation.ok) {
    return {
      status: 'validation_error',
      message: validation.message,
    };
  }

  try {
    const db = getDb();

    // 1. Best-effort cleanup of any private library book files owned by this user
    try {
      const ownedBooks = await db
        .select({
          storageBucket: schema.libraryItems.storageBucket,
          storageKey: schema.libraryItems.storageKey,
        })
        .from(schema.libraryItems)
        .where(eq(schema.libraryItems.userId, authUser.id));

      for (const item of ownedBooks) {
        if (item.storageBucket && item.storageKey) {
          await deletePrivateStorageObject({
            bucket: item.storageBucket,
            storageKey: item.storageKey,
          }).catch(() => {});
        }
      }
    } catch {
      // Continue with database account deletion even if storage cleanup encounters an error
    }

    // 2. Delete all user application data in public schema (cascades tasks, habits, goals, notes, library, preferences)
    await db.execute(sql`
      DELETE FROM public.focus_sessions
      WHERE user_id::text = ${authUser.id}
    `);

    await db
      .delete(schema.userProfiles)
      .where(eq(schema.userProfiles.userId, authUser.id));

    // 3. Delete user sessions, accounts, and user record from neon_auth schema
    await db.execute(sql`
      DELETE FROM neon_auth.session
      WHERE "userId"::text = ${authUser.id}
    `);

    await db.execute(sql`
      DELETE FROM neon_auth.account
      WHERE "userId"::text = ${authUser.id}
    `);

    await db.execute(sql`
      DELETE FROM neon_auth."user"
      WHERE id::text = ${authUser.id}
    `);

    return { status: 'ok' };
  } catch (err) {
    console.error('[LifeCraft Settings] Failed to delete account:', err);
    return {
      status: 'db_error',
      message: sanitizeServerErrorMessage(
        err,
        'Could not delete your account right now. Please try again.'
      ),
    };
  }
}
