'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

import {
  BACKGROUNDS,
  BACKGROUND_FADE_MS,
  BACKGROUND_INTERVAL_MS,
} from '@/lib/ui/backgrounds';

/**
 * The background artwork, crossfading every few seconds.
 *
 * SCALING. Each image is `fill` + `object-cover` with `sizes="100vw"`, so Next
 * serves a WebP/AVIF resized to the reader's actual device width rather than
 * the 1920px original — a phone downloads a phone-sized image. `object-cover`
 * then fills whatever shape the viewport is without ever distorting the art;
 * what varies is how much gets cropped, which is what `position` in the
 * manifest is for.
 *
 * LOADING. Only the first image is `priority`; the rest mount one at a time as
 * the slideshow reaches them, so the first paint costs one image rather than
 * seven. By the end of a cycle they are all in the browser cache and every
 * later transition is instant.
 *
 * WHEN IT DOES NOT RUN:
 *   - `prefers-reduced-motion`. Something moving behind text is exactly what
 *     that setting is for, and a person who has asked for stillness while
 *     reading scripture should get it. They see the first image, held.
 *   - While the tab is hidden. Nobody is looking; decoding images and burning
 *     battery for it is waste.
 *   - When there is only one image.
 */
export function BackgroundSlideshow() {
  const [index, setIndex] = useState(0);
  /** Highest index mounted so far, so images load as they are reached. */
  const [reached, setReached] = useState(0);
  const [animate, setAnimate] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (BACKGROUNDS.length < 2) return;

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    const stop = () => {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    };

    const start = () => {
      stop();
      if (motionQuery.matches || document.visibilityState === 'hidden') return;
      setAnimate(true);
      // The updater stays pure: no other setState inside it. React double-
      // invokes updaters in development to surface exactly that kind of hidden
      // side effect, and an advance that fires twice or not at all is a
      // miserable thing to chase through a slideshow. Mounting the next image
      // is a consequence of the index changing, so it belongs in an effect
      // that watches the index.
      timer.current = setInterval(() => {
        setIndex((i) => (i + 1) % BACKGROUNDS.length);
      }, BACKGROUND_INTERVAL_MS);
    };

    start();
    motionQuery.addEventListener('change', start);
    document.addEventListener('visibilitychange', start);

    return () => {
      stop();
      motionQuery.removeEventListener('change', start);
      document.removeEventListener('visibilitychange', start);
    };
  }, []);

  // Mount one image ahead of the one showing, so the next is already decoded
  // when its turn comes and the crossfade has something to fade to.
  useEffect(() => {
    setReached((r) => Math.max(r, Math.min(index + 1, BACKGROUNDS.length - 1)));
  }, [index]);

  return (
    // Decorative: the artwork carries no information the reader needs, and
    // announcing a new painting every eight seconds would be noise in a screen
    // reader. Hidden from the accessibility tree, alt deliberately empty.
    <div
      className="fixed inset-0 -z-10"
      aria-hidden="true"
      // Exposed so the slideshow can be asserted on from outside without
      // reaching into React internals. Cheap, and this is otherwise a
      // component whose only output is a slow visual change.
      data-bg-index={index}
      data-bg-reached={reached}
      data-bg-running={timer.current ? 'yes' : 'no'}
    >
      {BACKGROUNDS.slice(0, reached + 1).map((background, i) => (
        <Image
          key={background.src}
          src={background.src}
          alt=""
          fill
          // One source, every screen: Next emits a srcset and the browser takes
          // the width it actually needs.
          sizes="100vw"
          quality={82}
          priority={i === 0}
          className="object-cover"
          style={{
            objectPosition: background.position,
            opacity: i === index ? 1 : 0,
            transition: animate ? `opacity ${BACKGROUND_FADE_MS}ms ease-in-out` : 'none',
          }}
        />
      ))}

      {/* Per-image, not fixed: see `scrim` in the manifest. Transitioned on the
          same curve as the crossfade, or a dark leaf following a pale one
          would visibly flash as the overlay jumped. */}
      <div
        className="absolute inset-0 bg-black"
        style={{
          opacity: BACKGROUNDS[index]?.scrim ?? 0.4,
          transition: animate ? `opacity ${BACKGROUND_FADE_MS}ms ease-in-out` : 'none',
        }}
      />
    </div>
  );
}
