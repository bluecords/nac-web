import { CONFIGURATION } from "@revolt/common";

import { State } from "..";

import { AbstractStore } from ".";

export type Session = {
  _id: string;
  token: string;
  userId: string;
  valid: boolean;
};

export type TypeAuth = {
  /**
   * Session information
   */
  session?: Session;
};

/**
 * Authentication details store
 */
export class Auth extends AbstractStore<"auth", TypeAuth> {
  /**
   * Construct store
   * @param state State
   */
  constructor(state: State) {
    super(state, "auth");
  }

  /**
   * Hydrate external context
   */
  hydrate(): void {
    if (CONFIGURATION.DEVELOPMENT_TOKEN && CONFIGURATION.DEVELOPMENT_USER_ID) {
      this.setSession({
        _id: CONFIGURATION.DEVELOPMENT_SESSION_ID ?? "0",
        token: CONFIGURATION.DEVELOPMENT_TOKEN,
        userId: CONFIGURATION.DEVELOPMENT_USER_ID,
        valid: true,
      });
      return;
    }

    // One-time session bootstrap for native WebViews (e.g. Android's
    // ServerSettingsActivity), which carry their own already-valid session
    // token but have no normal login flow to obtain one in-browser. This
    // runs during hydrate(), before the router decides logged-in vs.
    // logged-out, so it replaces a previous approach that hand-wrote the
    // localforage IndexedDB record directly (fragile: depends on guessing
    // localforage's internal DB/store names and key shape) with the same
    // setSession() path a real login uses. See nac-web#41.
    if (!this.getSession()?.valid) {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("webview_token");
      const userId = params.get("webview_user");

      if (token && userId) {
        this.setSession({
          _id: "webview",
          token,
          userId,
          valid: true,
        });

        // Strip credentials from the URL/history immediately — they've
        // already been consumed into the session store.
        params.delete("webview_token");
        params.delete("webview_user");
        const query = params.toString();
        window.history.replaceState(
          null,
          "",
          window.location.pathname + (query ? `?${query}` : ""),
        );
      }
    }
  }

  /**
   * Generate default values
   */
  default(): TypeAuth {
    return {
      session: undefined,
    };
  }

  /**
   * Validate the given data to see if it is compliant and return a compliant object
   */
  clean(input: Partial<TypeAuth>): TypeAuth {
    let session;
    if (typeof input.session === "object") {
      if (
        typeof input.session._id === "string" &&
        typeof input.session.token === "string" &&
        typeof input.session.userId === "string" &&
        input.session.valid
      ) {
        session = {
          _id: input.session._id,
          token: input.session.token,
          userId: input.session.userId,
          valid: true,
        };
      }
    }

    return {
      session,
    };
  }

  /**
   * Get current session.
   * @returns Session
   */
  getSession() {
    return this.get().session;
  }

  /**
   * Add a new session to the auth manager.
   * @param session Session
   */
  setSession(session: Session) {
    this.set("session", session);
  }

  /**
   * Remove existing session.
   */
  removeSession() {
    this.set("session", undefined!);
  }

  /**
   * Mark current session as valid
   */
  markValid() {
    const session = this.get().session;
    if (session && !session.valid) {
      this.set("session", "valid", true);
    }
  }
}
