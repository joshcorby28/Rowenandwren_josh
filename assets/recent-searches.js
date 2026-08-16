/**
 * Stores the shopper's recent search terms in localStorage.
 *
 * Mirrors the shape of assets/recently-viewed-products.js. Terms are the
 * queries the shopper actually submitted (Enter / selecting a suggestion),
 * newest first, de-duplicated (case-insensitively), capped at MAX_TERMS.
 */
export class RecentSearches {
  /** @static @constant {string} localStorage key */
  static #STORAGE_KEY = 'recentSearches';
  /** @static @constant {number} maximum number of terms to store */
  static #MAX_TERMS = 5;

  /**
   * Add a search term to the recent searches list.
   * @param {string} term - The search term to add.
   */
  static add(term) {
    if (typeof term !== 'string') return;
    const trimmed = term.trim();
    if (!trimmed) return;

    let terms = this.get();
    // Case-insensitive de-dupe, preserving the newly-typed casing.
    terms = terms.filter((/** @type {string} */ t) => t.toLowerCase() !== trimmed.toLowerCase());
    terms.unshift(trimmed);
    terms = terms.slice(0, this.#MAX_TERMS);

    try {
      localStorage.setItem(this.#STORAGE_KEY, JSON.stringify(terms));
    } catch {
      // Storage unavailable (private mode / quota) — fail silently.
    }
  }

  static clear() {
    try {
      localStorage.removeItem(this.#STORAGE_KEY);
    } catch {
      // no-op
    }
  }

  /**
   * Retrieve the list of recent search terms.
   * @returns {string[]} The list of terms, newest first.
   */
  static get() {
    try {
      const raw = localStorage.getItem(this.#STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((t) => typeof t === 'string') : [];
    } catch {
      return [];
    }
  }
}