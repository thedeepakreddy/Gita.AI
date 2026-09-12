/**
 * Are the models this app is configured to use still being served?
 *
 *   npm run models:check
 *
 * WHY THIS EXISTS. Providers retire models on their own schedule, and this is
 * the most likely way a working installation breaks months after anyone last
 * touched it. Worse, it breaks *asymmetrically*: an existing key often keeps
 * reaching a retired model while every newly-issued key gets a 404. So it works
 * perfectly for whoever set it up and fails for everyone who arrives
 * afterwards — which, for an application being handed to somebody else, is
 * precisely the wrong way round.
 *
 * That is not hypothetical. The default here was `gemini-2.5-flash` until
 * Google answered a fresh key with:
 *
 *   404 — This model models/gemini-2.5-flash is no longer available to new
 *   users. Please update your code to use models/gemini-3.6-flash
 *
 * KEYS. This reads keys from the environment only; it never touches the
 * encrypted keys users have saved. Set whichever you want to check:
 *
 *   GEMINI_API_KEY=…  GROQ_API_KEY=…  OPENAI_API_KEY=…  ANTHROPIC_API_KEY=…
 *
 * TRIAL_API_KEY is used automatically for whichever provider TRIAL_PROVIDER
 * names. Providers with no key available are skipped and said to be skipped —
 * "no news" must never read as "all well".
 */

import { PROVIDERS, PROVIDER_META, ProviderError, validateKey } from '../src/lib/chat/providers';
import type { ProviderId } from '../src/lib/chat/providers';

const ENV_KEYS: Record<ProviderId, string> = {
  gemini: 'GEMINI_API_KEY',
  groq: 'GROQ_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
};

const MODEL_VARS: Record<ProviderId, string> = {
  gemini: 'GEMINI_MODEL',
  groq: 'GROQ_MODEL',
  openai: 'OPENAI_MODEL',
  anthropic: 'ANTHROPIC_MODEL',
};

function keyFor(provider: ProviderId): string | null {
  const own = process.env[ENV_KEYS[provider]];
  if (own) return own;
  if (process.env.TRIAL_PROVIDER === provider && process.env.TRIAL_API_KEY) {
    return process.env.TRIAL_API_KEY;
  }
  return null;
}

async function main() {
  console.log('\nChecking configured models against each provider.\n');

  let checked = 0;
  let failed = 0;
  const skipped: string[] = [];

  for (const provider of PROVIDERS) {
    const label = PROVIDER_META[provider].label;
    const model = process.env[MODEL_VARS[provider]] || '(default)';
    const key = keyFor(provider);

    if (!key) {
      skipped.push(`${label} — set ${ENV_KEYS[provider]} to check it`);
      continue;
    }

    checked++;
    process.stdout.write(`  ${label.padEnd(16)} `);
    try {
      await validateKey(provider, key);
      console.log(`ok    ${model}`);
    } catch (err) {
      failed++;
      const message = err instanceof ProviderError ? err.message : String(err);
      console.log(`FAIL  ${model}`);
      console.log(`                   ${message}`);
    }
  }

  if (skipped.length) {
    console.log('\n  Not checked:');
    for (const line of skipped) console.log(`    ${line}`);
  }

  console.log(
    `\n  ${checked} checked, ${failed} failing.` +
      (skipped.length ? ` ${skipped.length} skipped — that is not a pass.` : '')
  );
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
