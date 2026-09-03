// Links out of the dashboard.
//
// The crew screens are not in this app. They are the contractor portal
// (`contractor/`, port 3001 in development, its own deploy in production), so
// the crew link in a dispatch email must be built from NEXT_PUBLIC_CONTRACTOR_URL
// and not from NEXT_PUBLIC_APP_URL. Getting that wrong sends a crew to a page
// that does not exist, which breaks the one loop the product is about.
//
// It lives in one function so there is exactly one place to be wrong.

/** Base URL of the contractor portal, without a trailing slash. */
export function contractorBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_CONTRACTOR_URL ?? "http://localhost:3001";
  return url.replace(/\/+$/, "");
}

/**
 * Where a crew works a route: the contractor portal's job screen.
 *
 * This is the primary link in the dispatch email (docs/ARCHITECTURE.md §6).
 * Google Maps deep links are secondary and chunked per leg, because platform
 * waypoint limits silently truncate a long route.
 */
export function crewRouteUrl(routePlanId: string): string {
  return `${contractorBaseUrl()}/route/${routePlanId}`;
}
