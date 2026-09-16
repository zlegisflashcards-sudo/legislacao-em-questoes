"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type HeroSlide = {
  src: string;
  alt: string;
  href?: string;
};

const SLIDES: HeroSlide[] = [
  {
    src: "/banners/home/metodo-legis-flashcards.png",
    alt: "Conheça o método Legis Flashcards",
  },
  {
    src: "/banners/home/legis-questoes.png",
    alt: "Legis Questões",
  },
  {
    src: "/banners/home/anki.png",
    alt: "Anki com Legis Questões",
  },
  {
    src: "/banners/home/legiscast.png",
    alt: "LegisCast",
  },
  {
    src: "/banners/home/legislacao-esquematizada.png",
    alt: "Legislação esquematizada",
  },
];

const AUTOPLAY_INTERVAL_MS = 5_500;
const SWIPE_THRESHOLD_PX = 45;

export function SiteHeroCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [userInteracted, setUserInteracted] = useState(false);
  const [pointerInside, setPointerInside] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(mediaQuery.matches);

    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);

    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    if (userInteracted || pointerInside || reducedMotion) return;

    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % SLIDES.length);
    }, AUTOPLAY_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [pointerInside, reducedMotion, userInteracted]);

  function selectSlide(index: number) {
    setUserInteracted(true);
    setActiveIndex((index + SLIDES.length) % SLIDES.length);
  }

  function finishSwipe(clientX: number) {
    if (touchStartX.current === null) return;

    const distance = clientX - touchStartX.current;
    touchStartX.current = null;

    if (Math.abs(distance) < SWIPE_THRESHOLD_PX) return;
    selectSlide(activeIndex + (distance < 0 ? 1 : -1));
  }

  return (
    <section
      aria-label="Destaques Legis Flashcards"
      aria-roledescription="carrossel"
      className="w-full"
      onMouseEnter={() => setPointerInside(true)}
      onMouseLeave={() => setPointerInside(false)}
      onFocusCapture={() => setPointerInside(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setPointerInside(false);
        }
      }}
    >
      <div
        className="relative aspect-[1672/941] w-full touch-pan-y overflow-hidden rounded-2xl border border-blue-300/20 bg-[#061a33]"
        onTouchStart={(event) => {
          touchStartX.current = event.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(event) => {
          finishSwipe(event.changedTouches[0]?.clientX ?? 0);
        }}
        onTouchCancel={() => {
          touchStartX.current = null;
        }}
      >
        <div
          className="flex h-full w-full"
          style={{
            transform: `translateX(-${activeIndex * 100}%)`,
            transition: reducedMotion ? "none" : "transform 600ms ease-in-out",
          }}
        >
          {SLIDES.map((slide, index) => {
            const image = (
              <Image
                src={slide.src}
                alt={slide.alt}
                fill
                priority={index === 0}
                sizes="(min-width: 1152px) 1152px, (min-width: 640px) calc(100vw - 48px), calc(100vw - 32px)"
                className="object-contain"
              />
            );

            return (
              <div
                key={slide.src}
                aria-hidden={index !== activeIndex}
                aria-label={`${index + 1} de ${SLIDES.length}`}
                aria-roledescription="slide"
                className="relative h-full min-w-full"
                role="group"
              >
                {slide.href ? (
                  <Link href={slide.href} tabIndex={index === activeIndex ? 0 : -1}>
                    {image}
                  </Link>
                ) : (
                  image
                )}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          aria-label="Banner anterior"
          onClick={() => selectSlide(activeIndex - 1)}
          className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/40 bg-[#061a33]/70 text-2xl font-bold text-white backdrop-blur-sm transition hover:bg-[#061a33]/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:left-4"
        >
          <span aria-hidden="true">‹</span>
        </button>

        <button
          type="button"
          aria-label="Próximo banner"
          onClick={() => selectSlide(activeIndex + 1)}
          className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/40 bg-[#061a33]/70 text-2xl font-bold text-white backdrop-blur-sm transition hover:bg-[#061a33]/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:right-4"
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>

      <div className="mt-3 flex items-center justify-center gap-2" aria-label="Selecionar banner">
        {SLIDES.map((slide, index) => (
          <button
            key={slide.src}
            type="button"
            aria-label={`Mostrar banner ${index + 1}: ${slide.alt}`}
            aria-current={index === activeIndex ? "true" : undefined}
            onClick={() => selectSlide(index)}
            className={`h-3 w-3 rounded-full border transition ${
              index === activeIndex
                ? "border-blue-700 bg-blue-700"
                : "border-slate-400 bg-white hover:border-blue-600"
            }`}
          />
        ))}
      </div>
    </section>
  );
}
