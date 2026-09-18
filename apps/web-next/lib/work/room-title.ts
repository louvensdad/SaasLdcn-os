/** The longest name a project room is given from its idea; the room keeps the whole idea as `raw_intent`. */
export const ROOM_TITLE_MAX = 60;

/**
 * A project room's name, taken from the idea that opens it: its first sentence, whole when it fits. A longer sentence
 * is cut at the last word that fits and marked with an ellipsis, so a name never ends in half a word ("projetos e t").
 * A full stop inside a word ("Next.js") does not end the sentence; only one followed by a space does.
 */
export function roomTitleFrom(intent: string): string {
  const cleaned = intent.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  const first = cleaned.split(/(?<=[.!?])\s/)[0]!.replace(/[.!?]+$/, '').trim() || cleaned;
  if (first.length <= ROOM_TITLE_MAX) return first;
  const window = first.slice(0, ROOM_TITLE_MAX);
  const space = window.lastIndexOf(' ');
  const cut = space >= 24 ? window.slice(0, space) : first.slice(0, ROOM_TITLE_MAX - 1);
  return `${cut.replace(/[\s,;:.–—-]+$/, '')}…`;
}
