// NAC never falls back to upstream infrastructure. If the API URL is not
// configured we want a loud, obvious failure -- not a client that silently
// connects members (and their credentials) to someone else's server.
const DEFAULT_API_URL =
  (import.meta.env.DEV ? import.meta.env.VITE_DEV_API_URL : undefined) ??
  (import.meta.env.VITE_API_URL as string) ??
  "";

export default {
  /**
   * Whether to emit additional debug information
   */
  DEBUG: import.meta.env.DEV || true,
  /**
   * What API server to connect to by default.
   */
  DEFAULT_API_URL,
  /**
   * What WS server to connect to by default.
   */
  DEFAULT_WS_URL:
    (import.meta.env.DEV ? import.meta.env.VITE_DEV_WS_URL : undefined) ??
    (import.meta.env.VITE_WS_URL as string) ??
    "",
  /**
   * What media server to connect to by default.
   */
  DEFAULT_MEDIA_URL:
    (import.meta.env.DEV ? import.meta.env.VITE_DEV_MEDIA_URL : undefined) ??
    (import.meta.env.VITE_MEDIA_URL as string) ??
    "",
  /**
   * What proxy server to connect to by default.
   */
  DEFAULT_PROXY_URL:
    (import.meta.env.DEV ? import.meta.env.VITE_DEV_PROXY_URL : undefined) ??
    (import.meta.env.VITE_PROXY_URL as string) ??
    "",
  /**
   * Base URL of the bot service (the `/bot/*` routes, proxied by the host nginx
   * in front of Caddy to the stoatcord container).
   *
   * Derived from the app's own origin rather than hardcoded, because the bot is
   * served from the SAME origin as the client in every real deployment. In
   * production this resolves to exactly the URL that used to be hardcoded, so
   * behaviour there is unchanged.
   *
   * WHY IT MATTERS: MoveToChannel had `https://community.nac.social/bot/...`
   * written into it, so moving a message FROM A LOCAL DEV BUILD mutated the live
   * community. Same-origin means a dev build hits its own origin, which has no
   * /bot proxy, and fails loudly instead of quietly editing production.
   *
   * Also removes one of the hardcoded hostnames that would have to be found and
   * changed for the white-label direction.
   */
  BOT_API_URL:
    (import.meta.env.VITE_BOT_URL as string) ??
    (typeof location !== "undefined" ? `${location.origin}/bot` : ""),
  /**
   * hCaptcha site key to use if enabled
   */
  HCAPTCHA_SITEKEY: import.meta.env.VITE_HCAPTCHA_SITEKEY as string,
  /**
   * Maximum number of replies a message can have
   */
  MAX_REPLIES: (import.meta.env.VITE_CFG_MAX_REPLIES as number) ?? 5,
  /**
   * Maximum number of attachments a message can have
   */
  MAX_ATTACHMENTS: (import.meta.env.VITE_CFG_MAX_ATTACHMENTS as number) ?? 5,
  /**
   * Maximum number of emoji a server can have
   */
  MAX_EMOJI: (import.meta.env.VITE_CFG_MAX_EMOJI as number) ?? 100,
  /**
   * Max file size allowed for uploads (in bytes)
   * 20 MB = 20 * 1024 * 1024 = 20,971,520 bytes
   * I kinda wonder if this should be a setting, or something fetched from the backend dynamically.
   */
  MAX_FILE_SIZE:
    (import.meta.env.VITE_CFG_MAX_FILE_SIZE as number) ?? 20_000_000,
  /**
   * RNNoise worklet CDN host location. Defaults to blank, which uses the url provided by the livekit-rnnoise-processor package.
   */
  RNNOISE_WORKLET_CDN_URL:
    (import.meta.env.VITE_RNNOISE_WORKLET_CDN_URL as string) ?? "",
  /**
   * Enable video allows the web client to enable video and screensharing
   */
  ENABLE_VIDEO:
    ((import.meta.env.VITE_CFG_ENABLE_VIDEO as string) ?? "").toLowerCase() ==
    "true",
  /**
   * Session ID to set during development.
   */
  DEVELOPMENT_SESSION_ID: import.meta.env.DEV
    ? (import.meta.env.VITE_SESSION_ID as string)
    : undefined,
  /**
   * Token to set during development.
   */
  DEVELOPMENT_TOKEN: import.meta.env.DEV
    ? (import.meta.env.VITE_TOKEN as string)
    : undefined,
  /**
   * User ID to set during development.
   */
  DEVELOPMENT_USER_ID: import.meta.env.DEV
    ? (import.meta.env.VITE_USER_ID as string)
    : undefined,
};
