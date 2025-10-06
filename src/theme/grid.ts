import { useWindowDimensions } from "react-native";

// Tailwind-like breakpoints in px
export const BREAKPOINTS = {
  sm: 0,      // default
  md: 768,    // tablets / small desktops
  lg: 1024,   // larger desktops
};

export type SpanConfig = { sm: number; md: number; lg: number };

// Returns the active span (1-12) for current width based on provided config
export function useResponsiveSpan(config: SpanConfig) {
  const { width } = useWindowDimensions();
  if (width >= BREAKPOINTS.lg) return clampSpan(config.lg);
  if (width >= BREAKPOINTS.md) return clampSpan(config.md);
  return clampSpan(config.sm);
}

export function spanToPercent(span: number) {
  const s = clampSpan(span);
  return `${(s / 12) * 100}%`;
}

function clampSpan(span: number) {
  if (!Number.isFinite(span)) return 12;
  return Math.min(12, Math.max(1, Math.round(span)));
}
