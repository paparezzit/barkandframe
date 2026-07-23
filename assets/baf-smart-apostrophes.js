(() => {
  const SMART_APOSTROPHE = '’';
  const STRAIGHT_APOSTROPHE_IN_WORD = /([A-Za-z0-9])'([A-Za-z0-9])/g;
  const SKIP_SELECTOR = 'script, style, noscript, textarea, code, pre, svg, [contenteditable="true"]';

  const shouldSkip = (node) => {
    const parent = node.parentElement;
    return !parent || parent.closest(SKIP_SELECTOR);
  };

  const normalizeTextNode = (node) => {
    if (!node || node.nodeType !== Node.TEXT_NODE || shouldSkip(node)) return;

    const normalized = node.data.replace(
      STRAIGHT_APOSTROPHE_IN_WORD,
      `$1${SMART_APOSTROPHE}$2`
    );

    if (normalized !== node.data) node.data = normalized;
  };

  const normalizeTree = (root) => {
    if (!root) return;

    if (root.nodeType === Node.TEXT_NODE) {
      normalizeTextNode(root);
      return;
    }

    if (
      root.nodeType !== Node.ELEMENT_NODE &&
      root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE
    ) {
      return;
    }

    if (root.nodeType === Node.ELEMENT_NODE && root.matches(SKIP_SELECTOR)) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      normalizeTextNode(node);
      node = walker.nextNode();
    }
  };

  const init = () => {
    normalizeTree(document.body);

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'characterData') {
          normalizeTextNode(mutation.target);
          return;
        }

        mutation.addedNodes.forEach(normalizeTree);
      });
    });

    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
