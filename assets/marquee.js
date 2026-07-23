import { Component } from '@theme/component';
import { debounce } from '@theme/utilities';


/**
 * A custom element that displays a marquee.
 *
 * @typedef {object} Refs
 * @property {HTMLElement} wrapper - The wrapper element.
 * @property {HTMLElement} content - The content element.
 *
 * @extends Component<Refs>
 */
class MarqueeComponent extends Component {
  requiredRefs = ['wrapper', 'content'];
  #isReady = false;
  #intersectionObserver = null;

  connectedCallback() {
    super.connectedCallback();

    if ('IntersectionObserver' in window) {
      this.#intersectionObserver = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        this.#intersectionObserver?.disconnect();
        this.#intersectionObserver = null;
        this.#init();
      }, { rootMargin: '900px 0px' });

      this.#intersectionObserver.observe(this);
      return;
    }

    this.#init();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#intersectionObserver?.disconnect();
    this.#intersectionObserver = null;
    window.removeEventListener('resize', this.#handleResize);
  }

  #init() {
    if (this.#isReady) return;
    this.#isReady = true;

    const { content } = this.refs;
    if (content.firstElementChild?.children.length === 0) return;

    this.#addRepeatedItems();
    this.#duplicateContent();
    this.#setSpeed();
    this.setAttribute('data-ready', '');

    window.addEventListener('resize', this.#handleResize);
  }

  get clonedContent() {
    const { content, wrapper } = this.refs;
    const lastChild = wrapper.lastElementChild;

    return content !== lastChild ? lastChild : null;
  }

  #setSpeed(value = this.#calculateSpeed()) {
    this.style.setProperty('--marquee-speed', `${value}s`);
  }

  #calculateSpeed() {
    const speedFactor = Number(this.getAttribute('data-speed-factor'));
    // Use the actual travel distance (half the wrapper's scroll width) so that
    // pixels-per-second stays constant regardless of viewport width.
    const travelDistance = this.refs.wrapper.scrollWidth / 2;
    const speed = Math.ceil(travelDistance / speedFactor);
    return speed;
  }

  #handleResize = debounce(() => {
    if (this.hasAttribute('data-disabled')) return;

    const { content } = this.refs;
    const newNumberOfCopies = this.#calculateNumberOfCopies();
    const currentNumberOfCopies = content.children.length;
    const copiesChanged = newNumberOfCopies !== currentNumberOfCopies;

    if (newNumberOfCopies > currentNumberOfCopies) {
      this.#addRepeatedItems(newNumberOfCopies - currentNumberOfCopies);
    } else if (newNumberOfCopies < currentNumberOfCopies) {
      this.#removeRepeatedItems(currentNumberOfCopies - newNumberOfCopies);
    }

    this.#duplicateContent();
    this.#setSpeed();

    // Only restart (jump to time=0) when the number of copies actually changed,
    // i.e. the content layout changed. Avoid restarting on every iOS address-bar
    // resize, which would cause a visible flicker each time the user scrolls.
    if (copiesChanged) {
      this.#restartAnimation();
    }
  }, 250);

  #restartAnimation() {
    const animations = this.refs.wrapper.getAnimations();

    requestAnimationFrame(() => {
      for (const animation of animations) {
        animation.currentTime = 0;
      }
    });
  }

  #duplicateContent() {
    this.clonedContent?.remove();

    const clone = /** @type {HTMLElement} */ (this.refs.content.cloneNode(true));

    clone.setAttribute('aria-hidden', 'true');
    clone.removeAttribute('ref');

    this.refs.wrapper.appendChild(clone);
  }

  #addRepeatedItems(numberOfCopies = this.#calculateNumberOfCopies()) {
    const { content } = this.refs;
    const wrapper = content.firstElementChild;

    if (!wrapper) return;

    for (let i = 0; i < numberOfCopies - 1; i++) {
      const clone = wrapper.cloneNode(true);
      content.appendChild(clone);
    }
  }

  #removeRepeatedItems(numberOfCopies = this.#calculateNumberOfCopies()) {
    const { content } = this.refs;

    for (let i = 0; i < numberOfCopies; i++) {
      content.lastElementChild?.remove();
    }
  }

  #calculateNumberOfCopies() {
    const { content } = this.refs;
    const marqueeWidth = this.offsetWidth;
    const marqueeRepeatedItemWidth =
      content.firstElementChild instanceof HTMLElement ? content.firstElementChild.offsetWidth : 1;

    return marqueeRepeatedItemWidth === 0 ? 1 : Math.ceil(marqueeWidth / marqueeRepeatedItemWidth);
  }
}


if (!customElements.get('marquee-component')) {
  customElements.define('marquee-component', MarqueeComponent);
}
