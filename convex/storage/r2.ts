// Cloudflare R2 storage client and helpers.
//
// Media is stored in R2 and served from a public bucket base URL (a custom
// domain bound to the bucket, or the bucket's public `r2.dev` URL) configured
// via the `R2_PUBLIC_URL` environment variable. We persist these public URLs in
// the database, so reads never need a server round-trip and the URLs do not
// expire the way R2 signed URLs (`r2.getUrl`) do.
import { R2 } from "@convex-dev/r2";
import { components } from "../_generated/api";
import type { DataModel } from "../_generated/dataModel";
import { requireBetaAccess } from "../auth/users";

// Reads bucket/endpoint/credentials from the R2_* Convex environment variables.
export const r2 = new R2(components.r2);

function publicBaseUrl(): string {
  const base = process.env.R2_PUBLIC_URL?.trim();
  if (!base) {
    throw new Error(
      "R2_PUBLIC_URL is not configured. Set it to the R2 bucket's public base URL (custom domain or r2.dev URL)."
    );
  }
  return base.replace(/\/+$/, "");
}

/** Build the permanent public URL that serves an R2 object key. */
export function publicUrlForKey(key: string): string {
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return `${publicBaseUrl()}/${encodedKey}`;
}

/**
 * Recover the R2 object key from a public URL produced by {@link publicUrlForKey}.
 * Returns undefined when the URL was not served from the configured bucket.
 */
export function keyFromPublicUrl(url: string): string | undefined {
  const base = process.env.R2_PUBLIC_URL?.trim();
  if (!base) return undefined;
  const prefix = `${base.replace(/\/+$/, "")}/`;
  if (!url.startsWith(prefix)) return undefined;
  const encodedKey = url.slice(prefix.length).split("?")[0];
  if (!encodedKey) return undefined;
  return encodedKey.split("/").map(decodeURIComponent).join("/");
}

// Upload endpoints consumed by the `useUploadFile` hook for direct
// browser-to-R2 uploads (see AnalyzePage). Uploads are gated to authenticated
// private-beta members, matching the rest of the media surface.
export const { generateUploadUrl, syncMetadata } = r2.clientApi<DataModel>({
  checkUpload: async (ctx) => {
    await requireBetaAccess(ctx);
  },
});
