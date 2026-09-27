import type { Provenance } from './provenance';
import { NO_EXTERNAL_SOURCE } from './provenance';

/**
 * Artwork shown behind a conversation.
 *
 * Provenance is REQUIRED on every entry, the same as it is for the reading
 * backgrounds. When these first landed they carried only a src, an epic and a
 * title, and `ship:check` — which reads the backgrounds manifest — happily
 * reported "7 backgrounds, all open-licensed" while ten undeclared images sat
 * beside them. A gate that cannot see an image cannot vouch for it.
 */

/**
 * These ten were made for this project, so there is no third party to credit
 * and nothing external to link to. That is a real provenance answer and it is
 * recorded as one — unlike a blank field, which means nobody knows.
 */
const ORIGINAL: Provenance = {
  title: 'Gita Counsel conversation artwork',
  artist: 'Created for Gita Counsel',
  date: '2026',
  holder: 'Gita Counsel',
  credit: 'Generated for Gita Counsel',
  url: NO_EXTERNAL_SOURCE,
  licence: 'Original work — project-owned',
};

export type ChatWallpaper = {
  src: string;
  epic: { en: string; hi: string; hu: string };
  /** The scene, shown to readers. Not the same thing as provenance.title. */
  title: { en: string; hi: string; hu: string };
  /** Required. An image with no declared origin must not compile. */
  provenance: Provenance;
};

export const CHAT_WALLPAPERS: ChatWallpaper[] = [
  {
    src: '/chat-wallpapers/ramayana-forest.jpg',
    epic: { en: 'Ramayana', hi: 'रामायण', hu: 'Rámájana' },
    title: { en: 'The forest exile', hi: 'वनवास', hu: 'Erdei száműzetés' },
    provenance: ORIGINAL,
  },
  {
    src: '/chat-wallpapers/ramayana-hanuman.jpg',
    epic: { en: 'Ramayana', hi: 'रामायण', hu: 'Rámájana' },
    title: { en: 'Hanuman at the sea', hi: 'समुद्र तट पर हनुमान', hu: 'Hanumán a tengernél' },
    provenance: ORIGINAL,
  },
  {
    src: '/chat-wallpapers/ramayana-ashoka.jpg',
    epic: { en: 'Ramayana', hi: 'रामायण', hu: 'Rámájana' },
    title: { en: 'Sita in the Ashoka grove', hi: 'अशोक वाटिका में सीता', hu: 'Szítá az Asóka ligetben' },
    provenance: ORIGINAL,
  },
  {
    src: '/chat-wallpapers/ramayana-bridge.jpg',
    epic: { en: 'Ramayana', hi: 'रामायण', hu: 'Rámájana' },
    title: { en: 'The bridge to Lanka', hi: 'लंका की ओर सेतु', hu: 'A híd Lanka felé' },
    provenance: ORIGINAL,
  },
  {
    src: '/chat-wallpapers/ramayana-ayodhya.jpg',
    epic: { en: 'Ramayana', hi: 'रामायण', hu: 'Rámájana' },
    title: { en: 'The return to Ayodhya', hi: 'अयोध्या वापसी', hu: 'Visszatérés Ajódhjába' },
    provenance: ORIGINAL,
  },
  {
    src: '/chat-wallpapers/mahabharata-chariot.jpg',
    epic: { en: 'Mahabharata', hi: 'महाभारत', hu: 'Mahábhárata' },
    title: { en: 'Counsel at Kurukshetra', hi: 'कुरुक्षेत्र में उपदेश', hu: 'Tanács Kuruksétránál' },
    provenance: ORIGINAL,
  },
  {
    src: '/chat-wallpapers/mahabharata-swayamvara.jpg',
    epic: { en: 'Mahabharata', hi: 'महाभारत', hu: 'Mahábhárata' },
    title: { en: 'Arjuna at the swayamvara', hi: 'स्वयंवर में अर्जुन', hu: 'Ardzsuna a szvajamvarán' },
    provenance: ORIGINAL,
  },
  {
    src: '/chat-wallpapers/mahabharata-forest.jpg',
    epic: { en: 'Mahabharata', hi: 'महाभारत', hu: 'Mahábhárata' },
    title: { en: 'The Pandavas in exile', hi: 'वनवास में पांडव', hu: 'A Pándavák száműzetésben' },
    provenance: ORIGINAL,
  },
  {
    src: '/chat-wallpapers/mahabharata-lake.jpg',
    epic: { en: 'Mahabharata', hi: 'महाभारत', hu: 'Mahábhárata' },
    title: { en: 'Questions at the lake', hi: 'सरोवर के प्रश्न', hu: 'Kérdések a tónál' },
    provenance: ORIGINAL,
  },
  {
    src: '/chat-wallpapers/mahabharata-peace.jpg',
    epic: { en: 'Mahabharata', hi: 'महाभारत', hu: 'Mahábhárata' },
    title: { en: 'Krishna seeks peace', hi: 'शांति के लिए कृष्ण', hu: 'Krisna békét keres' },
    provenance: ORIGINAL,
  },
];

export function chatWallpaperIndex(id: string, storedIndex: number | null | undefined): number {
  if (
    Number.isInteger(storedIndex) &&
    storedIndex !== null &&
    storedIndex !== undefined &&
    storedIndex >= 0 &&
    storedIndex < CHAT_WALLPAPERS.length
  ) {
    return storedIndex;
  }

  // Existing conversations predate the field. Hash their IDs to a stable
  // image rather than changing artwork whenever the sidebar order changes.
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % CHAT_WALLPAPERS.length;
}

export function nextChatWallpaperIndex(
  conversations: { id: string; wallpaperIndex: number | null }[]
): number {
  const counts = Array(CHAT_WALLPAPERS.length).fill(0) as number[];
  for (const conversation of conversations) {
    counts[chatWallpaperIndex(conversation.id, conversation.wallpaperIndex)] += 1;
  }
  const lowestCount = Math.min(...counts);
  return counts.findIndex((count) => count === lowestCount);
}
