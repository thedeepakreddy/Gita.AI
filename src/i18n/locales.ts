/**
 * Single source of truth for supported locales.
 *
 * To add a language:
 *   1. add its code here + an entry in `localeMeta`
 *   2. add `messages/<code>.json`
 *   3. add the `<code>` key to translations in /data/verses/**.json
 * Nothing else in the app hardcodes a locale list.
 */

export const locales = ['en', 'hu', 'hi'] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

export type LocaleMeta = {
  /** Name in English, for admin/debug surfaces. */
  label: string;
  /** Name in its own language, for the user-facing switcher. */
  nativeLabel: string;
  dir: 'ltr' | 'rtl';
};

export const localeMeta: Record<Locale, LocaleMeta> = {
  en: { label: 'English', nativeLabel: 'English', dir: 'ltr' },
  hu: { label: 'Hungarian', nativeLabel: 'Magyar', dir: 'ltr' },
  hi: { label: 'Hindi', nativeLabel: 'हिन्दी', dir: 'ltr' },
};

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}
