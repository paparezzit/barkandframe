(() => {
  const selector = '[data-baf-scroll-subnav]';
  const state = window.BAFScrollSubnav || {
    navs: new Set(),
    lastScrollY: Math.max(window.scrollY || 0, 0),
    ticking: false,
    bound: false,
  };

  window.BAFScrollSubnav = state;

  document.querySelectorAll(selector).forEach((nav) => {
    if (nav instanceof HTMLElement) state.navs.add(nav);
  });

  if (state.bound) return;
  state.bound = true;

  const threshold = 2;

  const setHidden = (hidden) => {
    state.navs.forEach((nav) => {
      if (!document.documentElement.contains(nav)) {
        state.navs.delete(nav);
        return;
      }
      nav.classList.toggle('is-hidden-on-scroll', hidden);
    });
  };

  const update = () => {
    const currentScrollY = Math.max(window.scrollY || 0, 0);
    const delta = currentScrollY - state.lastScrollY;

    if (currentScrollY <= 4 || delta < -threshold) {
      setHidden(false);
    } else if (delta > threshold) {
      setHidden(true);
    }

    state.lastScrollY = currentScrollY;
    state.ticking = false;
  };

  const onScroll = () => {
    if (state.ticking) return;
    state.ticking = true;
    window.requestAnimationFrame(update);
  };

  window.addEventListener('scroll', onScroll, { passive: true });
})();
