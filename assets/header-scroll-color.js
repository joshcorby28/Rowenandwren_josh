/*
 * Header scroll colour
 * --------------------
 * Dynamically inverts the header — transparent background + white contents —
 * whenever what sits directly behind the sticky header is NOT a plain white
 * background. That covers coloured/dark section backgrounds as well as
 * full-bleed background media (the hero, section background image/video, the
 * blog article featured image). When a white background scrolls back behind the
 * header the default (solid) header is restored.
 *
 * Detection is geometric, evaluated on scroll, so full-bleed media that lives
 * *inside* an otherwise-white section (e.g. the featured image in the blog
 * `main-blog-post` section) is recognised on its own — not lumped in with the
 * section's background colour.
 *
 * This script only measures and toggles the `data-scroll-inverse` attribute on
 * `#header-component`. All colour/opacity changes — and the smooth transition
 * between the two states — live in CSS (see the `{% stylesheet %}` block in
 * `sections/header.liquid`).
 */
(function () {
  const header = document.querySelector('#header-component');
  if (!header) return;

  // The feature can be disabled from the header section settings.
  if (header.dataset.scrollAdaptive === 'false') return;

  // A background counts as "white" (keep the default header) when every channel
  // is at least this bright. Anything darker or more saturated — and any media
  // behind the header — flips it to the inverse treatment.
  const WHITE_MIN_CHANNEL = 236;
  // A media element must fill at least this fraction of the viewport width to
  // count as a full-bleed background rather than an inline thumbnail.
  const MEDIA_MIN_WIDTH_RATIO = 0.6;
  const MEDIA_MIN_HEIGHT = 60;

  // Only genuine full-bleed *background* media inverts the header — the hero,
  // section background image/video, and the blog article featured image. This
  // deliberately excludes ordinary content images (image blocks, product/blog
  // card thumbnails, placeholder SVGs, icons), which merely scroll past behind
  // the header and must not turn it white. Add `data-header-media` to any
  // custom element that should also count as a header background.
  const MEDIA_SELECTOR = [
    // Scoped to a real hero: the `hero__media` class is also reused for image
    // block placeholders (blocks/image.liquid), which are content, not a
    // header background, and must not invert the header.
    '.hero .hero__media',
    '.blog-post-featured-image__image',
    '.custom-section-background img',
    '.custom-section-background video',
    '.custom-section-background svg',
    '.section-background img',
    '.section-background video',
    '[data-header-media]',
  ].join(', ');

  const main = document.querySelector('.content-for-layout') || document.body;

  /** @type {HTMLElement[]} Full-bleed media elements (image/video/placeholder). */
  let mediaEls = [];
  /** @type {{ el: HTMLElement, white: boolean, z: number }[]} Opaque coloured backdrops. */
  let colorEls = [];
  let rafId = null;

  /**
   * Parse an `rgb()` / `rgba()` string into channels.
   * @param {string} value
   * @returns {{ r: number, g: number, b: number, a: number } | null}
   */
  function parseColor(value) {
    if (!value) return null;
    const match = value.match(/rgba?\(([^)]+)\)/i);
    if (!match) return null;
    const parts = match[1].split(/[,/\s]+/).filter(Boolean).map((p) => parseFloat(p));
    const [r, g, b] = parts;
    const a = parts.length > 3 ? parts[3] : 1;
    if ([r, g, b].some((n) => Number.isNaN(n))) return null;
    return { r, g, b, a };
  }

  /**
   * Is this background effectively white (or see-through onto the white page)?
   * @param {{ r: number, g: number, b: number, a: number } | null} color
   */
  function isWhite(color) {
    if (!color) return true; // couldn't read a colour -> assume the page's white
    if (color.a < 0.5) return true; // see-through -> reveals the (white) page behind
    return color.r >= WHITE_MIN_CHANNEL && color.g >= WHITE_MIN_CHANNEL && color.b >= WHITE_MIN_CHANNEL;
  }

  /** Rebuild the media/colour candidate lists. Cheap; only runs on refresh. */
  function collect() {
    const viewportWidth = window.innerWidth;

    mediaEls = Array.from(main.querySelectorAll(MEDIA_SELECTOR)).filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width >= viewportWidth * MEDIA_MIN_WIDTH_RATIO && rect.height >= MEDIA_MIN_HEIGHT;
    });

    // Section colour schemes paint `background-color` on every `.color-*`
    // element (see snippets/color-schemes.liquid), so the computed
    // background-color of these backdrops is reliable — including the article
    // header's metafield-driven colour.
    //
    // Only OPAQUE backdrops are kept: a transparent scheme (e.g. the blog
    // post's rgba(0,0,0,0) background) paints nothing, so it must not mask the
    // opaque element behind it (such as the olive `.article__header-background`,
    // which sits above the section backgrounds at a higher z-index). We record
    // each backdrop's z-index so the front-most opaque one wins at probe time.
    colorEls = Array.from(
      main.querySelectorAll('.section-background, .custom-section-background, .article__header-background')
    )
      .map((el) => {
        const styles = getComputedStyle(el);
        let color = parseColor(styles.backgroundColor);
        if (!color || color.a < 0.5) {
          const varColor = parseColor(styles.getPropertyValue('--color-background'));
          if (varColor && varColor.a >= 0.5) color = varColor;
        }
        const z = styles.zIndex === 'auto' ? 0 : parseInt(styles.zIndex, 10) || 0;
        return { el: /** @type {HTMLElement} */ (el), color, white: isWhite(color), z };
      })
      .filter((entry) => entry.color != null && entry.color.a >= 0.5);

    update();
  }

  /**
   * Does the element cover the given probe point?
   * @param {DOMRect} rect
   * @param {number} x
   * @param {number} y
   */
  function covers(rect, x, y) {
    return rect.width > 0 && rect.height > 0 && rect.top <= y && rect.bottom > y && rect.left <= x && rect.right > x;
  }

  /** Decide the state from whatever sits behind the header and toggle it. */
  function update() {
    const headerRect = header.getBoundingClientRect();
    // Probe the vertical middle of the header, at the horizontal centre of the
    // viewport — representative of what shows through behind the header.
    const probeY = headerRect.top + headerRect.height / 2;
    const probeX = window.innerWidth / 2;

    let inverse = false;

    // 1. Full-bleed media behind the header always wins.
    for (const el of mediaEls) {
      if (covers(el.getBoundingClientRect(), probeX, probeY)) {
        inverse = true;
        break;
      }
    }

    // 2. Otherwise the front-most opaque backdrop decides: inverse unless it's
    //    white. Front-most = highest z-index, ties broken by DOM order (later
    //    paints on top). This lets the opaque olive article header win over the
    //    blog post's transparent section background that scrolls in front of it.
    if (!inverse) {
      let best = null;
      for (const entry of colorEls) {
        if (covers(entry.el.getBoundingClientRect(), probeX, probeY) && (!best || entry.z >= best.z)) {
          best = entry;
        }
      }
      if (best) inverse = !best.white;
    }

    header.toggleAttribute('data-scroll-inverse', inverse);
  }

  function onScroll() {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      update();
    });
  }

  document.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', collect, { passive: true });
  // Sizes/colours are only final once media and fonts have settled.
  window.addEventListener('load', collect);

  // Theme editor: re-evaluate when sections are added/removed/reordered/edited.
  document.addEventListener('shopify:section:load', collect);
  document.addEventListener('shopify:section:unload', collect);
  document.addEventListener('shopify:section:reorder', collect);

  collect();
})();