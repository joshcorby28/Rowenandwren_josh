import { Component } from '@theme/component';
import { debounce, onAnimationEnd, prefersReducedMotion } from '@theme/utilities';
import { sectionRenderer } from '@theme/section-renderer';
import { morph } from '@theme/morph';
import { RecentlyViewed } from '@theme/recently-viewed-products';
import { RecentSearches } from '@theme/recent-searches';

/**
 * A custom element that allows the user to search for resources available on the store.
 *
 * @typedef {object} Refs
 * @property {HTMLInputElement} searchInput - The search input element.
 * @property {HTMLElement} predictiveSearchResults - The predictive search results container.
 * @property {HTMLElement} resetButton - The reset button element.
 * @property {HTMLElement[]} [resultsItems] - The search results items elements.
 * @property {HTMLElement} [recentlyViewedWrapper] - The recently viewed products wrapper.
 * @property {HTMLElement[]} [recentlyViewedTitle] - The recently viewed title elements.
 * @property {HTMLElement[]} [recentlyViewedItems] - The recently viewed product items.
 * @extends {Component<Refs>}
 */
class PredictiveSearchComponent extends Component {
  requiredRefs = ['searchInput', 'predictiveSearchResults', 'resetButton'];

  #controller = new AbortController();

  /**
   * @type {AbortController | null}
   */
  #activeFetch = null;


  /**
   * @type {MutationObserver | null}
   */
  #panelObserver = null;

  /**
   * Get the header dropdown panel that hosts this search component.
   * The shared header controller (assets/header-header.js) toggles the
   * panel's `aria-expanded` attribute to open/close it.
   * @returns {HTMLElement | null} The search dropdown panel.
   */
  get panel() {
    return this.closest('[data-el="header.dropdown"]');
  }

  /**
   * Whether the search dropdown panel is currently open.
   * @returns {boolean}
   */
  get isPanelOpen() {
    return this.panel?.getAttribute('aria-expanded') === 'true';
  }

  connectedCallback() {
    super.connectedCallback();

    const { panel } = this;
    const { signal } = this.#controller;

    if (this.refs.searchInput.value.length > 0) {
      this.#showResetButton();
    }

    if (panel) {
      document.addEventListener('keydown', this.#handleKeyboardShortcut, { signal });
      this.addEventListener('click', this.#handleModalClick, { signal });
      window.addEventListener(
        'resize',
        () => {
          if (this.isPanelOpen) this.#syncPanelHeight();
        },
        { signal }
      );

      // The header controller (assets/header-header.js) owns open/close by
      // toggling the panel's `aria-expanded`. Mirror the old dialog
      // open/close lifecycle by observing that attribute.
      this.#panelObserver = new MutationObserver(() => this.#handlePanelToggle());
      this.#panelObserver.observe(panel, { attributes: true, attributeFilter: ['aria-expanded'] });

      // If the panel is already open on connect, sync straight away.
      if (this.isPanelOpen) this.#handlePanelOpen();
    }
  }

  /**
   * Handles clicks within the predictive search modal to maintain focus on the input
   * @param {MouseEvent} event - The mouse event
   */
  #handleModalClick = (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const link = target.closest('a');
    const isInteractiveElement =
      target instanceof HTMLButtonElement ||
      target instanceof HTMLAnchorElement ||
      target instanceof HTMLInputElement ||
      target.closest('button') ||
      link ||
      target.closest('input');

    // Selecting a result (suggestion, category or product) counts as a search —
    // record the current term. Recent-searches links themselves are excluded.
    if (link && !link.closest('[data-recent-searches]')) {
      this.#recordRecentSearch();
    }

    if (!isInteractiveElement && this.refs.searchInput) {
      this.refs.searchInput.focus();
    }
  };

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#panelObserver?.disconnect();
    this.#controller.abort();
  }

