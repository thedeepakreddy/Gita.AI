import type { Provenance } from './provenance';
import { NO_EXTERNAL_SOURCE } from './provenance';

/**
 * The ornamental cutouts and crops used as page furniture — rules, corner
 * pieces, the marginal plate.
 *
 * They are referenced by path directly from the pages that use them rather
 * than looked up here, so this file exists for one reason: to declare that
 * they have a known origin. `ship:check` reconciles this list against
 * public/manuscript/ and fails on any file that is not named here, which is
 * what stops art arriving with nothing said about where it came from.
 */

const ORIGINAL: Provenance = {
  title: 'Gita Counsel manuscript ornaments',
  artist: 'Created for Gita Counsel',
  date: '2026',
  holder: 'Gita Counsel',
  credit: 'Generated for Gita Counsel',
  url: NO_EXTERNAL_SOURCE,
  licence: 'Original work — project-owned',
};

/** Every file in public/manuscript/, each covered by the provenance above. */
export const MANUSCRIPT_FILES: readonly string[] = [
  'crop-3-aa09d5aa35ee.png',
  'cutout-1-b954c79aa9d9.png',
  'cutout-2-ab81ccaa223d.png',
  'cutout-20-28de926f7874.png',
  'cutout-29-d65c1e90e302.png',
  'cutout-30-d5135e6d235c.png',
  'cutout-36-471d44e40735.png',
  'cutout-48-d2708a62d8a4.png',
  'cutout-6-cab3f0ac6c33.png',
  'cutout-7-5e31485e2509.png',
];

export const MANUSCRIPT_PROVENANCE = ORIGINAL;
