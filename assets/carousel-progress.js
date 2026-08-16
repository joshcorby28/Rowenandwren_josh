/**
 * A progress bar for the carousel section.
 *
 * Reflects the horizontal scroll position of the associated `slideshow-slides`
 * scroller. The bar width represents the proportion of the track that is
 * currently visible and its offset tracks the scroll progress, so it doubles as
 * a "how far through the carousel am I" indicator.
 *
 * The component is self contained: it locates the scroller within its parent,
 * listens for scroll/resize changes and hides itself when the content does not
 * overflow (nothing to scroll through).
 *
 * @example
 * <carousel-progress>
 *   <span class="carousel-progress__bar"></span>
 * </carousel-progress>
 */
class CarouselProgress extends HTMLElement {
  /** @type {HTMLElement | null} */
  #scroller = null;

  /** @type {ResizeObserver | null} */
  #resizeObserver = null;

  /** @type {MutationObserver | null} */
  #mutationObserver = null;

  connectedCallback() {
    this.#scroller = this.#findScroller();
    if (!this.#scroller) return;

    this.#scroller.addEventListener('scroll', this.#update, { passive: true });

    this.#resizeObserver = new ResizeObserver(this.#update);
    this.#resizeObserver.observe(this.#scroller);

    // The scroller only becomes scrollable once its slideshow enters the
    // viewport (the theme toggles `overflow` via an `in-viewport` attribute),
    // so recompute when that state changes.
    const slideshow = this.#scroller.closest('slideshow-component');
    if (slideshow) {
      this.#mutationObserver = new MutationObserver(this.#update);
      this.#mutationObserver.observe(slideshow, {
        attributes: true,
        attributeFilter: ['in-viewport', 'disabled', 'mobile-disabled'],
      });
    }

    this.#update();
  }

  disconnectedCallback() {
    this.#scroller?.removeEventListener('scroll', this.#update);
    this.#resizeObserver?.disconnect();
    this.#mutationObserver?.disconnect();
  }

  /**
   * Finds the slideshow scroller this progress bar belongs to.
   * @returns {HTMLElement | null}
   */
  #findScroller() {
    const scope = this.parentElement ?? this;
    return scope.querySelector('slideshow-slides');
  }

  #update = () => {
    const scroller = this.#scroller;
    if (!scroller) return;

    const { scrollWidth, clientWidth } = scroller;
    const overflow = scrollWidth - clientWidth;

    // Nothing to scroll through - hide the bar entirely.
    if (overflow <= 1 || clientWidth === 0) {
      this.hidden = true;
      return;
    }

    this.hidden = false;

    const barWidth = clientWidth / scrollWidth;
    const scrolled = Math.min(Math.abs(scroller.scrollLeft) / overflow, 1);
    const offset = scrolled * (1 - barWidth);

    this.style.setProperty('--carousel-progress-width', `${barWidth * 100}%`);
    this.style.setProperty('--carousel-progress-offset', `${offset * 100}%`);
  };
}

if (!customElements.get('carousel-progress')) {
  customElements.define('carousel-progress', CarouselProgress);
}