  /**
   * Handles the CMD+K key combination — toggles the search dropdown via the
   * header controller by activating a search toggle.
   * @param {KeyboardEvent} event - The keyboard event.
   */
  #handleKeyboardShortcut = (event) => {
    if (event.metaKey && event.key === 'k') {
      event.preventDefault();
      const toggle = /** @type {HTMLElement | null} */ (
        document.querySelector('[data-el="header.dropdownToggle"][data-dropdown-id="search"]')
      );
      toggle?.click();
    }
  };

  /**
   * React to the panel opening/closing (driven by the header controller
   * flipping `aria-expanded` on the panel).
   */
  #handlePanelToggle = () => {
    if (this.isPanelOpen) {
      this.#handlePanelOpen();
    } else {
      this.#handlePanelClose();
    }
  };

  /**
   * Handles the panel open event.
   */
  #handlePanelOpen = () => {
    // Size the panel to the exact space below the header (see method).
    this.#syncPanelHeight();
    // The empty state (popular searches) is server-rendered inline in the
    // panel; just populate the client-side recent searches list.
    this.#renderRecentSearches();
  };

  /**
   * Set --search-panel-offset to the header's real bottom edge so the panel
   * fills exactly the viewport below the header. Measuring the header avoids
   * mis-sizing from CSS vars that can over-count (announcement bar, nav row).
   */
  #syncPanelHeight = () => {
    const { panel } = this;
    if (!panel) return;
    const header = document.getElementById('header-component');
    const headerBottom = header ? Math.max(0, Math.round(header.getBoundingClientRect().bottom)) : 0;
    panel.style.setProperty('--search-panel-offset', `${headerBottom}px`);

    // Give the scrollable body an explicit height so it fills the space below
    // the input bar and scrolls internally. The flex chain alone leaves it
    // collapsed (the results region ends up shorter than the panel, clipping
    // the taller left column). offsetHeight is layout height, unaffected by the
    // panel's open transform, so this is stable even mid-animation.
    const bar = panel.querySelector('.search-panel__bar');
    const body = panel.querySelector('.search-panel__body');
    if (body instanceof HTMLElement) {
      const barHeight = bar instanceof HTMLElement ? bar.offsetHeight : 0;
      body.style.height = `${Math.max(0, window.innerHeight - headerBottom - barHeight)}px`;
    }
  };

  /**
   * Handles the panel close event.
   */
  #handlePanelClose = () => {
    this.#resetSearch();
  };

  get #allResultsItems() {
    const containers = Array.from(
      this.querySelectorAll(
        '.predictive-search-results__wrapper-queries, ' +
          '.predictive-search-results__wrapper-products, ' +
          '.predictive-search-results__list'
      )
    );

    const allItems = containers
      .flatMap((container) => {
        if (container.classList.contains('predictive-search-results__wrapper-products')) {
          return Array.from(container.querySelectorAll('.predictive-search-results__card'));
        }
        return Array.from(container.querySelectorAll('[ref="resultsItems[]"], .predictive-search-results__card'));
      })
      .filter((item) => item instanceof HTMLElement);

    return /** @type {HTMLElement[]} */ (allItems);
  }

  /**
   * Track whether the last interaction was keyboard-based
   * @type {boolean}
   */
  #isKeyboardNavigation = false;

  get #currentIndex() {
    return this.#allResultsItems?.findIndex((item) => item.getAttribute('aria-selected') === 'true') ?? -1;
  }

  set #currentIndex(index) {
    if (!this.#allResultsItems?.length) return;

    let activeItem = null;

    this.#allResultsItems.forEach((item) => {
      item.classList.remove('keyboard-focus');
    });

    for (const [itemIndex, item] of this.#allResultsItems.entries()) {
      if (itemIndex === index) {
        item.setAttribute('aria-selected', 'true');
        if (this.#isKeyboardNavigation) {
          item.classList.add('keyboard-focus');
        }
        activeItem = item;
      } else {
        item.removeAttribute('aria-selected');
      }
    }

    activeItem?.scrollIntoView({ behavior: prefersReducedMotion() ? 'instant' : 'smooth', block: 'nearest' });
    this.refs.searchInput.focus();
  }

  get #currentItem() {
    return this.#allResultsItems?.[this.#currentIndex];
  }

  /**
   * Navigate through the predictive search results using arrow keys or close them with the Escape key.
   * @param {KeyboardEvent} event - The keyboard event.
   */
  onSearchKeyDown = (event) => {
    if (event.key === 'Escape') {
      this.#resetSearch();
      return;
    }

    if (!this.#allResultsItems?.length || event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      return;
    }

    const currentIndex = this.#currentIndex;
    const totalItems = this.#allResultsItems.length;

    switch (event.key) {
      case 'ArrowDown':
        this.#isKeyboardNavigation = true;
        event.preventDefault();
        this.#currentIndex = currentIndex < totalItems - 1 ? currentIndex + 1 : 0;
        break;

      case 'Tab':
        if (event.shiftKey) {
          this.#isKeyboardNavigation = true;
          event.preventDefault();
          this.#currentIndex = currentIndex > 0 ? currentIndex - 1 : totalItems - 1;
        } else {
          this.#isKeyboardNavigation = true;
          event.preventDefault();
          this.#currentIndex = currentIndex < totalItems - 1 ? currentIndex + 1 : 0;
        }
        break;

      case 'ArrowUp':
        this.#isKeyboardNavigation = true;
        event.preventDefault();
        this.#currentIndex = currentIndex > 0 ? currentIndex - 1 : totalItems - 1;
        break;

      case 'Enter': {
        // Committing a search — remember the term.
        this.#recordRecentSearch();

        const singleResultContainer = this.refs.predictiveSearchResults.querySelector('[data-single-result-url]');
        if (singleResultContainer instanceof HTMLElement && singleResultContainer.dataset.singleResultUrl) {
          event.preventDefault();
          window.location.href = singleResultContainer.dataset.singleResultUrl;
          return;
        }

        if (this.#currentIndex >= 0) {
          event.preventDefault();
          this.#currentItem?.querySelector('a')?.click();
        } else {
          const searchUrl = new URL(Theme.routes.search_url, location.origin);
          searchUrl.searchParams.set('q', this.refs.searchInput.value);
          window.location.href = searchUrl.toString();
        }
        break;
      }
    }
  };

  /**
   * Clears the recently viewed products.
   * @param {Event} event - The event.
   */
  clearRecentlyViewedProducts(event) {
    event.stopPropagation();

    RecentlyViewed.clearProducts();

    const { recentlyViewedItems, recentlyViewedTitle, recentlyViewedWrapper } = this.refs;

    const allRecentlyViewedElements = [...(recentlyViewedItems || []), ...(recentlyViewedTitle || [])];

    if (allRecentlyViewedElements.length === 0) {
      return;
    }

    if (recentlyViewedWrapper) {
      recentlyViewedWrapper.classList.add('removing');

      onAnimationEnd(recentlyViewedWrapper, () => {
        recentlyViewedWrapper.remove();
      });
    }
  }

  /**
   * Reset the search state.
   * @param {boolean} [keepFocus=true] - Whether to keep focus on input after reset
   */
  resetSearch = debounce((keepFocus = true) => {
    if (keepFocus) {
      this.refs.searchInput.focus();
    }
    this.#resetSearch();
  }, 100);

  /**
   * Debounce the search handler to fetch and display search results based on the input value.
   * Reset the current selection index and close results if the search term is empty.
   */
  search = debounce((event) => {
    // If the input is not a text input (like using the Escape key), don't search
    if (!event.inputType) return;

    const searchTerm = this.refs.searchInput.value.trim();
    this.#currentIndex = -1;

    if (!searchTerm.length) {
      this.#resetSearch();
      return;
    }

    this.#showResetButton();
    this.#getSearchResults(searchTerm);
  }, 200);

  /**
   * Resets scroll positions for search results containers
   */
  #resetScrollPositions() {
    requestAnimationFrame(() => {
      this.refs.predictiveSearchResults.querySelector('.predictive-search-results__inner')?.scrollTo(0, 0);
      this.querySelector('.predictive-search-form__content')?.scrollTo(0, 0);
    });
  }

  /**
   * Fetch search results using the section renderer and update the results container.
   * @param {string} searchTerm - The term to search for
   */
  async #getSearchResults(searchTerm) {
    if (!this.dataset.sectionId) return;

    const url = new URL(Theme.routes.predictive_search_url, location.origin);
    url.searchParams.set('q', searchTerm);
    url.searchParams.set('resources[limit_scope]', 'each');
    // Request the maximum so hide-from-search filtering (done in Liquid) still
    // leaves enough visible products to fill the results grid.
    url.searchParams.set('resources[limit]', '10');

    const { predictiveSearchResults } = this.refs;

    const abortController = this.#createAbortController();

    let resultsMarkup;
    try {
      resultsMarkup = await sectionRenderer.getSectionHTML(this.dataset.sectionId, false, url);
    } catch (error) {
      if (abortController.signal.aborted) return;
      throw error;
    }

    if (!resultsMarkup || abortController.signal.aborted) return;

    // Parse the native results into a detached document so we can merge the
    // tagged out-of-stock products into it BEFORE the first paint. Rendering
    // both sets in a single morph avoids the visible two-stage flash of
    // painting the native results and then injecting the tagged ones a moment
    // later. `morph` itself would parse the string to `body.firstChild`, so we
    // parse it the same way and hand it the resulting element.
    const resultsDoc = new DOMParser().parseFromString(resultsMarkup, 'text/html');
    const resultsTree = resultsDoc.body.firstChild;

    // The native predictive index omits products with zero inventory even when
    // "Continue selling when out of stock" is enabled, so out-of-stock ranges
    // never appear in the dropdown (they do on /search). Backfill opt-in
    // (tagged) products from the standard search index — but only when the
    // native results came back thin, so most searches skip the extra request
    // (and paint immediately, exactly as before).
    await this.#mergeTaggedProducts(resultsDoc, searchTerm, abortController);

    // Bail if the search moved on (new keystroke / cleared) while merging.
    if (abortController.signal.aborted || this.refs.searchInput.value.trim() !== searchTerm) return;

    morph(predictiveSearchResults, resultsTree ?? resultsMarkup);
    this.#resetScrollPositions();
  }

  /**
   * Merge tagged products the native predictive index drops (because they are
   * out of stock) into the not-yet-painted results document. Fetches the
   * `predictive-search-include` section against the standard search index
   * (which includes those products, scoped to the `predictive-search-include`
   * tag) and splices the cards into `resultsDoc`, de-duplicated against the
   * native results and capped for display. Because this happens before the
   * caller morphs `resultsDoc` into the DOM, both result sets appear in a
   * single paint.
   *
   * Runs only when the native product results are thin (fewer than
   * THIN_THRESHOLD), so the extra request — and the small extra wait before
   * painting — is confined to the case it solves.
   *
   * @param {Document} resultsDoc - The parsed, not-yet-painted native results.
   * @param {string} searchTerm - The current search term.
   * @param {AbortController} abortController - The active fetch's controller.
   */
  async #mergeTaggedProducts(resultsDoc, searchTerm, abortController) {
    const THIN_THRESHOLD = 5;
    const DISPLAY_LIMIT = 10;

    const productsGrid = () =>
      resultsDoc.querySelector('#predictive-search-products .predictive-search-results__wrapper-products');

    const nativeGrid = productsGrid();
    const nativeCount = nativeGrid
      ? nativeGrid.querySelectorAll('.predictive-search-results__card--product').length
      : 0;

    // Enough native results already — don't fire the extra request; the caller
    // paints the native results immediately.
    if (nativeCount >= THIN_THRESHOLD) return;

    const url = new URL(Theme.routes.search_url, location.origin);
    url.searchParams.set('q', searchTerm);
    url.searchParams.set('type', 'product');
    url.searchParams.set('options[prefix]', 'last');
    url.searchParams.set('options[unavailable_products]', 'show');

    let markup;
    try {
      markup = await sectionRenderer.getSectionHTML('predictive-search-include', false, url);
    } catch {
      return;
    }

    // Bail if the search moved on (new keystroke / cleared) while fetching.
    if (
      !markup ||
      abortController.signal.aborted ||
      this.refs.searchInput.value.trim() !== searchTerm
    ) {
      return;
    }

    const root = new DOMParser().parseFromString(markup, 'text/html').querySelector('[data-predictive-include-root]');
    const items = root ? Array.from(root.querySelectorAll('[data-predictive-include-item]')) : [];
    if (!items.length) return;

    /**
     * Extract a product handle from a card so native and supplemental results
     * can be de-duplicated (both render the same resource-card anchor).
     * @param {Element} card
     * @returns {string | null}
     */
    const handleOf = (card) => {
      const anchor = card.querySelector('a[href*="/products/"]');
      const match = anchor?.getAttribute('href')?.match(/\/products\/([^/?#]+)/);
      return match ? match[1] : null;
    };

    const grid = productsGrid();

    if (grid) {
      // Native products column exists — append the tagged extras, skipping any
      // product already shown and respecting the display cap.
      const seen = new Set(
        Array.from(grid.querySelectorAll('.predictive-search-results__card--product'))
          .map(handleOf)
          .filter(Boolean)
      );
      let total = grid.querySelectorAll('.predictive-search-results__card--product').length;

      for (const item of items) {
        if (total >= DISPLAY_LIMIT) break;
        const handle = handleOf(item);
        if (handle && seen.has(handle)) continue;
        if (handle) seen.add(handle);
        grid.appendChild(resultsDoc.importNode(item, true));
        total += 1;
      }
    } else {
      // No products column — e.g. every match is out of stock, so the native
      // render showed "no results". Insert the whole rendered products column.
      const column = root?.querySelector('[data-predictive-include-col]');
      if (!column) return;

      // Trim to the display cap.
      column.querySelectorAll('.predictive-search-results__card--product').forEach((card, index) => {
        if (index >= DISPLAY_LIMIT) card.remove();
      });

      let resultsGrid = resultsDoc.querySelector('.predictive-search-results__grid');
      if (!resultsGrid) {
        const inner = resultsDoc.querySelector('.predictive-search-results__inner');
        if (!inner) return;
        const noResults = resultsDoc.querySelector('.predictive-search-results__no-results');
        resultsGrid = resultsDoc.createElement('div');
        resultsGrid.className = 'predictive-search-results__grid predictive-search-results__grid--no-left';
        if (noResults) {
          noResults.replaceWith(resultsGrid);
        } else {
          inner.appendChild(resultsGrid);
        }
      }

      resultsGrid.appendChild(resultsDoc.importNode(column, true));
    }
  }

  #hideResetButton() {
    const { resetButton } = this.refs;

    resetButton.hidden = true;
  }

  #showResetButton() {
    const { resetButton } = this.refs;

    resetButton.hidden = false;
  }

  #createAbortController() {
    const abortController = new AbortController();
    if (this.#activeFetch) {
      this.#activeFetch.abort();
    }
    this.#activeFetch = abortController;
    return abortController;
  }

  #resetSearch = async () => {
    const { predictiveSearchResults, searchInput } = this.refs;
    const emptySectionId = 'predictive-search-empty';

    this.#currentIndex = -1;
    searchInput.value = '';
    this.#hideResetButton();

    const abortController = this.#createAbortController();
    const url = new URL(window.location.href);
    url.searchParams.delete('page');

    const emptySectionMarkup = await sectionRenderer.getSectionHTML(emptySectionId, false, url);
    const parsedEmptySectionMarkup = new DOMParser()
      .parseFromString(emptySectionMarkup, 'text/html')
      .querySelector('.predictive-search-empty-section');

    if (!parsedEmptySectionMarkup) throw new Error('No empty section markup found');

    if (abortController.signal.aborted) return;

    morph(predictiveSearchResults, parsedEmptySectionMarkup);
    this.#renderRecentSearches();
    this.#resetScrollPositions();
  };

  /**
   * Populate the recent searches list from localStorage. The container is
   * server-rendered hidden and revealed here only when terms exist.
   */
  #renderRecentSearches() {
    const container = this.querySelector('[data-recent-searches]');
    const list = this.querySelector('[data-recent-searches-list]');
    if (!(container instanceof HTMLElement) || !(list instanceof HTMLElement)) return;

    const terms = RecentSearches.get();

    if (terms.length === 0) {
      container.hidden = true;
      list.replaceChildren();
      return;
    }

    const searchUrl = Theme.routes.search_url;
    const fragment = document.createDocumentFragment();

    for (const term of terms) {
      const li = document.createElement('li');
      li.className = 'predictive-search-results__meta-item';

      const a = document.createElement('a');
      a.className = 'predictive-search-results__meta-link';
      const url = new URL(searchUrl, location.origin);
      url.searchParams.set('q', term);
      a.href = url.toString();
      a.textContent = term;

      li.appendChild(a);
      fragment.appendChild(li);
    }

    list.replaceChildren(fragment);
    container.hidden = false;
  }

  /**
   * Clears the stored recent searches and hides the list.
   * @param {Event} event - The event.
   */
  clearRecentSearches(event) {
    event.stopPropagation();
    RecentSearches.clear();
    this.#renderRecentSearches();
  }

  /**
   * Record the current search term into recent searches (called when the
   * shopper commits a search — Enter, or selecting a suggestion/result).
   */
  #recordRecentSearch() {
    const term = this.refs.searchInput?.value?.trim();
    if (term) RecentSearches.add(term);
  }
}

if (!customElements.get('predictive-search-component')) {
  customElements.define('predictive-search-component', PredictiveSearchComponent);
}