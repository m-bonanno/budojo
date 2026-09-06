import { describe, expect, it } from 'vitest';

import { driveClientConfig } from './drive-wiring.js';

/**
 * Where the Google OAuth client comes from (#1331).
 *
 * The bug this closes was a **comment**, which is the hardest kind to see:
 * `drive-wiring.ts` and `desktop/CLAUDE.md` both said the client was "read
 * from the environment at build time", and it was read from the environment at
 * *launch* time — on the end user's machine, where those variables have never
 * been set and never will be. Nothing substituted anything: `tsc` performs no
 * substitution, `electron-builder.yml` defined nothing, and `release.yml` did
 * not mention the variables at all.
 *
 * So the whole of #1301 was unreachable in every installer ever shipped, and
 * setting the two GitHub secrets — the obvious fix — would have changed
 * nothing at all.
 */
describe('driveClientConfig', () => {
  const baked = {
    budojoGoogleClientId: 'baked-id.apps.googleusercontent.com',
    budojoGoogleClientSecret: 'baked-secret',
  };

  it('uses what the packaging step baked into the artefact', () => {
    expect(driveClientConfig(baked, {})).toEqual({
      clientId: 'baked-id.apps.googleusercontent.com',
      clientSecret: 'baked-secret',
    });
  });

  it('ignores the environment entirely when nothing was baked', () => {
    // The heart of #1331. A packaged build passes `{}` as the environment, so
    // this is not "the user has not set it" — it is "the user CANNOT set it".
    // Anything else means a feature whose identity depends on a variable on
    // someone else's machine.
    expect(driveClientConfig({}, {})).toBeNull();
  });

  it('falls back to the environment only when one is handed to it', () => {
    // `npm run dev` passes `process.env` deliberately, so the flow can be
    // exercised without a packaged build. Nothing in the shipped app does.
    const config = driveClientConfig(
      {},
      { BUDOJO_GOOGLE_CLIENT_ID: 'dev-id', BUDOJO_GOOGLE_CLIENT_SECRET: 'dev-secret' },
    );

    expect(config).toEqual({ clientId: 'dev-id', clientSecret: 'dev-secret' });
  });

  it('prefers the baked client over a development one', () => {
    const config = driveClientConfig(baked, {
      BUDOJO_GOOGLE_CLIENT_ID: 'dev-id',
      BUDOJO_GOOGLE_CLIENT_SECRET: 'dev-secret',
    });

    // A developer with their own client in the shell must not silently change
    // the identity of a build they are testing.
    expect(config?.clientId).toBe('baked-id.apps.googleusercontent.com');
  });

  it('treats a half-configured client as no client', function (): void {
    // One value without the other cannot complete an OAuth flow. Returning it
    // would put a Connect button on screen that opens a Google error page —
    // worse than the card being absent.
    expect(driveClientConfig({ budojoGoogleClientId: 'only-an-id' }, {})).toBeNull();
    expect(driveClientConfig({ budojoGoogleClientSecret: 'only-a-secret' }, {})).toBeNull();
  });

  it('treats blank and whitespace as unset', () => {
    // What a CI secret that was never populated actually expands to: an empty
    // string, not an absent key. Without this the feature would look
    // configured and fail at Google.
    expect(driveClientConfig({ budojoGoogleClientId: '   ', budojoGoogleClientSecret: 'x' }, {})).toBeNull();
    expect(driveClientConfig({ budojoGoogleClientId: 'x', budojoGoogleClientSecret: '' }, {})).toBeNull();
  });

  it('refuses metadata that is not a pair of strings', () => {
    // `extraMetadata` is JSON assembled by a shell command; a mis-quoted
    // argument can land any shape here. Trusting it would push a non-string
    // into the OAuth URL.
    expect(driveClientConfig({ budojoGoogleClientId: 42, budojoGoogleClientSecret: 'x' }, {})).toBeNull();
    expect(driveClientConfig({ budojoGoogleClientId: null, budojoGoogleClientSecret: null }, {})).toBeNull();
  });

  it('trims what it is given, because a shell argument collects spaces', () => {
    expect(driveClientConfig({ budojoGoogleClientId: ' id ', budojoGoogleClientSecret: ' secret ' }, {}))
      .toEqual({ clientId: 'id', clientSecret: 'secret' });
  });
});
