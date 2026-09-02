export interface MapTokens { bg: string; text: string; accent: string; accent800: string; neutral200: string }

/** Read a CSS custom property from :root. Only hex tokens are safe for MapLibre (no color-mix). */
export function readToken(name: string): string {
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function readMapTokens(): MapTokens {
  return {
    bg: readToken("--color-bg") || "#f2f2f3",
    text: readToken("--color-text") || "#1d1f20",
    accent: readToken("--color-accent") || "#5980a6",
    accent800: readToken("--color-accent-800") || "#2c455d",
    neutral200: readToken("--color-neutral-200") || "#e7e7ea",
  };
}
