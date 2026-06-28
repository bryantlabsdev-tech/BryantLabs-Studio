import { useEffect, useRef, useState } from "react";

const CHAR_MS = 12;
const BURST_CHARS = 3;

export interface AgentLiveStreamState {
  readonly displayText: string;
  readonly isTyping: boolean;
}

function commonPrefixLength(a: string, b: string): number {
  const limit = Math.min(a.length, b.length);
  let index = 0;
  while (index < limit && a[index] === b[index]) index += 1;
  return index;
}

export function useAgentLiveStream(
  targetText: string,
  options: { readonly live: boolean; readonly frozen: boolean },
): AgentLiveStreamState {
  const [displayedLength, setDisplayedLength] = useState(0);
  const timerRef = useRef<number | null>(null);
  const targetRef = useRef(targetText);
  const lengthRef = useRef(0);
  const prevTargetRef = useRef(targetText);

  useEffect(() => {
    const previous = prevTargetRef.current;
    if (previous !== targetText) {
      const prefix = commonPrefixLength(previous, targetText);
      if (targetText.length < previous.length) {
        lengthRef.current = Math.min(lengthRef.current, targetText.length);
        setDisplayedLength(lengthRef.current);
      } else if (lengthRef.current < prefix) {
        lengthRef.current = prefix;
        setDisplayedLength(prefix);
      }
      prevTargetRef.current = targetText;
    }
    targetRef.current = targetText;
  }, [targetText]);

  useEffect(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (!options.live || options.frozen) {
      lengthRef.current = targetText.length;
      setDisplayedLength(targetText.length);
      return;
    }

    const tick = () => {
      const target = targetRef.current;
      const current = lengthRef.current;
      if (current >= target.length) {
        setDisplayedLength(current);
        return;
      }

      const remaining = target.length - current;
      const step = remaining > 160 ? BURST_CHARS + 1 : remaining > 48 ? BURST_CHARS : 1;
      const next = Math.min(target.length, current + step);
      lengthRef.current = next;
      setDisplayedLength(next);
      timerRef.current = window.setTimeout(tick, CHAR_MS);
    };

    tick();

    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, [options.frozen, options.live, targetText]);

  const isTyping = options.live && !options.frozen && displayedLength < targetText.length;

  return {
    displayText: targetText.slice(0, displayedLength),
    isTyping,
  };
}
