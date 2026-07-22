import { Component } from '@theme/component';
import { debounce, isDesktopBreakpoint, mediaQueryLarge, requestYieldCallback } from '@theme/utilities';
import { SlideshowSelectEvent } from '@theme/events';

/**
 * A custom element that displays a product card.
 *
 * @typedef {object} Refs
 * @property {HTMLAnchorElement} productCardLink - The product card link element.
 * @property {import('slideshow').Slideshow} [slideshow] - The slideshow component.
 * @property {import('quick-add').QuickAddComponent} [quickAdd] - The quick add component.
 * @property {HTMLElement} [cardGallery] - The card gallery component.
 *
 * @extends {Component<Refs>}
 */
export class ProductCard extends Component {
  requiredRefs = ['productCardLink'];

  get productPageUrl() {
    return this.refs.productCardLink.href;
  }

  get isInProductListing() {
    return this.closest('.product-grid, .shop-products__product-grid, .shop-products__rail-track, .more-from__grid') !== null;
  }

  /**
   * Gets the currently selected variant ID from the product card
   * @returns {string | null} The variant ID or null if none selected
   */
  getSelectedVariantId() {
    const checkedInput = /** @type {HTMLInputElement | null} */ (
      this.querySelector('input[type="radio"]:checked[data-variant-id]')
    );

    return checkedInput?.dataset.variantId || null;
  }

  /**
   * Gets the product card link element
   * @returns {HTMLAnchorElement | null} The product card link or null
   */
  getProductCardLink() {
    return this.refs.productCardLink || null;
  }

  #fetchProductPageHandler = () => {
    this.refs.quickAdd?.fetchProductPage(this.productPageUrl);
  };

  /**
   * Navigates to a URL link. Respects modifier keys for opening in new tab/window.
   * @param {Event} event - The event that triggered the navigation.
   * @param {URL} url - The URL to navigate to.
   */
  #navigateToURL = (event, url) => {
    // Check for modifier keys that should open in new tab/window (only for mouse events)
    const shouldOpenInNewTab =
      event instanceof MouseEvent && (event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1);

    if (shouldOpenInNewTab) {
      event.preventDefault();
      window.open(url.href, '_blank');
      return;
    } else {
      window.location.href = url.href;
    }
  };

  connectedCallback() {
    super.connectedCallback();

    const link = this.refs.productCardLink;
    if (!(link instanceof HTMLAnchorElement)) throw new Error('Product card link not found');
    this.#handleQuickAdd();

    this.addEventListener(SlideshowSelectEvent.eventName, this.#handleSlideshowSelect);
    mediaQueryLarge.addEventListener('change', this.#handleQuickAdd);

    this.addEventListener('click', this.navigateToProduct);

    // Preload the next image on the slideshow to avoid white flashes on previewImage
    setTimeout(() => {
      if (this.refs.slideshow?.isNested) {
        this.#preloadNextPreviewImage();
      }
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener('click', this.navigateToProduct);
  }

  #preloadNextPreviewImage() {
    const currentSlide = this.refs.slideshow?.slides?.[this.refs.slideshow?.current];
    currentSlide?.nextElementSibling?.querySelector('img[loading="lazy"]')?.removeAttribute('loading');
  }

  /**
   * Handles the quick add event.
   */
  #handleQuickAdd = () => {
    this.removeEventListener('pointerenter', this.#fetchProductPageHandler);
    this.removeEventListener('focusin', this.#fetchProductPageHandler);

    if (isDesktopBreakpoint()) {
      this.addEventListener('pointerenter', this.#fetchProductPageHandler);
      this.addEventListener('focusin', this.#fetchProductPageHandler);
    }
  };

  /** @type {number | null} */
  #previousSlideIndex = null;

  /**
   * Handles the slideshow select event.
   * @param {SlideshowSelectEvent} event - The slideshow select event.
   */
  #handleSlideshowSelect = (event) => {
    if (this.isInProductListing) return;

    if (event.detail.userInitiated) {
      this.#previousSlideIndex = event.detail.index;
    }
  };

  /**
   * Previews a variant.
   * @param {string} id - The id of the variant to preview.
   */
  previewVariant(id) {
    const { slideshow } = this.refs;

    if (!slideshow) return;

    this.resetVariant.cancel();
    slideshow.select({ id }, undefined, { animate: false });
  }

  /**
   * Previews the next image.
   * @param {PointerEvent} event - The pointer event.
   */
  previewImage(event) {
    if (this.isInProductListing) return;

    if (event.pointerType !== 'mouse') return;

    const { slideshow } = this.refs;

    if (!slideshow) return;

    this.resetVariant.cancel();

    if (this.#previousSlideIndex != null && this.#previousSlideIndex > 0) {
      slideshow.select(this.#previousSlideIndex, undefined, { animate: false });
    } else {
      slideshow.next(undefined, { animate: false });
      setTimeout(() => this.#preloadNextPreviewImage());
    }
  }

  /**
   * Resets the image to the variant image.
   * @param {PointerEvent} event - The pointer event.
   */
  resetImage(event) {
    if (this.isInProductListing) return;

    if (event.pointerType !== 'mouse') return;

    this.#resetVariant();
  }

  /**
   * Resets the image to the variant image.
   */
  #resetVariant = () => {
    const { slideshow } = this.refs;

    if (!slideshow) return;

    const initialSlide = slideshow.initialSlide;
    const slideId = initialSlide?.getAttribute('slide-id');
    if (initialSlide && slideshow.slides?.includes(initialSlide) && slideId) {
      slideshow.select({ id: slideId }, undefined, { animate: false });
      return;
    }

    // No valid initial slide or selected variant - go to previous
    slideshow.previous(undefined, { animate: false });
  };

  /**
   * Intercepts the click event on the product card anchor, we want
   * to use this to add an intermediate state to the history.
   * This intermediate state captures the page we were on so that we
   * navigate back to the same page when the user navigates back.
   * In addition to that, it captures the product card anchor so that we
   * have the specific product card in view.
   *
   * A product card can have other interactive elements like variant picker,
   * so we do not navigate if the click was on one of those elements.
   *
   * @param {Event} event
   */
  navigateToProduct = (event) => {
    if (!(event.target instanceof Element)) return;

    // Don't navigate if this product card is marked as no-navigation (e.g., in theme editor)
    if (this.hasAttribute('data-no-navigation')) return;

    const interactiveElement = event.target.closest('button, input, label, select, [tabindex="1"]');

    // If the click was on an interactive element, do nothing.
    if (interactiveElement) {
      return;
    }

    const link = this.refs.productCardLink;
    if (!link.href) return;
    const linkURL = new URL(link.href);

    const productCardAnchor = link.getAttribute('id');
    if (!productCardAnchor) return;

    const url = new URL(window.location.href);
    const parent = this.closest('li');
    url.hash = productCardAnchor;
    if (parent && parent.dataset.page) {
      url.searchParams.set('page', parent.dataset.page);
    }

    if (!window.Shopify.designMode) {
      requestYieldCallback(() => {
        history.replaceState({}, '', url.toString());
      });
    }

    const targetLink = event.target.closest('a');
    // Let the native navigation handle the click if it was on a link.
    if (!targetLink) {
      this.#navigateToURL(event, linkURL);
    }
  };

  /**
   * Resets the variant.
   */
  resetVariant = debounce(this.#resetVariant, 100);
}

if (!customElements.get('product-card')) {
  customElements.define('product-card', ProductCard);
}
