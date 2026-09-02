/**
 * Who this console belongs to and who is signed in.
 *
 * These are the only pieces of the old fixture set that outlive it: every
 * dispatch is attributed to a named person at a named authority, so the names
 * are part of the product rather than sample data.
 */

/** The authority this console belongs to. */
export const AUTHORITY = process.env.NEXT_PUBLIC_AUTHORITY_NAME || "Transport for London";

export const DIRECTORATE = "Road Network Directorate";

/** The signed-in operator. Every dispatch is attributed to a named person. */
export const OPERATOR = { name: "D. Mackie", role: "Network Duty Officer" };
