import { Component } from '@theme/component';

/**
 * @typedef {Object} CollectionDescriptionRefs
 * @property {HTMLElement} content - The wrapper carrying the collapsed/expanded state
 * @property {HTMLButtonElement} [toggle] - The read more / read less button
 */

/**
 * Expands and collapses a collection description that exceeds a word limit.
 *
 * The truncated teaser and per-breakpoint hiding are handled entirely in CSS (via the
 * `data-expanded` / `data-truncate-*` attributes and a `::before` pseudo element), so this
 * component only flips the expanded state and keeps the button's label and ARIA in sync.
 *
 * @extends {Component<CollectionDescriptionRefs>}
 */
class CollectionDescription extends Component {
  requiredRefs = ['content'];

  /**
   * Toggles the expanded state of the description.
   */
  toggle() {
    const { content, toggle } = this.refs;
    const next = content.dataset.expanded !== 'true';

    content.dataset.expanded = String(next);

    if (toggle) {
      toggle.setAttribute('aria-expanded', String(next));
      toggle.textContent = next
        ? this.dataset.readLess ?? 'Read less'
        : this.dataset.readMore ?? 'Read more';
    }
  }
}

if (!customElements.get('collection-description')) {
  customElements.define('collection-description', CollectionDescription);
}
