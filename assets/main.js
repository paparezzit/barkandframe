document.addEventListener('DOMContentLoaded', () => {
  const internalLinkHosts = new Set([
    window.location.hostname,
    "barkandframe.com",
    "www.barkandframe.com",
    "barkandframe.myshopify.com"
  ]);

  document.querySelectorAll("a[href]").forEach(anchor => {
    let url;
    try {
      url = new URL(anchor.getAttribute("href"), window.location.href);
    } catch {
      return;
    }

    if (!["http:", "https:"].includes(url.protocol) || internalLinkHosts.has(url.hostname)) return;

    anchor.setAttribute("target", "_blank");
    const rel = new Set((anchor.getAttribute("rel") || "").split(/\s+/).filter(Boolean));
    rel.add("noopener");
    rel.add("noreferrer");
    anchor.setAttribute("rel", Array.from(rel).join(" "));
  });

  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const isTouchScroll = window.matchMedia('(hover: none), (pointer: coarse)').matches;
  const lenis = isSafari || isTouchScroll ? null : new Lenis();
  window.BarkFrameLenis = lenis;

  if (window.ScrollTrigger?.config) {
    ScrollTrigger.config({ ignoreMobileResize: true });
  }

  if (lenis) {
    function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }

    requestAnimationFrame(raf);

    lenis.on('scroll', ScrollTrigger.update);
  } else if (window.ScrollTrigger?.update) {
    window.addEventListener('scroll', () => ScrollTrigger.update(), { passive: true });
  }

  const floatingParallaxPattern = ["0svh", "-20svh", "-10svh", "0svh", "-20svh"];
  document.querySelectorAll(".floating-images__holder > .product-card--floating").forEach((card, index) => {
    if (!card.dataset.parallax) {
      card.dataset.parallax = floatingParallaxPattern[index % floatingParallaxPattern.length];
    }
  });

  document.querySelectorAll("[data-parallax]").forEach(parallax => {
    const amount = parallax.dataset.parallax ? parallax.dataset.parallax : "-5vh";
    gsap.to(parallax, {y: amount, scrollTrigger: {
        trigger: parallax,
        start: "top bottom",
        end: "+=200%",
        scrub: true,
        toggleActions: "play none reverse none"
    }});
  })

  document.querySelectorAll(".product-card--floating .image-block").forEach(parallax => {
    gsap.to(parallax, {"--floating-image-parallax-y": "-5vh", scrollTrigger: {
        trigger: parallax,
        start: "top bottom",
        end: "+=200%",
        scrub: true,
        toggleActions: "play none reverse none"
    }});
  })
});
