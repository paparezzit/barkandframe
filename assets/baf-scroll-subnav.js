(() => {
  const selector = '[data-baf-scroll-subnav]';
  const state = window.BAFScrollSubnav || {
    navs: new Set(),
    lastScrollY: Math.max(window.scrollY || 0, 0),
    ticking: false,
    bound: false,
    lenisBound: false,
  };

  window.BAFScrollSubnav = state;

  document.querySelectorAll(selector).forEach((nav) => {
    if (nav instanceof HTMLElement) state.navs.add(nav);
  });

  if (state.bound) return;
  state.bound = true;

  const threshold = 6;

  const setHidden = (hidden) => {
    state.navs.forEach((nav) => {
      if (!document.documentElement.contains(nav)) {
        state.navs.delete(nav);
        return;
      }
      nav.classList.toggle('is-hidden-on-scroll', hidden);
    });
  };

  const updateFromScrollY = (currentScrollY) => {
    const delta = currentScrollY - state.lastScrollY;

    if (currentScrollY <= 4 || delta < -threshold) {
      setHidden(false);
    } else if (delta > threshold) {
      setHidden(true);
    }

    state.lastScrollY = currentScrollY;
  };

  const update = () => {
    updateFromScrollY(Math.max(window.scrollY || 0, 0));
    state.ticking = false;
  };

  const onScroll = () => {
    if (state.ticking) return;
    state.ticking = true;
    window.requestAnimationFrame(update);
  };

  window.addEventListener('scroll', onScroll, { passive: true });

  const bindLenis = () => {
    const lenis = window.BarkFrameLenis;
    if (state.lenisBound || !lenis?.on) return;

    state.lenisBound = true;
    lenis.on('scroll', ({ scroll, direction }) => {
      const currentScrollY = Math.max(scroll || window.scrollY || 0, 0);

      if (currentScrollY <= 4 || direction < 0) {
        setHidden(false);
      } else if (direction > 0) {
        setHidden(true);
      }

      state.lastScrollY = currentScrollY;
    });
  };

  bindLenis();
  document.addEventListener('DOMContentLoaded', bindLenis, { once: true });
  window.addEventListener('load', bindLenis, { once: true });
})();
