import { ThemeEvents } from '@theme/events';
import { morph } from '@theme/morph';
import { Component } from '@theme/component';

/**
 * Keeps the hidden pre-order line-item property (and the optional pre-order
 * note) in sync with the currently selected variant.
 *
 * Horizon re-fetches the product section on every variant change and dispatches
 * a `variant:update` event carrying the fresh HTML. Most of the buy-buttons
 * block does not morph on its own, so this small component mirrors the pattern
 * used by `product-inventory.js`: on each variant update it finds its
 * counterpart in the new HTML and morphs itself into it, updating the input's
 * `value`/`disabled` state and its own `hidden` attribute.
 *
 * @extends Component
 */
class PreorderStatus extends Component {
  connectedCallback() {
    super.connectedCallback();
    this.section = this.closest('.shopify-section, dialog');
    this.section?.addEventListener(ThemeEvents.variantUpdate, this.updateStatus);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.section?.removeEventListener(ThemeEvents.variantUpdate, this.updateStatus);
  }

  /**
   * @param {import('@theme/events').VariantUpdateEvent} event
   */
  updateStatus = (event) => {
    // Combined listings: adopt the new product id, otherwise ignore updates that
    // belong to a different product form on the page.
    if (event.detail.data.newProduct) {
      this.dataset.productId = event.detail.data.newProduct.id;
    } else if (
      event.target instanceof HTMLElement &&
      event.target.dataset.productId !== this.dataset.productId
    ) {
      return;
    }

    const next = event.detail.data.html.querySelector('preorder-status-component');
    if (!next) return;

    morph(this, next);
  };
}

if (!customElements.get('preorder-status-component')) {
  customElements.define('preorder-status-component', PreorderStatus);
}