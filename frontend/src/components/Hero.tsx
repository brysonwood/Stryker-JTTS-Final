import React, { useRef, useEffect } from 'react';

export default function Hero() {
  // Background ref.
  const bgRef = useRef<any>(null);
  // Parallax scroll loop.
  useEffect(() => {
    let raf = 0;
    function update() {
      const scrolled = window.scrollY || 0;
      if (bgRef.current) {
        bgRef.current.style.transform = `translateY(${scrolled * 0.25}px)`;
      }
      raf = requestAnimationFrame(update);
    }
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <section className="hero">
      <div className="hero__bg" ref={bgRef} aria-hidden="true" />
      <div className="hero__content">
        <img src="/src/images/stryker.avif" alt="Stryker logo" className="hero__logo" />
        <h1>Stryker Job & Time Tracking</h1>
        <p className="muted"></p>
      </div>
    </section>
  );
}
