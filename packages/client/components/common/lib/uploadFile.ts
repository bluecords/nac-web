import type { Client } from "stoat.js";

/**
 * Upload a file to Autumn, the same request `client.uploadFile()` (stoat.js)
 * makes — but checking the response status before parsing it as JSON.
 *
 * stoat.js's version blindly does `fetch(...).then(res => res.json())`. If
 * the response isn't actually a successful JSON body — a proxy error page,
 * a size-limit rejection, a 502/504 — `res.json()` throws a cryptic
 * `Unexpected token '<', "<html ..."` instead of a useful error. This wraps
 * the identical request with a real `res.ok` check first, so failures
 * surface a clear, actionable message (status + whatever body came back)
 * instead of a JSON parse error a user has no way to interpret.
 *
 * stoat.js is a third-party submodule (github.com/stoatchat/javascript-client-sdk,
 * not under bluecords) — this can't be fixed upstream from here, so every
 * call site in nac-web should use this instead of `client().uploadFile(...)`.
 */
export async function uploadFile(
  client: Client,
  tag: string,
  file: File,
  uploadUrl?: string,
): Promise<string> {
  const body = new FormData();
  body.append("file", file);

  const [key, value] = client.authenticationHeader;
  const url = `${uploadUrl ?? client.configuration?.features.autumn.url}/${tag}`;

  const res = await fetch(url, {
    method: "POST",
    body,
    headers: {
      [key]: value,
    },
  });

  if (!res.ok) {
    let detail = "";
    try {
      const contentType = res.headers.get("content-type") ?? "";
      detail = contentType.includes("json")
        ? JSON.stringify(await res.json())
        : (await res.text()).slice(0, 200);
    } catch {
      /* best-effort detail only */
    }
    throw new Error(
      `Upload failed (${res.status} ${res.statusText})${detail ? `: ${detail}` : ""}`,
    );
  }

  const data: { id: string } = await res.json();
  return data.id;
}
