// Organisation Authorisation Key generation & validation.
// Format: FREQ-<ORG3>-<XXXX>-<XXXX>  e.g. FREQ-KNG-7F42-XP91
//   - "FREQ"  fixed product prefix
//   - <ORG3>  three letters derived from the organisation name (A–Z)
//   - two 4-char groups from a crypto-random, unambiguous alphabet
// The random portion carries the security: 8 chars over a 32-symbol alphabet
// ≈ 40 bits of entropy, making keys unguessable while staying easy to read,
// copy and share. Uniqueness is enforced by a UNIQUE constraint at insert time;
// callers should retry generation on the rare collision.

import { randomInt } from "node:crypto"

// Crockford-style alphabet: no 0/O/1/I/L/U to avoid transcription mistakes.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ"

function randomGroup(length: number): string {
  let out = ""
  for (let i = 0; i < length; i++) {
    out += ALPHABET[randomInt(0, ALPHABET.length)]
  }
  return out
}

/** Derives a 3-letter org token from a name, padded with X if too short. */
export function orgToken(name: string): string {
  const letters = name.toUpperCase().replace(/[^A-Z]/g, "")
  return (letters.slice(0, 3) || "ORG").padEnd(3, "X")
}

/** Generates a fresh authorisation key for the given organisation name. */
export function generateAuthKey(orgName: string): string {
  return `FREQ-${orgToken(orgName)}-${randomGroup(4)}-${randomGroup(4)}`
}

/** Loose format check for a pasted key (case-insensitive, tolerant of spaces). */
export function isValidKeyFormat(raw: string): boolean {
  return /^FREQ-[A-Z]{3}-[0-9A-Z]{4}-[0-9A-Z]{4}$/i.test(raw.trim())
}

/** Normalises user input: trims, uppercases, collapses internal spaces. */
export function normalizeKey(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "")
}
