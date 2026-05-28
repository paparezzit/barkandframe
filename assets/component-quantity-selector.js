import { Component } from '@theme/component';
import { QuantitySelectorUpdateEvent } from '@theme/events';

/**
 * A custom element that allows the user to select a quantity.
 *
 * @typedef {Object} Refs
 * @property {HTMLInputElement} quantityInput
 *
 * @extends {Component<Refs>}
 */
class QuantitySelectorComponent extends Component {
  /** @type {HTMLElement | null} */
  #pressedButton = null;

  /** @type {HTMLElement | null} */
  #pressedIcon = null;

  connectedCallback() {
    super.connectedCallback();

    if (!this.closest('.product-details')) return;

    this.addEventListener('pointerdown', this.#handlePressStart);
    this.addEventListener('pointerup', this.#clearPressedButton);
    this.addEventListener('pointerleave', this.#clearPressedButton);
    this.addEventListener('pointercancel', this.#clearPressedButton);
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    this.removeEventListener('pointerdown', this.#handlePressStart);
    this.removeEventListener('pointerup', this.#clearPressedButton);
    this.removeEventListener('pointerleave', this.#clearPressedButton);
    this.removeEventListener('pointercancel', this.#clearPressedButton);
  }

  /**
   * Adds a pressed visual state to product detail quantity buttons.
   * @param {PointerEvent} event - The pointer event.
   */
  #handlePressStart = (event) => {
    if (!(event.target instanceof HTMLElement)) return;

    const button = event.target.closest('.quantity-minus, .quantity-plus');
    if (!(button instanceof HTMLElement) || !this.contains(button)) return;

    this.#clearPressedButton();
    this.#pressedButton = button;
    this.#pressedIcon = button.querySelector('.svg-wrapper svg, .svg-wrapper');
    button.classList.add('quantity-button--pressed');
    if (this.#pressedIcon) this.#pressedIcon.style.transform = 'scale(0.9)';
  };

  #clearPressedButton = () => {
    this.#pressedButton?.classList.remove('quantity-button--pressed');
    if (this.#pressedIcon) this.#pressedIcon.style.transform = '';
    this.#pressedButton = null;
    this.#pressedIcon = null;
  };

  /**
   * Handles the quantity increase event.
   * @param {Event} event - The event.
   */
  increaseQuantity(event) {
    if (!(event.target instanceof HTMLElement)) return;

    event.preventDefault();
    this.refs.quantityInput.stepUp();
    this.#onQuantityChange();
  }

  /**
   * Handles the quantity decrease event.
   * @param {Event} event - The event.
   */
  decreaseQuantity(event) {
    if (!(event.target instanceof HTMLElement)) return;

    event.preventDefault();
    this.refs.quantityInput.stepDown();
    this.#onQuantityChange();
  }

  /**
   * When our input gets focused, we want to fully select the value.
   * @param {FocusEvent} event
   */
  selectInputValue(event) {
    const { quantityInput } = this.refs;
    if (!(event.target instanceof HTMLInputElement) || document.activeElement !== quantityInput) return;

    quantityInput.select();
  }

  /**
   * Handles the quantity set event.
   * @param {Event} event - The event.
   */
  setQuantity(event) {
    if (!(event.target instanceof HTMLElement)) return;

    event.preventDefault();
    if (event.target instanceof HTMLInputElement) {
      this.refs.quantityInput.value = event.target.value;
    }
    this.#onQuantityChange();
  }

  /**
   * Handles the quantity change event.
   */
  #onQuantityChange() {
    const { quantityInput } = this.refs;

    this.#checkQuantityRules();
    const newValue = parseInt(quantityInput.value);

    quantityInput.dispatchEvent(new QuantitySelectorUpdateEvent(newValue, Number(quantityInput.dataset.cartLine)));
  }

  /**
   * Checks the quantity rules are met
   */
  #checkQuantityRules = () => {
    const { quantityInput } = this.refs;
    const { min, max, value: newValue } = quantityInput;

    if (newValue < min && min) quantityInput.value = min;
    if (newValue > max && max) quantityInput.value = max;
  };

  /**
   * Gets the quantity input.
   * @returns {HTMLInputElement} The quantity input.
   */
  get quantityInput() {
    if (!this.refs.quantityInput) {
      throw new Error('Missing <input ref="quantityInput" /> inside <quantity-selector-component />');
    }

    return this.refs.quantityInput;
  }
}

if (!customElements.get('quantity-selector-component')) {
  customElements.define('quantity-selector-component', QuantitySelectorComponent);
}
