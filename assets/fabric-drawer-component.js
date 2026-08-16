import { DialogComponent } from '@theme/dialog';

/**
 * Custom element for the "Choose a fabric" drawer.
 *
 * Extends Horizon's DialogComponent so open/close/scroll-lock/focus-trap
 * come for free. Selecting a fabric tile highlights it, updates the
 * footer thumb/name, and asynchronously fetches that product's render
 * image via the `product.json.liquid` view template. Confirm navigates
 * to the selected product URL.
 *
 * @extends DialogComponent
 */
class FabricDrawerComponent extends DialogComponent {
  requiredRefs = ['dialog', 'confirmButton'];

  /** @type {{ url: string, name: string, image: string, handle: string } | null} */
  #pending = null;

  /**
   * Toggle selection of a fabric tile. Updates the footer preview and
   * (best-effort) swaps the render hero image.
   * @param {MouseEvent} event
   */
  selectFabric = async (event) => {
    const button = event.target instanceof Element
      ? event.target.closest('.fabric-drawer__item')
      : null;
    if (!(button instanceof HTMLElement)) return;

    const url = button.dataset.url || '';
    const handle = button.dataset.handle || '';
    const name = button.dataset.name || '';
    if (!url || !handle) return;

    // Deselect any other tile in this drawer.
    const items = this.querySelectorAll('.fabric-drawer__item[data-selected="true"]');
    for (const item of items) {
      if (item !== button) {
        item.setAttribute('data-selected', 'false');
        item.setAttribute('aria-pressed', 'false');
      }
    }
    button.setAttribute('data-selected', 'true');
    button.setAttribute('aria-pressed', 'true');

    // Update footer thumb + name.
    const innerImg = button.querySelector('.fabric-drawer__item-image img');
    const currentImage = this.refs.currentImage;
    if (innerImg instanceof HTMLImageElement && currentImage instanceof HTMLImageElement) {
      currentImage.src = innerImg.src;
      currentImage.alt = name;
      currentImage.hidden = false;
    }
    const currentName = this.refs.currentName;
    if (currentName instanceof HTMLElement) currentName.textContent = name;

    // Enable confirm.
    this.#pending = { url, handle, name, image: innerImg instanceof HTMLImageElement ? innerImg.src : '' };
    const confirmButton = /** @type {HTMLButtonElement} */ (this.refs.confirmButton);
    confirmButton.disabled = false;

    // Swap the render hero (best-effort, requires templates/product.json.liquid).
    const renderImage = this.refs.renderImage;
    if (renderImage instanceof HTMLImageElement && handle !== this.dataset.currentHandle) {
      try {
        const response = await fetch(`${url}?view=json`, { headers: { Accept: 'application/json' } });
        if (!response.ok) return;
        const data = await response.json();
        if (data && data.render_image) {
          renderImage.src = data.render_image;
          renderImage.dataset.handle = handle;
        }
      } catch (error) {
        // Non-fatal — selection still works without the hero swap.
        console.warn('[fabric-drawer] render image fetch failed', error);
      }
    }
  };

  /**
   * Navigate to the selected fabric's product page.
   */
  confirmSelection = () => {
    if (!this.#pending) return;
    window.location.href = this.#pending.url;
  };

  /**
   * Toggle the optional dimensions panel inside the render area.
   * @param {MouseEvent} event
   */
  toggleDimensions = (event) => {
    const trigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    const dimensions = this.refs.dimensions;
    if (!(dimensions instanceof HTMLElement)) return;
    const open = dimensions.hasAttribute('hidden');
    if (open) {
      dimensions.removeAttribute('hidden');
    } else {
      dimensions.setAttribute('hidden', '');
    }
    if (trigger) trigger.setAttribute('aria-expanded', String(open));
  };
}

if (!customElements.get('fabric-drawer-component')) {
  customElements.define('fabric-drawer-component', FabricDrawerComponent);
}
