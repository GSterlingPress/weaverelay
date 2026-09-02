import { getStore } from "@netlify/blobs";
import { emailStorageKey, normalizeEmail, readVerificationToken } from "./_token.mjs";

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'"
    }
  });
}

export default async (req) => {
  if (req.method !== "POST") return json({ ok: false, message: "Method not allowed." }, 405);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, message: "Invalid request." }, 400);
  }

  const secret = process.env.WAITLIST_TOKEN_SECRET;
  if (!secret) return json({ ok: false, message: "Verification isn't configured yet." }, 500);

  let payload;
  try {
    payload = readVerificationToken(body.token, secret);
  } catch (error) {
    return json({ ok: false, message: error.message }, 400);
  }

  const email = normalizeEmail(payload.email);
  const now = new Date().toISOString();
  const waitlist = getStore({ name: "weaverelay-waitlist", consistency: "strong" });
  const key = emailStorageKey(email);
  const existing = await waitlist.get(key, { type: "json", consistency: "strong" });

  if (!existing) {
    await waitlist.setJSON(key, {
      email,
      verifiedAt: now,
      createdAt: now
    }, { onlyIfNew: true });
  }

  return json({ ok: true, message: "You're verified and on the WeaveRelay waitlist." });
};
