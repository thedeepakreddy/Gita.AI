/**
 * Locally generated, lightweight chat artwork. Each conversation stores one
 * index so the image stays the same when it is reopened on another device.
 */
export const CHAT_WALLPAPERS = [
  {
    src: '/chat-wallpapers/ramayana-forest.jpg',
    epic: { en: 'Ramayana', hi: 'रामायण', hu: 'Rámájana' },
    title: { en: 'The forest exile', hi: 'वनवास', hu: 'Erdei száműzetés' },
  },
  {
    src: '/chat-wallpapers/ramayana-hanuman.jpg',
    epic: { en: 'Ramayana', hi: 'रामायण', hu: 'Rámájana' },
    title: { en: 'Hanuman at the sea', hi: 'समुद्र तट पर हनुमान', hu: 'Hanumán a tengernél' },
  },
  {
    src: '/chat-wallpapers/ramayana-ashoka.jpg',
    epic: { en: 'Ramayana', hi: 'रामायण', hu: 'Rámájana' },
    title: { en: 'Sita in the Ashoka grove', hi: 'अशोक वाटिका में सीता', hu: 'Szítá az Asóka ligetben' },
  },
  {
    src: '/chat-wallpapers/ramayana-bridge.jpg',
    epic: { en: 'Ramayana', hi: 'रामायण', hu: 'Rámájana' },
    title: { en: 'The bridge to Lanka', hi: 'लंका की ओर सेतु', hu: 'A híd Lanka felé' },
  },
  {
    src: '/chat-wallpapers/ramayana-ayodhya.jpg',
    epic: { en: 'Ramayana', hi: 'रामायण', hu: 'Rámájana' },
    title: { en: 'The return to Ayodhya', hi: 'अयोध्या वापसी', hu: 'Visszatérés Ajódhjába' },
  },
  {
    src: '/chat-wallpapers/mahabharata-chariot.jpg',
    epic: { en: 'Mahabharata', hi: 'महाभारत', hu: 'Mahábhárata' },
    title: { en: 'Counsel at Kurukshetra', hi: 'कुरुक्षेत्र में उपदेश', hu: 'Tanács Kuruksétránál' },
  },
  {
    src: '/chat-wallpapers/mahabharata-swayamvara.jpg',
    epic: { en: 'Mahabharata', hi: 'महाभारत', hu: 'Mahábhárata' },
    title: { en: 'Arjuna at the swayamvara', hi: 'स्वयंवर में अर्जुन', hu: 'Ardzsuna a szvajamvarán' },
  },
  {
    src: '/chat-wallpapers/mahabharata-forest.jpg',
    epic: { en: 'Mahabharata', hi: 'महाभारत', hu: 'Mahábhárata' },
    title: { en: 'The Pandavas in exile', hi: 'वनवास में पांडव', hu: 'A Pándavák száműzetésben' },
  },
  {
    src: '/chat-wallpapers/mahabharata-lake.jpg',
    epic: { en: 'Mahabharata', hi: 'महाभारत', hu: 'Mahábhárata' },
    title: { en: 'Questions at the lake', hi: 'सरोवर के प्रश्न', hu: 'Kérdések a tónál' },
  },
  {
    src: '/chat-wallpapers/mahabharata-peace.jpg',
    epic: { en: 'Mahabharata', hi: 'महाभारत', hu: 'Mahábhárata' },
    title: { en: 'Krishna seeks peace', hi: 'शांति के लिए कृष्ण', hu: 'Krisna békét keres' },
  },
] as const;

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
