import {
  useRef,
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  type RefObject,
} from 'react';

const AUTO_SCROLL_THRESHOLD_PX = 64;

function isNearBottom(
  el: HTMLElement,
  threshold = AUTO_SCROLL_THRESHOLD_PX,
): boolean {
  const distance = el.scrollHeight - el.clientHeight - el.scrollTop;
  return distance <= threshold;
}

interface ChatScrollOptions {
  scrollRef: RefObject<HTMLElement | null>;
  composerRef?: RefObject<HTMLElement | null>;
}

/**
 * Smart chat scroll management inspired by t3code's approach.
 *
 * - Auto-scrolls to bottom while user is near the bottom
 * - Detects user scroll-up intent via wheel, pointer, and touch events
 * - Shows a "scroll to bottom" indicator when the user has scrolled away
 * - RAF-batched scroll updates to prevent thrashing during streaming
 * - Interaction anchoring: preserves visual position when collapsibles toggle
 * - Composer resize detection: auto-scrolls when the textarea grows
 */
export function useChatScroll({ scrollRef, composerRef }: ChatScrollOptions) {
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const shouldAutoScrollRef = useRef(true);
  const pendingAutoScrollFrameRef = useRef<number | null>(null);
  const pendingAnchorFrameRef = useRef<number | null>(null);
  const pendingAnchorRef = useRef<{
    element: HTMLElement;
    top: number;
  } | null>(null);
  const isPointerActiveRef = useRef(false);
  const pendingScrollUpRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const composerHeightRef = useRef(0);

  // ---- Core scroll functions ----

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'instant') => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior });
      lastScrollTopRef.current = el.scrollTop;
      shouldAutoScrollRef.current = true;
      setShowScrollToBottom(false);
    },
    [scrollRef],
  );

  /** Synchronous scroll — call directly from React effects. */
  const scrollToBottomIfNeeded = useCallback(() => {
    if (!shouldAutoScrollRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    lastScrollTopRef.current = el.scrollTop;
  }, [scrollRef]);

  /** RAF-batched scroll — use from ResizeObserver and other high-frequency sources. */
  const scheduleScrollToBottom = useCallback(() => {
    if (!shouldAutoScrollRef.current) return;
    if (pendingAutoScrollFrameRef.current !== null) return;
    pendingAutoScrollFrameRef.current = requestAnimationFrame(() => {
      pendingAutoScrollFrameRef.current = null;
      scrollToBottomIfNeeded();
    });
  }, [scrollToBottomIfNeeded]);

  // ---- Scroll event handlers ----

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const currentTop = el.scrollTop;
    const nearBottom = isNearBottom(el);

    if (!shouldAutoScrollRef.current && nearBottom) {
      // User scrolled back to bottom — re-enable auto-scroll
      shouldAutoScrollRef.current = true;
      pendingScrollUpRef.current = false;
    } else if (shouldAutoScrollRef.current) {
      const scrolledUp = currentTop < lastScrollTopRef.current - 1;
      if (
        scrolledUp &&
        (pendingScrollUpRef.current || isPointerActiveRef.current)
      ) {
        // User intentionally scrolled up — disable auto-scroll
        shouldAutoScrollRef.current = false;
      }
      pendingScrollUpRef.current = false;
    }

    setShowScrollToBottom(!shouldAutoScrollRef.current);
    lastScrollTopRef.current = currentTop;
  }, [scrollRef]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    if (e.deltaY < 0) pendingScrollUpRef.current = true;
  }, []);

  const onPointerDown = useCallback(() => {
    isPointerActiveRef.current = true;
  }, []);

  const onPointerUp = useCallback(() => {
    isPointerActiveRef.current = false;
  }, []);

  // ---- Interaction anchoring ----
  // When expanding a collapsible (e.g. activity steps), preserve the visual
  // position of the trigger element to avoid jarring scroll jumps.

  const onClickCapture = useCallback(
    (e: React.MouseEvent) => {
      const el = scrollRef.current;
      if (!el || !(e.target instanceof Element)) return;

      const trigger = e.target.closest<HTMLElement>(
        "button, summary, [role='button']",
      );
      if (!trigger || !el.contains(trigger)) return;

      pendingAnchorRef.current = {
        element: trigger,
        top: trigger.getBoundingClientRect().top,
      };

      if (pendingAnchorFrameRef.current !== null) {
        cancelAnimationFrame(pendingAnchorFrameRef.current);
      }
      pendingAnchorFrameRef.current = requestAnimationFrame(() => {
        pendingAnchorFrameRef.current = null;
        const anchor = pendingAnchorRef.current;
        pendingAnchorRef.current = null;
        const container = scrollRef.current;
        if (!anchor || !container) return;
        if (
          !anchor.element.isConnected ||
          !container.contains(anchor.element)
        ) {
          return;
        }

        const nextTop = anchor.element.getBoundingClientRect().top;
        const delta = nextTop - anchor.top;
        if (Math.abs(delta) < 0.5) return;
        container.scrollTop += delta;
        lastScrollTopRef.current = container.scrollTop;
      });
    },
    [scrollRef],
  );

  // ---- Composer resize detection ----

  useLayoutEffect(() => {
    const composer = composerRef?.current;
    if (!composer || typeof ResizeObserver === 'undefined') return;

    composerHeightRef.current = composer.getBoundingClientRect().height;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const nextHeight = entry.contentRect.height;
      const prevHeight = composerHeightRef.current;
      composerHeightRef.current = nextHeight;
      if (prevHeight > 0 && Math.abs(nextHeight - prevHeight) < 0.5) return;
      if (!shouldAutoScrollRef.current) return;
      scheduleScrollToBottom();
    });

    observer.observe(composer);
    return () => observer.disconnect();
  }, [composerRef, scheduleScrollToBottom]);

  // ---- Cleanup ----

  useEffect(() => {
    return () => {
      if (pendingAutoScrollFrameRef.current !== null) {
        cancelAnimationFrame(pendingAutoScrollFrameRef.current);
      }
      if (pendingAnchorFrameRef.current !== null) {
        cancelAnimationFrame(pendingAnchorFrameRef.current);
      }
    };
  }, []);

  return {
    showScrollToBottom,
    scrollToBottom,
    scrollToBottomIfNeeded,
    scheduleScrollToBottom,
    handlers: {
      onScroll,
      onWheel,
      onPointerDown,
      onPointerUp,
      onClickCapture,
    },
  };
}
