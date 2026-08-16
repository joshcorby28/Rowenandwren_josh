/**
 * Global-E shim
 *
 * When Global-E injects the "This product cannot be shipped to your country"
 * banner onto a product page, replace the default banner with a CTA that
 * routes the shopper to the contact page instead.
 *
 * Placement preference: directly before the "Request fabric swatches" button
 * if it's on the page; otherwise after the product price element.
 */
(function () {
  const TARGET_PHRASE = 'This product cannot be shipped to your country';
  const CONTACT_URL = '/pages/contact';

  const observer = new MutationObserver((mutationsList) => {
    for (const mutation of mutationsList) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (!node.textContent || !node.textContent.includes(TARGET_PHRASE)) continue;

        node.classList.add('not-available-new');

        const btn = document.createElement('button');
        btn.className = 'button button-primary contact-to-purchase';
        btn.type = 'button';
        btn.textContent = 'PLEASE CONTACT US TO PURCHASE';
        btn.addEventListener('click', () => {
          window.location.href = CONTACT_URL;
        });

        const swatchButton = document.querySelector('.request-swatches__button');
        const priceEl = document.querySelector('.product-price, [data-price]');

        const isVisible = (el) => !!(el && el.offsetParent);

        if (isVisible(swatchButton) && swatchButton.parentNode) {
          btn.classList.add('contact-to-purchase--with-swatches');
          swatchButton.parentNode.insertBefore(btn, swatchButton);
        } else if (priceEl) {
          priceEl.insertAdjacentElement('afterend', btn);
        }

        observer.disconnect();
        return;
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
})();
