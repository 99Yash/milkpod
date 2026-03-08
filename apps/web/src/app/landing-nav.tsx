'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

const sections = [
  { id: 'overview', label: 'Overview', href: '#overview' },
  { id: 'features', label: 'Features', href: '#features' },
  { id: 'faq', label: 'FAQ', href: '#faq' },
] as const;

export function LandingNav() {
  const [active, setActive] = useState('overview');
  const linkRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [dotStyle, setDotStyle] = useState({ left: 0, width: 0 });
  const navContainerRef = useRef<HTMLDivElement>(null);

  const updateDot = useCallback(
    (id: string) => {
      const el = linkRefs.current[id];
      const container = navContainerRef.current;
      if (!el || !container) return;
      const elRect = el.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      setDotStyle({
        left: elRect.left - containerRect.left + elRect.width / 2,
        width: 4,
      });
    },
    [],
  );

  useEffect(() => {
    // The scroll container is .app-shell-scroll, not window
    const scrollRoot = document.querySelector('.app-shell-scroll');
    if (!scrollRoot) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the most visible section
        let best: { id: string; ratio: number } | null = null;
        for (const entry of entries) {
          if (
            entry.isIntersecting &&
            (!best || entry.intersectionRatio > best.ratio)
          ) {
            best = { id: entry.target.id, ratio: entry.intersectionRatio };
          }
        }
        if (best) {
          setActive(best.id);
        }
      },
      {
        root: scrollRoot,
        threshold: [0.1, 0.3, 0.5],
        rootMargin: '-80px 0px -40% 0px',
      },
    );

    for (const section of sections) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, []);

  // Update dot position when active changes
  useEffect(() => {
    updateDot(active);
  }, [active, updateDot]);

  // Also update on resize
  useEffect(() => {
    const onResize = () => updateDot(active);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [active, updateDot]);

  // Initial dot position after mount
  useEffect(() => {
    requestAnimationFrame(() => updateDot('overview'));
  }, [updateDot]);

  const handleClick = (id: string) => {
    const scrollRoot = document.querySelector('.app-shell-scroll');
    const target = document.getElementById(id);
    if (!scrollRoot || !target) return;
    const offset = target.offsetTop - 80;
    scrollRoot.scrollTo({ top: offset, behavior: 'smooth' });
  };

  return (
    <nav className="fixed left-1/2 top-5 z-50 -translate-x-1/2">
      <div className="flex items-center gap-1 rounded-full border border-landing-glass-border bg-landing-glass px-1.5 py-1 shadow-lg shadow-black/10 backdrop-blur-xl">
        <Link href="/" className="flex items-center gap-2 px-3 py-1.5">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[color:var(--milkpod-ocean)] text-[8px] font-bold uppercase tracking-wider text-white">
            M
          </div>
          <span className="text-sm font-medium">milkpod</span>
        </Link>
        <div
          ref={navContainerRef}
          className="relative hidden items-center gap-0.5 sm:flex"
        >
          {sections.map((section) => (
            <a
              key={section.id}
              ref={(el) => {
                linkRefs.current[section.id] = el;
              }}
              href={section.href}
              onClick={(e) => {
                e.preventDefault();
                handleClick(section.id);
              }}
              className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition ${
                active === section.id
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {section.label}
            </a>
          ))}
          {/* Active dot indicator */}
          <div
            className="absolute -bottom-1 h-1 w-1 rounded-full bg-foreground transition-all duration-300 ease-out"
            style={{
              left: dotStyle.left - 2,
              opacity: dotStyle.width ? 1 : 0,
            }}
          />
        </div>
        <Link
          href="/signin"
          className="ml-1 rounded-full bg-landing-cta px-4 py-1.5 text-[13px] font-medium text-white transition hover:bg-landing-cta-hover"
        >
          Start free
        </Link>
      </div>
    </nav>
  );
}
