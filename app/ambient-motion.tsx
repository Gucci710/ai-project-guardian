"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Visibility changes only; CSS animates without a JavaScript frame loop.
export function MotionSurface({ children, className }: { children: ReactNode; className: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let inView = false;
    const update = () => setActive(inView && document.visibilityState === "visible");
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      update();
    });
    observer.observe(element);
    document.addEventListener("visibilitychange", update);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return <div ref={ref} className={`motion-surface ${className}`} data-motion={active ? "active" : "paused"}>{children}</div>;
}
