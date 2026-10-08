/**
 * Focus rules shared by the server (which enforces them) and the browser (which previews them).
 * Keep this file free of database imports so it is safe to bundle into client code.
 */

/** A switch away from a project needs a real reason, not a single letter. */
export const MIN_REASON_LENGTH = 5;
export const MAX_REASON_LENGTH = 500;
