import { mediaQueryLarge, isMobileBreakpoint } from '@theme/utilities';

// Accordion
class AccordionCustom extends HTMLElement {
  /** @returns {HTMLDetailsElement|null} */
  get #nativeDetails() {
    return /** @type {HTMLDetailsElement|null} */ (this.querySelector('details'));
  }

  /** @returns {HTMLDetailsElement|HTMLElement|null} */
  get details() {
    return this.querySelector('details') ?? this.querySelector('.details');
  }

  /** @returns {HTMLElement|null} */
  get summary() {
    return this.querySelector('details summary') ?? this.querySelector('.details__header');
  }

  get #isOpen() {
    return this.#nativeDetails ? this.#nativeDetails.open : this.hasAttribute('open');
  }

  get #disableOnMobile() {
    return this.dataset.disableOnMobile === 'true';
  }

  get #disableOnDesktop() {
    return this.dataset.disableOnDesktop === 'true';
  }

  get #closeWithEscape() {
    return this.dataset.closeWithEscape === 'true';
  }

  #controller = new AbortController();

  connectedCallback() {
    const { signal } = this.#controller;

    this.#setDefaultOpenState();

    this.addEventListener('keydown', this.#handleKeyDown, { signal });
    this.summary?.addEventListener('click', this.handleClick, { signal });
    mediaQueryLarge.addEventListener('change', this.#handleMediaQueryChange, { signal });

    // For native <details>: close siblings on toggle
    if (this.#nativeDetails) {
      this.#nativeDetails.addEventListener('toggle', this.#handleNativeToggle, { signal });
    }
  }

  disconnectedCallback() {
    this.#controller.abort();
  }

  /**
   * Opens this accordion, animating if div-based.
   */
  open() {
    this.#closeSiblings();

    if (this.#nativeDetails) {
      this.#nativeDetails.open = true;
    } else {
      this.setAttribute('open', '');
      this.summary?.setAttribute('aria-expanded', 'true');
    }
  }

  /**
   * Closes this accordion, animating if div-based.
   */
  close() {
    if (this.#nativeDetails) {
      this.#nativeDetails.open = false;
    } else {
      this.removeAttribute('open');
      this.summary?.setAttribute('aria-expanded', 'false');
    }
  }

  #closeSiblings() {
    const accordion = this.closest('.accordion');
    if (!accordion) return;
    accordion.querySelectorAll('accordion-custom').forEach((other) => {
      if (other !== this) /** @type {AccordionCustom} */ (other).close();
    });
  }

  /**
   * For native <details>: fires after browser toggles open state.
   */
  #handleNativeToggle = () => {
    if (this.#nativeDetails?.open) {
      this.#closeSiblings();
    }
  };

  /**
   * Handles the click event.
   * @param {Event} event
   */
  handleClick = (event) => {
    const isMobile = isMobileBreakpoint();
    const isDesktop = !isMobile;

    if ((isMobile && this.#disableOnMobile) || (isDesktop && this.#disableOnDesktop)) {
      event.preventDefault();
      return;
    }

    // Div-based: browser won't handle toggle, so we do it manually.
    if (!this.#nativeDetails) {
      event.preventDefault();
      if (this.#isOpen) {
        this.close();
      } else {
        this.open();
      }
    }
  };

  #handleMediaQueryChange = () => {
    this.#setDefaultOpenState();
  };

  #setDefaultOpenState() {
    const isMobile = isMobileBreakpoint();
    const shouldBeOpen =
      (isMobile && this.hasAttribute('open-by-default-on-mobile')) ||
      (!isMobile && this.hasAttribute('open-by-default-on-desktop'));

    if (shouldBeOpen) {
      this.open();
    } else {
      this.close();
    }
  }

  /**
   * @param {KeyboardEvent} event
   */
  #handleKeyDown(event) {
    if (event.key === 'Escape' && this.#closeWithEscape) {
      event.preventDefault();
      this.close();
      this.summary?.focus();
    }
  }
}

if (!customElements.get('accordion-custom')) {
  customElements.define('accordion-custom', AccordionCustom);
}
