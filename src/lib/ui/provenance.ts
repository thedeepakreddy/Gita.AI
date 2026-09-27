/**
 * Where every piece of artwork in this application came from.
 *
 * THE RULE: any image shipped to a reader declares its origin and its licence,
 * and nothing enforces that except this type and `npm run ship:check`.
 *
 * It is here because the rule was already broken once. The first set of
 * backgrounds came from stock sites, print shops and image boards, carried no
 * rights metadata, and nothing in the codebase objected. That was fixed by
 * making provenance required on `Background` — and then twenty new images
 * arrived under a *different* type, with no provenance at all, and the gate
 * reported "7 backgrounds, all open-licensed" while being blind to every one
 * of them.
 *
 * So provenance lives in one shared shape now, and ship:check reconciles the
 * manifests against the directories on disk: an image file that no manifest
 * declares fails the build. Adding art without saying where it came from is
 * meant to be impossible, not merely discouraged.
 */

export type Provenance = {
  /** What the work is called. */
  title: string;
  /** Who made it. "Unknown" is an acceptable answer; blank is not. */
  artist: string;
  /** When, however approximate. */
  date: string;
  /** Who holds it — a museum, or this project for original work. */
  holder: string;
  /** The credit line as the holder gives it, or how you wish to be credited. */
  credit: string;
  /**
   * Somewhere the claim can be checked: an accession page for a museum work.
   * Original work created for this project has nothing external to point at,
   * so it uses the sentinel below rather than a fake URL.
   */
  url: string;
  /** The licence, in a form `isOpenLicence` recognises. */
  licence: string;
};

/**
 * For work with no external source to link to. Distinct from an empty string,
 * which means "nobody filled this in" — the two must never look alike.
 */
export const NO_EXTERNAL_SOURCE = 'internal:original-work';

/**
 * Licences this project will ship. Deliberately narrow: "probably fine" and
 * "found on a site that did not say otherwise" are not licences, and this is
 * the line where that gets caught.
 */
export function isOpenLicence(licence: string): boolean {
  return /^(CC0|Public domain|CC BY(-SA)?[\s\d]|Original work)/i.test(licence.trim());
}

/** Every provenance field filled in, with a licence this project accepts. */
export function isFullyAttributed(p: Provenance): boolean {
  const complete = (['title', 'artist', 'date', 'holder', 'credit', 'url', 'licence'] as const).every(
    (field) => typeof p[field] === 'string' && p[field].trim().length > 0
  );
  const checkable = p.url === NO_EXTERNAL_SOURCE || p.url.startsWith('https://');
  return complete && checkable && isOpenLicence(p.licence);
}
