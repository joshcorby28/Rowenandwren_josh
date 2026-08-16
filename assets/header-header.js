/**
 * Header dropdown — standalone script
 *
 * No build step or module bundler required. Include this file with a plain
 * <script> tag (defer recommended) in your theme layout and it will
 * self-initialise against any element carrying data-module="header".
 *
 * Targets (read from data-el="header.*" attributes in the DOM):
 *   ctaColumn, dropdown, dropdownColumns, dropdownToggle,
 *   dropdownToggleIcon, navColumn, navColumnToggle, searchInput
 *
 * Config (read from data attributes on the root data-module="header" element):
 *   data-header-has-active-dropdown     — maintained by this script
 *   data-header-underlined-button-class — CSS class applied to underlined toggles
 */

(function () {
  'use strict';

  // ─── Constants ────────────────────────────────────────────────────────────

  const MODULE_ATTR        = 'data-module';
  const EL_ATTR            = 'data-el';
  const COLUMN_PADDING_PX  = 60; // breathing room below the tallest nav column

  const Classes = {
    ctasActive:   'hd-Dropdown_Ctas-active',
    columnActive: 'hd-Dropdown_Column-active',
  };

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Find all elements matching [data-el="<identifier>.<name>"] within a root.
   */
  function findEls(root, identifier, name) {
    return Array.from(
      root.querySelectorAll(`[${EL_ATTR}="${identifier}.${name}"]`)
    );
  }

  // ─── Dropdown model ───────────────────────────────────────────────────────

  class Dropdown {
    constructor(el) {
      this.element = el;
      this.id = el.dataset.dropdownId;
    }

    get isActive() {
      return this.element.getAttribute('aria-expanded') === 'true';
    }

    set isActive(value) {
      this.element.setAttribute('aria-expanded', String(value));
    }
  }

  // ─── NavColumn model ──────────────────────────────────────────────────────

  class NavColumn {
    constructor(el) {
      this.element = el;
      this.id      = el.dataset.navColumnId;
      this.level   = Number(el.dataset.navColumnLevel);
    }

    get isActive() {
      return this.element.classList.contains(Classes.columnActive);
    }

    /** Child columns are nav columns nested *inside* this element. */
    get childColumns() {
      return Array.from(
        this.element.querySelectorAll(`[${EL_ATTR}="header.navColumn"]`)
      );
    }

    toggle() {
      this.isActive ? this.hide() : this.show();
    }

    show() {
      this.element.classList.add(Classes.columnActive);
    }

    hide() {
      [this.element, ...this.childColumns].forEach((el) => {
        el.classList.remove(Classes.columnActive);
      });
    }
  }

  // ─── Header module ────────────────────────────────────────────────────────

  class HeaderModule {
    constructor(rootEl) {
      this.root = rootEl;

      // Read config from data attributes on the root element
      this._underlinedClass = rootEl.dataset.headerUnderlinedButtonClass || '';

      // Collect all target elements
      this.dropdownEls        = findEls(rootEl, 'header', 'dropdown');
      this.dropdownToggleEls  = findEls(rootEl, 'header', 'dropdownToggle');
      this.dropdownColumnsEl  = findEls(rootEl, 'header', 'dropdownColumns')[0];
      this.navColumnEls       = findEls(rootEl, 'header', 'navColumn');
      this.navColumnToggleEls = findEls(rootEl, 'header', 'navColumnToggle');
      this.ctaColumnEls       = findEls(rootEl, 'header', 'ctaColumn');
      this.searchInputEl      = findEls(rootEl, 'header', 'searchInput')[0];

      // Build model objects
      this.dropdowns  = this.dropdownEls.map((el) => new Dropdown(el));
      this.navColumns = this.navColumnEls.map((el) => new NavColumn(el));

      // Bind event handlers so they can be used as listener callbacks
      this._onToggleClick      = this._onToggleClick.bind(this);
      this._onNavColumnClick   = this._onNavColumnClick.bind(this);
      this._onNavColumnHover   = this._onNavColumnHover.bind(this);
      this._onNavColumnKeydown = this._onNavColumnKeydown.bind(this);
      this._onEscapeKey        = this._onEscapeKey.bind(this);

      this._setupListeners();
      this._initResizeObserver();
    }

    // ── Setup ──────────────────────────────────────────────────────────────

    _setupListeners() {
      this.dropdownToggleEls.forEach((el) => {
        el.addEventListener('click', this._onToggleClick);
      });

      this.navColumnToggleEls.forEach((el) => {
        el.addEventListener('click',     this._onNavColumnClick);
        el.addEventListener('mouseover', this._onNavColumnHover);
        el.addEventListener('keydown',   this._onNavColumnKeydown);
      });

      // Escape closes the active dropdown from anywhere inside the header
      this.root.addEventListener('keydown', this._onEscapeKey);
    }

    /**
     * Use ResizeObserver to keep the dropdown column container height accurate
     * after fonts/images load and on window resize.
     * Falls back to a one-time measurement on very old browsers.
     */
    _initResizeObserver() {
      if (!this.dropdownColumnsEl) return;

      const update = () => {
        const maxHeight = this.navColumnEls.reduce(
          (max, el) => Math.max(max, el.scrollHeight),
          0
        );
        this.dropdownColumnsEl.style.height = `${maxHeight + COLUMN_PADDING_PX}px`;
      };

      if (typeof ResizeObserver !== 'undefined') {
        this._resizeObserver = new ResizeObserver(update);
        this.navColumnEls.forEach((el) => this._resizeObserver.observe(el));
      } else {
        update();
      }
    }

    // ── Event handlers ─────────────────────────────────────────────────────

    _onToggleClick(event) {
      event.preventDefault();
      const toggle = event.target.closest(`[${EL_ATTR}="header.dropdownToggle"]`);
      if (!toggle) return;
      const dropdown = this.dropdowns.find((d) => d.id === toggle.dataset.dropdownId);
      if (dropdown) this._toggleDropdown(dropdown);
    }

    _onNavColumnClick(event) {
      const toggle = event.target.closest(`[${EL_ATTR}="header.navColumnToggle"]`);
      if (!toggle) return;
      event.preventDefault();
      this._toggleNavColumn(toggle.dataset.navColumnToggle);
    }

    _onNavColumnHover(event) {
      const toggle = event.target.closest(`[${EL_ATTR}="header.navColumnToggle"]`);
      if (!toggle) return;
      this._showNavColumn(toggle.dataset.navColumnToggle);
    }

    /**
     * Keyboard support for nav column toggles.
     * Enter and Space activate the column reveal (matching click behaviour).
     */
    _onNavColumnKeydown(event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const toggle = event.target.closest(`[${EL_ATTR}="header.navColumnToggle"]`);
      if (!toggle) return;
      event.preventDefault();
      this._toggleNavColumn(toggle.dataset.navColumnToggle);
    }

    /** Close the active dropdown when Escape is pressed. */
    _onEscapeKey(event) {
      if (event.key !== 'Escape') return;
      const active = this._activeDropdown;
      if (active) this._toggleDropdown(active);
    }

    // ── Dropdown logic ─────────────────────────────────────────────────────

    _toggleDropdown(targetDropdown) {
      const wasActive = targetDropdown.isActive;

      this.dropdowns.forEach((dropdown) => {
        const shouldBeActive = !wasActive && dropdown === targetDropdown;

        if (dropdown.isActive && !shouldBeActive) {
          dropdown.isActive = false;

          if (dropdown.id === 'nav') {
            this._hideChildNavColumns();
            this._afterNavClose(() => {
              this._toggleCtas(this._activeNavColumn.id);
            });
          }

          if (dropdown.id === 'search' && this.searchInputEl) {
            this.searchInputEl.value = '';
          }
        } else if (shouldBeActive) {
          dropdown.isActive = true;

          if (dropdown.id === 'search' && this.searchInputEl) {
            setTimeout(() => this.searchInputEl.focus(), 600);
          }
        }
      });

      // Sync all toggle button aria-expanded states
      const activeId = this._activeDropdown ? this._activeDropdown.id : null;
      this.root.setAttribute('data-header-has-active-dropdown', String(!!activeId));

      this.dropdownToggleEls.forEach((el) => {
        const isActive = activeId === el.dataset.dropdownId;
        // aria-expanded is the single source of truth — CSS reads this directly
        el.setAttribute('aria-expanded', String(isActive));

        if (el.dataset.dropdownId === 'search') {
          this._underlineToggle(el.dataset.dropdownId, isActive);
        }
      });
    }

    // ── Nav column logic ───────────────────────────────────────────────────

    _toggleNavColumn(id) {
      const column = this._getNavColumnById(id);
      if (!column) return;
      column.toggle();
      this._syncNavToggleAria(id, column.isActive);
      this._hideColumns(column);
      this._toggleCtas(this._activeNavColumn.id);
    }

    _showNavColumn(id) {
      const column = this._getNavColumnById(id);
      if (!column) return;
      column.show();
      this._syncNavToggleAria(id, true);
      this._hideColumns(column);
      this._toggleCtas(this._activeNavColumn.id);
    }

    /**
     * Hide all columns that are not the active column and not its ancestors
     * (columns at a lower level number).
     */
    _hideColumns(activeColumn) {
      this.navColumns.forEach((col) => {
        const isAncestor = col.level < activeColumn.level;
        if (col === activeColumn || isAncestor) return;
        col.hide();
        this._syncNavToggleAria(col.id, false);
      });
    }

    _hideChildNavColumns() {
      this.navColumns.forEach((col) => {
        if (col.level !== 1) {
          col.hide();
          this._syncNavToggleAria(col.id, false);
        }
      });
    }

    _toggleCtas(activeColumnId) {
      this.ctaColumnEls.forEach((el) => {
        el.classList.toggle(Classes.ctasActive, el.dataset.relatedList === activeColumnId);
      });
    }

    _underlineToggle(dropdownId, isActive) {
      if (!this._underlinedClass) return;
      const toggle = this.dropdownToggleEls.find(
        (el) => el.dataset.dropdownId === dropdownId
      );
      if (toggle) toggle.classList.toggle(this._underlinedClass, isActive);
    }

    // ── Getters ────────────────────────────────────────────────────────────

    get _activeDropdown() {
      return this.dropdowns.find((d) => d.isActive) || null;
    }

    /**
     * The deepest active nav column (highest level). Falls back to level-1
     * so _toggleCtas always has a valid column ID to compare against.
     */
    get _activeNavColumn() {
      let active = this.navColumns.find((col) => col.level === 1);
      this.navColumns
        .filter((col) => col.isActive)
        .forEach((col) => {
          if (col.level > active.level) active = col;
        });
      return active;
    }

    // ── Private helpers ────────────────────────────────────────────────────

    _getNavColumnById(id) {
      return this.navColumns.find((col) => col.id === id) || null;
    }

    /**
     * Keep aria-expanded in sync on the toggle anchor that controls a given
     * nav column. This is what screen readers announce.
     */
    _syncNavToggleAria(columnId, isExpanded) {
      const toggle = this.navColumnToggleEls.find(
        (el) => el.dataset.navColumnToggle === columnId
      );
      if (toggle) toggle.setAttribute('aria-expanded', String(isExpanded));
    }

    /**
     * Call `callback` after the nav drawer's CSS transition ends.
     *
     * Guards against prefers-reduced-motion (transitions may be disabled,
     * so transitionend would never fire) with a rAF fallback, plus a 600ms
     * setTimeout safety net so CTAs can never get permanently stuck.
     */
    _afterNavClose(callback) {
      const navDropdown = this.dropdowns.find((d) => d.id === 'nav');
      if (!navDropdown) {
        callback();
        return;
      }

      let called = false;
      const run = () => {
        if (called) return;
        called = true;
        callback();
      };

      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (prefersReduced) {
        requestAnimationFrame(run);
      } else {
        navDropdown.element.addEventListener('transitionend', run, { once: true });
        setTimeout(run, 600);
      }
    }

    /** Clean up observers and listeners (call if the header is removed from the DOM). */
    destroy() {
      if (this._resizeObserver) this._resizeObserver.disconnect();

      this.dropdownToggleEls.forEach((el) => {
        el.removeEventListener('click', this._onToggleClick);
      });

      this.navColumnToggleEls.forEach((el) => {
        el.removeEventListener('click',     this._onNavColumnClick);
        el.removeEventListener('mouseover', this._onNavColumnHover);
        el.removeEventListener('keydown',   this._onNavColumnKeydown);
      });

      this.root.removeEventListener('keydown', this._onEscapeKey);
    }
  }

  // ─── Bootstrap ────────────────────────────────────────────────────────────

  /**
   * Find all elements with data-module="header" and initialise a HeaderModule
   * for each. Runs after the DOM is ready.
   */
  function init() {
    document
      .querySelectorAll(`[${MODULE_ATTR}="header"]`)
      .forEach((el) => new HeaderModule(el));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
