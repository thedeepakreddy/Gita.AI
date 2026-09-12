/**
 * The rotating background artwork.
 *
 * EVERY IMAGE HERE IS CC0. Not "probably out of copyright", not "found on a
 * site that did not say otherwise" — each one is a museum's own public-domain
 * dedication, with an accession page you can open and check.
 *
 * That is not fussiness. This application is going to a temple, and every other
 * piece of content in it already carries a translator, a source and a licence
 * (see translation_meta in src/lib/verses/types.ts). Decorating it with art of
 * unknown origin would be the same mistake as shipping an unreviewed
 * translation, and the project already refuses to make that one.
 *
 * The previous set — seven images from stock sites, print shops and Reddit —
 * was removed for exactly this reason. None carried rights metadata, and a
 * licence cannot be read off a file; it comes from knowing where the file came
 * from. If you cannot answer "where is this from, and who says I may use it",
 * the image does not go in this list.
 *
 * ADDING ONE. Drop the file in public/backgrounds/, add an entry, and fill in
 * every field. `credit`, `licence` and `url` are REQUIRED by the type, so an
 * image with no provenance will not compile. That is deliberate.
 *
 * Good sources, all with public APIs and genuine CC0 dedications:
 *   Cleveland Museum of Art   openaccess-api.clevelandart.org  (cc0=1)
 *   The Metropolitan Museum   collectionapi.metmuseum.org      (isPublicDomain)
 *   Smithsonian Open Access   api.si.edu
 */

export type Background = {
  src: string;
  /**
   * Where to anchor the crop. These are manuscript folios and range from 0.67
   * (tall) to 1.45 (wide), while a viewport is whatever the reader's screen
   * happens to be — so every image is centre-cropped somewhere. This decides
   * *which* part survives on a shape it was never painted for.
   */
  position: string;
  /** Maintainer's note on the crop or the scene. Not shown to readers. */
  note: string;
  /**
   * How heavily to darken this image, 0–1.
   *
   * Every page puts white text over the artwork, and these folios run from 116
   * to 164 mean luminance — bright paper, gold leaf, pale washes. One fixed
   * overlay cannot serve both ends of that: what makes the palest leaf legible
   * turns the darkest one to mud. So each is darkened by the amount that lands
   * it near the same effective luminance, computed from the file rather than
   * guessed. Regenerate with the snippet in README if you change the set.
   */
  scrim: number;

  // --- Provenance. All required: an image without it must not compile. ---
  title: string;
  artist: string;
  date: string;
  /** The museum holding the work. */
  holder: string;
  /** The institution's own credit line, reproduced as given. */
  credit: string;
  /** The accession page, so any claim here can be checked. */
  url: string;
  licence: string;
};

