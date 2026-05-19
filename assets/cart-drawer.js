import { DialogComponent } from '@theme/dialog';
import { CartAddEvent } from '@theme/events';

/**
 * A custom element that manages a cart drawer.
 *
 * @extends {DialogComponent}
 */
class CartDrawerComponent extends DialogComponent {
  connectedCallback() {
    super.connectedCallback();
    document.addEventListener(CartAddEvent.eventName, this.#handleCartAdd);
    this.addEventListener('wheel', this.#handleWheel, { passive: false });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener(CartAddEvent.eventName, this.#handleCartAdd);
    this.removeEventListener('wheel', this.#handleWheel);
  }

  #handleWheel = (event) => {
    const scrollable = this.querySelector('.cart-drawer__items');
    if (!scrollable) return;
    const { deltaY } = event;
    const { scrollTop, scrollHeight, clientHeight } = scrollable;
    const atTop = deltaY < 0 && scrollTop === 0;
    const atBottom = deltaY > 0 && scrollTop + clientHeight >= scrollHeight;
    if (!atTop && !atBottom) {
      event.preventDefault();
      scrollable.scrollTop += deltaY;
    }
  };

  #handleCartAdd = () => {
    if (this.hasAttribute('auto-open')) {
      this.showDialog();
    }
  };

  open() {
    this.showDialog();

    /**
     * Close cart drawer when installments CTA is clicked to avoid overlapping dialogs
     */
    customElements.whenDefined('shopify-payment-terms').then(() => {
      const installmentsContent = document.querySelector('shopify-payment-terms')?.shadowRoot;
      const cta = installmentsContent?.querySelector('#shopify-installments-cta');
      cta?.addEventListener('click', this.closeDialog, { once: true });
    });
  }

  close() {
    this.closeDialog();
  }
}

if (!customElements.get('cart-drawer-component')) {
  customElements.define('cart-drawer-component', CartDrawerComponent);
}
