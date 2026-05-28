import { Component } from '@theme/component';
import { ThemeEvents, VariantUpdateEvent, ZoomMediaSelectedEvent } from '@theme/events';

/**
 * A custom element that renders a media gallery.
 *
 * @typedef {object} Refs
 * @property {import('./zoom-dialog').ZoomDialog} [zoomDialogComponent] - The zoom dialog component.
 * @property {import('./slideshow').Slideshow} [slideshow] - The slideshow component.
 * @property {HTMLElement[]} [media] - The media elements.
 *
 * @extends Component<Refs>
 */
export class MediaGallery extends Component {
  #lightboxItems = [];
  #lightboxIndex = 0;
  #pointerDownPosition = { x: 0, y: 0 };

  connectedCallback() {
    super.connectedCallback();

    const { signal } = this.#controller;
    const target = this.closest('.shopify-section, dialog');

    target?.addEventListener(ThemeEvents.variantUpdate, this.#handleVariantUpdate, { signal });
    this.refs.zoomDialogComponent?.addEventListener(ThemeEvents.zoomMediaSelected, this.#handleZoomMediaSelected, {
      signal,
    });
    this.addEventListener('pointerdown', this.#handleLightboxPointerDown, { signal });
    this.addEventListener('click', this.#handleLightboxClick, { signal });
    this.#bindLightboxControls(signal);
  }

  #controller = new AbortController();

  disconnectedCallback() {
    super.disconnectedCallback();

    this.#controller.abort();
  }

  /**
   * Handles a variant update event by replacing the current media gallery with a new one.
   *
   * @param {VariantUpdateEvent} event - The variant update event.
   */
  #handleVariantUpdate = async (event) => {
    const source = event.detail.data.html;

    if (!source) return;
    const newMediaGallery = source.querySelector('media-gallery');

    if (!newMediaGallery) return;

    const selectedMediaId = source.querySelector(
      'variant-picker fieldset input:checked[data-option-media-id], variant-picker select option[selected][data-option-media-id]'
    )?.dataset.optionMediaId;
    const sourceMediaId = source.querySelector(
      `variant-picker [data-option-value-id="${event.detail.sourceId}"][data-option-media-id]`
    )?.dataset.optionMediaId;
    const featuredMediaIds = [
      event.detail.resource?.featured_media?.id,
      event.detail.resource?.featured_image?.id,
      selectedMediaId,
      sourceMediaId,
    ];

    this.replaceWith(newMediaGallery);
    MediaGallery.#selectMedia(newMediaGallery, featuredMediaIds, 20);
  };

  /**
   * Selects a media slide after a gallery has been replaced.
   * @param {MediaGallery} gallery
   * @param {Array<string | number | undefined> | string | number | undefined} mediaIds
   * @param {number} attempts
   */
  static #selectMedia(gallery, mediaIds, attempts = 10) {
    const ids = (Array.isArray(mediaIds) ? mediaIds : [mediaIds]).filter(Boolean).map(String);
    if (!ids.length || !gallery.isConnected) return;

    const slideshow = gallery.slideshow;
    const slides = slideshow?.refs?.slides;
    const targetSlide = slides?.find((slide) => ids.includes(String(slide.getAttribute('slide-id'))));
    const mediaId = targetSlide?.getAttribute('slide-id');

    if (slideshow && targetSlide && mediaId) {
      const targetIndex = slides?.indexOf(targetSlide) ?? -1;
      const scroller = slideshow.refs?.scroller;

      try {
        slideshow.select({ id: mediaId }, undefined, { animate: false });
      } catch {
        // The freshly replaced slideshow can need one frame before its scroller is ready.
      }

      if (targetIndex >= 0 && scroller) {
        targetSlide.removeAttribute('hidden');
        targetSlide.setAttribute('aria-hidden', 'false');
        scroller.scrollTo({ left: targetSlide.offsetLeft, behavior: 'auto' });
        slideshow.current = targetIndex;
      }

      if (attempts > 0) setTimeout(() => MediaGallery.#selectMedia(gallery, ids, attempts - 1), 50);
      return;
    }

    if (attempts <= 0) return;
    setTimeout(() => MediaGallery.#selectMedia(gallery, ids, attempts - 1), 50);
  }

  /**
   * Stores pointer position so horizontal swipes don't open the lightbox.
   * @param {PointerEvent} event
   */
  #handleLightboxPointerDown = (event) => {
    this.#pointerDownPosition = { x: event.clientX, y: event.clientY };
  };

  /**
   * Opens the product gallery lightbox when an image is clicked.
   * @param {MouseEvent} event
   */
  #handleLightboxClick = (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('button, a, input, select, textarea, model-viewer, deferred-media, slideshow-arrows, slideshow-controls')) {
      return;
    }

    if (Math.abs(event.clientX - this.#pointerDownPosition.x) > 8 || Math.abs(event.clientY - this.#pointerDownPosition.y) > 8) {
      return;
    }

    const item = event.target.closest('[data-product-lightbox-src]');
    if (!(item instanceof HTMLElement) || !this.contains(item)) return;

    const items = this.#getLightboxItems();
    const index = items.findIndex((entry) => entry.element === item);
    if (index < 0) return;

    this.#openLightbox(index);
  };

