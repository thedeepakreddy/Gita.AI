import type { TranslationStatus } from './types';

/**
 * How much a piece of translated text may be trusted, and what must be said
 * about it.
 *
 * THE RULE: only `reviewed` text is shown without a caveat. Everything else
 * carries one.
 *
 * This exists because the rule was previously written out by hand at each call
 * site as `status === 'placeholder'`, and when a third status arrived the
 * checks silently stopped matching. 656 verses of unreviewed OCR draft rendered
 * to Hungarian readers looking exactly like finished scripture — no note, no
 * hedge, nothing. The condition was wrong in three files at once, which is what
 * happens when a rule lives in three files.
 */
export type Confidence = 'reviewed' | 'placeholder' | 'in-review';

export function confidenceOf(status: TranslationStatus | undefined): Confidence {
  if (status === 'reviewed') return 'reviewed';
  if (status === 'in-review') return 'in-review';
  return 'placeholder';
}

/** True when the reader must be told something about this text. */
export function needsCaveat(status: TranslationStatus | undefined): boolean {
  return confidenceOf(status) !== 'reviewed';
}

/** The `disclaimer` message key for a given status, or null when none is needed. */
export function caveatKey(status: TranslationStatus | undefined): 'placeholderData' | 'inReviewData' | null {
  const c = confidenceOf(status);
  if (c === 'reviewed') return null;
  return c === 'in-review' ? 'inReviewData' : 'placeholderData';
}
