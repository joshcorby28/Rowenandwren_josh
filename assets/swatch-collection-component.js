import { Component } from '@theme/component';
import { CartAddEvent } from '@theme/events';

const MAX_SAMPLES = 6;

/**
 * Custom element for the "Order free fabric swatches" collection page.
 *
 * This is the inline, full-page sibling of `swatch-samples-component` (the
 * product-page drawer). It shares the same DOM contract — sample tiles carry
 * `data-variant-id` / `data-name` / `data-image` and `ref="samples[]"`, the
 * footer has six `ref="slots[]"`, an `addButton` ref and an `errorMessage`
 * ref — but extends the plain `Component` base rather than `DialogComponent`
 * because the picker is the page content, not something opened in a dialog.
 *
 * The selection/slot/cart-add logic is intentionally kept in lockstep with
 * `swatch-samples-component.js`; if this is ever DRYed up, extract a shared
 * base module and have both components consume it.
 *
 * After a successful add, the selection resets and a CartAddEvent is
 * dispatched on `document`. The theme's <cart-drawer-component auto-open>
 * listens for that event and opens itself with the rendered sections payload.
 *
 * @extends Component
 */
class SwatchCollectionComponent extends Component {
  requiredRefs = ['addButton'];

  /** @type {Map<string, { name: string, image: string }>} */
  #selected = new Map();

  /**
   * Toggle a sample in/out of the selection. Capped at MAX_SAMPLES.
   * @param {MouseEvent} event
   */
  toggleSample = (event) => {
    const button = event.target instanceof Element
      ? event.target.closest('[data-variant-id]')
      : null;
    if (!(button instanceof HTMLElement)) return;

    const variantId = button.dataset.variantId;
    if (!variantId) return;

    if (this.#selected.has(variantId)) {
      this.#selected.delete(variantId);
      button.setAttribute('aria-pressed', 'false');
      button.dataset.selected = 'false';
    } else {
      if (this.#selected.size >= MAX_SAMPLES) return;
      this.#selected.set(variantId, {
        name: button.dataset.name || '',
        image: button.dataset.image || '',
      });
      button.setAttribute('aria-pressed', 'true');
      button.dataset.selected = 'true';
    }

    this.#renderSlots();
    this.#renderAddButton();
  };

  /**
   * Add every selected swatch in one batched cart/add POST, then reset the
   * selection and dispatch CartAddEvent so the cart drawer opens.
   */
  handleAddToCart = async () => {
    if (this.#selected.size === 0) return;

    const addButton = /** @type {HTMLButtonElement} */ (this.refs.addButton);
    addButton.disabled = true;

    const sectionIds = this.#getCartSectionIds();
    const payload = {
      items: Array.from(this.#selected.keys()).map((id) => ({
        id: Number(id),
        quantity: 1,
      })),
      sections: sectionIds.join(','),
    };

    try {
      const response = await fetch(Theme.routes.cart_add_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (data.status) {
        this.#showError(data.description || data.message || 'Add to cart failed.');
        addButton.disabled = false;
        return;
      }

      this.#reset();

      document.dispatchEvent(
        new CartAddEvent({}, this.id, {
          source: 'swatch-collection-component',
          itemCount: payload.items.length,
          sections: data.sections,
        })
      );
    } catch (error) {
      console.error(error);
      this.#showError('Something went wrong. Please try again.');
      addButton.disabled = false;
    }
  };

  /** @returns {string[]} */
  #getCartSectionIds() {
    const ids = new Set();
    for (const node of document.querySelectorAll('cart-items-component')) {
      if (node instanceof HTMLElement && node.dataset.sectionId) {
        ids.add(node.dataset.sectionId);
      }
    }
    for (const node of document.querySelectorAll('cart-drawer-component')) {
      if (node instanceof HTMLElement && node.dataset.sectionId) {
        ids.add(node.dataset.sectionId);
      }
    }
    return [...ids];
  }

  #renderSlots() {
    const slots = this.#asArray(this.refs.slots);
    const selectedEntries = Array.from(this.#selected.entries());

    slots.forEach((slot, index) => {
      const entry = selectedEntries[index];
      const placeholder = slot.querySelector('[data-slot-placeholder]');
      let image = slot.querySelector('[data-slot-image]');

      if (entry) {
        const [variantId, value] = entry;
        slot.dataset.filled = 'true';
        slot.dataset.variantId = variantId;

        if (!(image instanceof HTMLImageElement)) {
          image = document.createElement('img');
          image.setAttribute('data-slot-image', '');
          image.className = 'collection-swatches__slot-image';
          slot.appendChild(image);
        }
        image.src = value.image;
        image.alt = value.name;

        if (placeholder instanceof HTMLElement) placeholder.hidden = true;
      } else {
        slot.dataset.filled = 'false';
        delete slot.dataset.variantId;
        if (image) image.remove();
        if (placeholder instanceof HTMLElement) placeholder.hidden = false;
      }
    });
  }

  #renderAddButton() {
    const addButton = /** @type {HTMLButtonElement} */ (this.refs.addButton);
    addButton.disabled = this.#selected.size === 0;
  }

  /** @param {string} message */
  #showError(message) {
    const region = this.refs.errorMessage;
    if (region instanceof HTMLElement) {
      region.textContent = message;
    }
  }

  #reset() {
    this.#selected.clear();
    const samples = this.#asArray(this.refs.samples);
    for (const sample of samples) {
      sample.dataset.selected = 'false';
      sample.setAttribute('aria-pressed', 'false');
    }
    this.#renderSlots();
    this.#renderAddButton();
    this.#showError('');
  }

  /**
   * @param {HTMLElement | HTMLElement[] | undefined} ref
   * @returns {HTMLElement[]}
   */
  #asArray(ref) {
    if (!ref) return [];
    return Array.isArray(ref) ? ref : [ref];
  }
}

if (!customElements.get('swatch-collection-component')) {
  customElements.define('swatch-collection-component', SwatchCollectionComponent);
}