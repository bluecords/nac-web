/**
 * Client-side email sanity checks for the registration form.
 *
 * `<input type="email">` only enforces the shape `x@y.z`, so an address like
 * `Mike_carr83@hotmail.comcom` sails through, the account is created, the
 * verification mail bounces, and the account is stuck `Pending` forever with
 * no self-serve recovery (there is no "change my email" for an unverified
 * account). This happened for real on migration eve — see BUG_BASH_2026-09-09.
 *
 * Two tiers:
 *   - `emailIsBroken()`   — the domain cannot receive mail (doubled TLD, no
 *                           dot, bad TLD, stray dots). Hard-blocked.
 *   - `suggestEmail()`    — a probable fat-finger of a common provider or TLD.
 *                           Shown as "did you mean …", still overridable, because
 *                           we can't be certain.
 */

/** Common provider / TLD misspellings → the intended value. */
const DOMAIN_TYPOS: Record<string, string> = {
  "gmial.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmil.com": "gmail.com",
  "gmaill.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.cm": "gmail.com",
  "gmail.comm": "gmail.com",
  "googlemail.con": "googlemail.com",
  "hotmial.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "hotmail.co": "hotmail.com",
  "hotmail.con": "hotmail.com",
  "hotmall.com": "hotmail.com",
  "hotnail.com": "hotmail.com",
  "outlok.com": "outlook.com",
  "outook.com": "outlook.com",
  "outlook.co": "outlook.com",
  "outlook.con": "outlook.com",
  "yaho.com": "yahoo.com",
  "yahou.com": "yahoo.com",
  "yhaoo.com": "yahoo.com",
  "yahoo.co": "yahoo.com",
  "yahoo.con": "yahoo.com",
  "iclould.com": "icloud.com",
  "icloud.co": "icloud.com",
  "icloud.con": "icloud.com",
  "protonmai.com": "protonmail.com",
  "proton.mail": "protonmail.com",
};

/** TLDs that are almost always a slip for `.com`. */
const TLD_TYPOS: Record<string, string> = {
  con: "com",
  cim: "com",
  ccom: "com",
  comm: "com",
  co: "com", // ".co" is real but for a signup form it's overwhelmingly a typo
  vom: "com",
  xom: "com",
  cxom: "com",
  dom: "com",
  om: "com",
  cm: "com",
  "com.com": "com",
};

/**
 * Split an email into local part and domain, lower-casing the domain.
 * Returns null if it does not even have a single `@`.
 */
function parts(email: string): { local: string; domain: string } | null {
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return null;
  return {
    local: email.slice(0, at),
    domain: email.slice(at + 1).toLowerCase().trim(),
  };
}

/**
 * True when the address is structurally incapable of receiving mail and the
 * user should not be allowed to submit it.
 */
export function emailIsBroken(email: string): boolean {
  const p = parts(email);
  if (!p) return true;

  const { domain } = p;

  // stray / doubled dots, or a leading/trailing dot on the domain
  if (domain.startsWith(".") || domain.endsWith(".")) return true;
  if (domain.includes("..")) return true;

  const labels = domain.split(".");
  if (labels.length < 2) return true; // no TLD at all
  if (labels.some((l) => l.length === 0)) return true;

  const tld = labels[labels.length - 1];

  // TLD must be letters only, 2–24 chars
  if (!/^[a-z]{2,24}$/.test(tld)) return true;

  // doubled TLD: "comcom", "netnet", "orgorg", "co.uk.uk" style tail repeats
  const half = tld.slice(0, tld.length / 2);
  if (
    tld.length % 2 === 0 &&
    half.length >= 2 &&
    half + half === tld &&
    !["nunu"].includes(tld) // (there is no real doubled-syllable TLD; guard is just future-proofing)
  ) {
    return true;
  }

  return false;
}

/**
 * If the address looks like a probable typo, return the corrected address.
 * Otherwise return null. Never returns a value equal to the input.
 */
export function suggestEmail(email: string): string | null {
  const p = parts(email);
  if (!p) return null;

  const { local, domain } = p;

  // whole-domain typo table first (covers "gmail.con" etc.)
  if (DOMAIN_TYPOS[domain]) {
    return `${local}@${DOMAIN_TYPOS[domain]}`;
  }

  // otherwise try to fix just the TLD
  const labels = domain.split(".");
  const tld = labels[labels.length - 1];
  if (TLD_TYPOS[tld]) {
    labels[labels.length - 1] = TLD_TYPOS[tld];
    const fixed = `${local}@${labels.join(".")}`;
    return fixed === email ? null : fixed;
  }

  return null;
}
