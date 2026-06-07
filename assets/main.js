document.addEventListener('DOMContentLoaded', () => {
  const lenis = new Lenis();
  window.BarkFrameLenis = lenis;

  function raf(time) {
    lenis.raf(time);
    requestAnimationFrame(raf);
  }

  requestAnimationFrame(raf);

  lenis.on('scroll', ScrollTrigger.update);

  const floatingParallaxPattern = ["0vh", "-20vh", "-10vh", "0vh", "-20vh"];
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