  #getLightbox() {
    return this.closest('.shopify-section')?.querySelector('[data-product-gallery-lightbox]');
  }

  #getLightboxItems() {
    return Array.from(this.querySelectorAll('[data-product-lightbox-src]')).map((element) => ({
      element,
      src: element.getAttribute('data-product-lightbox-src') || '',
      alt: element.getAttribute('data-product-lightbox-alt') || '',
    }));
  }

  #bindLightboxControls(signal) {
    const lightbox = this.#getLightbox();
    if (!(lightbox instanceof HTMLElement)) return;

    lightbox.querySelector('[data-product-lightbox-close]')?.addEventListener('click', this.#closeLightbox, { signal });
    lightbox.querySelector('[data-product-lightbox-backdrop]')?.addEventListener('click', this.#closeLightbox, { signal });
    lightbox.querySelector('.at-home-lightbox__stage')?.addEventListener('click', this.#handleLightboxStageClick, { signal });
    lightbox.querySelector('[data-product-lightbox-prev]')?.addEventListener('click', () => this.#showLightboxImage(this.#lightboxIndex - 1), { signal });
    lightbox.querySelector('[data-product-lightbox-next]')?.addEventListener('click', () => this.#showLightboxImage(this.#lightboxIndex + 1), { signal });
    document.addEventListener('keydown', this.#handleLightboxKeydown, { signal });
  }

  #handleLightboxStageClick = (event) => {
    if (!(event.currentTarget instanceof HTMLElement)) return;

    const image = event.currentTarget.querySelector('[data-product-lightbox-img]');
    if (!(image instanceof HTMLImageElement)) {
      if (event.target === event.currentTarget) this.#closeLightbox();
      return;
    }

    const imageRect = MediaGallery.#containedImageRect(image);
    const isInsideImage =
      event.clientX >= imageRect.left &&
      event.clientX <= imageRect.right &&
      event.clientY >= imageRect.top &&
      event.clientY <= imageRect.bottom;

    if (!isInsideImage) this.#closeLightbox();
  };

  static #containedImageRect(image) {
    const rect = image.getBoundingClientRect();
    const naturalWidth = image.naturalWidth || Number(image.getAttribute('width')) || rect.width;
    const naturalHeight = image.naturalHeight || Number(image.getAttribute('height')) || rect.height;
    const imageRatio = naturalWidth / naturalHeight;
    const boxRatio = rect.width / rect.height;

    let width = rect.width;
    let height = rect.height;

    if (boxRatio > imageRatio) {
      height = rect.height;
      width = height * imageRatio;
    } else {
      width = rect.width;
      height = width / imageRatio;
    }

    const left = rect.left + (rect.width - width) / 2;
    const top = rect.top + (rect.height - height) / 2;

    return {
      left,
      top,
      right: left + width,
      bottom: top + height,
    };
  }

  #openLightbox(index) {
    const lightbox = this.#getLightbox();
    if (!(lightbox instanceof HTMLElement)) return;

    this.#lightboxItems = this.#getLightboxItems();
    this.#showLightboxImage(index);
    lightbox.classList.add('is-open');
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  #showLightboxImage(index) {
    const lightbox = this.#getLightbox();
    if (!(lightbox instanceof HTMLElement) || !this.#lightboxItems.length) return;

    this.#lightboxIndex = (index + this.#lightboxItems.length) % this.#lightboxItems.length;
    const item = this.#lightboxItems[this.#lightboxIndex];
    const image = lightbox.querySelector('[data-product-lightbox-img]');
    if (image instanceof HTMLImageElement && item) {
      image.src = item.src;
      image.alt = item.alt;
    }

    const hasMultiple = this.#lightboxItems.length > 1;
    lightbox.querySelectorAll('[data-product-lightbox-prev], [data-product-lightbox-next]').forEach((button) => {
      if (button instanceof HTMLElement) button.style.display = hasMultiple ? '' : 'none';
    });
  }

  #closeLightbox = () => {
    const lightbox = this.#getLightbox();
    if (!(lightbox instanceof HTMLElement)) return;

    lightbox.classList.remove('is-open');
    lightbox.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';

    const image = lightbox.querySelector('[data-product-lightbox-img]');
    if (image instanceof HTMLImageElement) {
      setTimeout(() => {
        if (!lightbox.classList.contains('is-open')) image.src = '';
      }, 300);
    }
  };

  /**
   * @param {KeyboardEvent} event
   */
  #handleLightboxKeydown = (event) => {
    const lightbox = this.#getLightbox();
    if (!(lightbox instanceof HTMLElement) || !lightbox.classList.contains('is-open')) return;

    if (event.key === 'Escape') this.#closeLightbox();
    if (event.key === 'ArrowLeft') this.#showLightboxImage(this.#lightboxIndex - 1);
    if (event.key === 'ArrowRight') this.#showLightboxImage(this.#lightboxIndex + 1);
  };

  /**
   * Handles the 'zoom-media:selected' event.
   * @param {ZoomMediaSelectedEvent} event - The zoom-media:selected event.
   */
  #handleZoomMediaSelected = async (event) => {
    this.slideshow?.select(event.detail.index, undefined, { animate: false });
  };

  /**
   * Zooms the media gallery.
   *
   * @param {number} index - The index of the media to zoom.
   * @param {PointerEvent} event - The pointer event.
   */
  zoom(index, event) {
    this.refs.zoomDialogComponent?.open(index, event);
  }

  get slideshow() {
    return this.refs.slideshow;
  }

  get media() {
    return this.refs.media;
  }

  get presentation() {
    return this.dataset.presentation;
  }
}

if (!customElements.get('media-gallery')) {
  customElements.define('media-gallery', MediaGallery);
}