export const BACKGROUNDS: Background[] = [
  {
    src: '/backgrounds/battle-scene-at-kurukshetra.jpg',
    position: 'center',
    note: 'The armies engaged — the setting of the Gita itself.',
    scrim: 0.44,
    title: 'Battle Scene at Kurukshetra from the Mahabharata War (verso), from a Kalighat album',
    artist: 'Shri Gobinda Chandra Roy (Indian, active late 1800s)',
    date: 'c. 1890',
    holder: 'Cleveland Museum of Art',
    credit: 'Gift of William E. Ward in memory of his wife, Evelyn Svec Ward',
    url: 'https://clevelandart.org/art/2003.111.b',
    licence: 'CC0 1.0 (public domain dedication)',
  },
  {
    src: '/backgrounds/krishna-govardhan-harivamsa.jpg',
    position: 'center 35%',
    note: 'Tall folio (0.73): the raised arm and hill are in the upper half, and a centred crop loses them.',
    scrim: 0.36,
    title: '"Krishna Holds Up Mount Govardhan to Shelter the Villagers of Braj", Folio from a Harivamsa (The Legend of Hari (Krishna))',
    artist: 'Unknown',
    date: 'ca. 1590–95',
    holder: 'The Metropolitan Museum of Art',
    credit: 'Purchase, Edward C. Moore Jr. Gift, 1928',
    url: 'https://www.metmuseum.org/art/collection/search/448183',
    licence: 'CC0 1.0 (public domain dedication)',
  },
  {
    src: '/backgrounds/draupadi-rescued-from-abduction.jpg',
    position: 'center',
    note: 'A Mahabharata folio.',
    scrim: 0.5,
    title: 'Draupadi Rescued from Abduction, from a Mahabharata',
    artist: 'Unknown',
    date: 'c. 1615',
    holder: 'Cleveland Museum of Art',
    credit: 'Purchase and partial gift from the Catherine and Ralph Benkaim Collection; Severance and Greta Millikin Purchase Fund',
    url: 'https://clevelandart.org/art/2018.189',
    licence: 'CC0 1.0 (public domain dedication)',
  },
  {
    src: '/backgrounds/a-charioteer-riding-through.jpg',
    position: 'center 40%',
    note: 'Tall Razmnama folio (0.67): the chariot sits above centre.',
    scrim: 0.43,
    title: 'A charioteer riding through a rocky landscape with an entourage of footmen and musicians, page from a Razm-nama (Book of Wars) adapted from the Sanskrit Mahabharata and translated into Persian by Mir Ghiyath al-Din Ali Qazvini, known as Naqib Khan (Persian, d. 1614)',
    artist: 'Yusuf Ali (Indian, active early 1600s)',
    date: '1616–17',
    holder: 'Cleveland Museum of Art',
    credit: 'Gift in honor of Madeline Neves Clapp; Gift of Mrs. Henry White Cannon by exchange; Bequest of Louise T. Cooper; Leonard C. Hanna Jr. Fund; From the Catherine and Ralph Benkaim Collection',
    url: 'https://clevelandart.org/art/2013.322',
    licence: 'CC0 1.0 (public domain dedication)',
  },
  {
    src: '/backgrounds/krishna-returns-with-the.jpg',
    position: 'center 45%',
    note: 'The herds fill the lower half of the page.',
    scrim: 0.36,
    title: 'Krishna returns with the cowherds to Braj, from a Bhagavata Purana',
    artist: 'Unknown',
    date: 'c. 1830',
    holder: 'Cleveland Museum of Art',
    credit: 'Gift of Mr. and Mrs. John D. MacDonald',
    url: 'https://clevelandart.org/art/1971.301',
    licence: 'CC0 1.0 (public domain dedication)',
  },
  {
    src: '/backgrounds/nanda-elders-council.jpg',
    position: 'center',
    note: 'Elders in council — apt for an app about counsel.',
    scrim: 0.49,
    title: 'Nanda and the Elders in Council with the Cowherds, from a Bhagavata Purana',
    artist: 'Unknown',
    date: 'c. 1690–1700',
    holder: 'Cleveland Museum of Art',
    credit: 'Purchase and partial gift from the Catherine and Ralph Benkaim Collection; Severance and Greta Millikin Purchase Fund',
    url: 'https://clevelandart.org/art/2018.192',
    licence: 'CC0 1.0 (public domain dedication)',
  },
  {
    src: '/backgrounds/krishna-summoning-cows.jpg',
    position: 'center 40%',
    note: 'Figures sit above the midline.',
    scrim: 0.29,
    title: 'Krishna summoning the cows',
    artist: 'Unknown',
    date: 'c. 1780–90',
    holder: 'Cleveland Museum of Art',
    credit: 'Bequest of Mrs. Severance A. Millikin',
    url: 'https://clevelandart.org/art/1989.339',
    licence: 'CC0 1.0 (public domain dedication)',
  },
];

/** How long each image is held, in milliseconds. */
export const BACKGROUND_INTERVAL_MS = 8_000;

/** Crossfade length. Comfortably shorter than the interval, or they overlap. */
export const BACKGROUND_FADE_MS = 1_600;
