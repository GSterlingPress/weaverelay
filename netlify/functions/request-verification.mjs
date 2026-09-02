import { Resend } from "resend";
import { createVerificationToken, isValidEmail, normalizeEmail } from "./_token.mjs";

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

  if (body.company) return json({ ok: true, message: "Check your email for the verification link." });

  const email = normalizeEmail(body.email);
  if (!isValidEmail(email)) return json({ ok: false, message: "Enter a valid email address." }, 400);

  const apiKey = process.env.RESEND_API_KEY;
  const tokenSecret = process.env.WAITLIST_TOKEN_SECRET;
  const siteUrl = (process.env.PUBLIC_SITE_URL || process.env.URL || "").replace(/\/$/, "");
  const from = process.env.WEAVERELAY_FROM_EMAIL || "WeaveRelay <waitlist@weaverelay.com>";

  if (!apiKey || !tokenSecret || !siteUrl) {
    console.error("Missing RESEND_API_KEY, WAITLIST_TOKEN_SECRET, or PUBLIC_SITE_URL/URL.");
    return json({ ok: false, message: "We couldn't send the verification email. Please try again shortly." }, 500);
  }

  let token;
  try {
    token = createVerificationToken(email, tokenSecret);
  } catch (error) {
    console.error(error);
    return json({ ok: false, message: "We couldn't send the verification email. Please try again shortly." }, 500);
  }

  const verifyUrl = `${siteUrl}/verify.html?t=${encodeURIComponent(token)}`;
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: email,
    subject: "Confirm your WeaveRelay waitlist spot",
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:32px;color:#16251f"><p style="font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:#587065">WeaveRelay</p><h1 style="font-size:28px;line-height:1.15;margin:18px 0">Confirm your email</h1><p style="font-size:16px;line-height:1.6;color:#42564e">You asked to join the WeaveRelay early-access waitlist. Confirm this email address to save your spot.</p><p style="margin:30px 0"><a href="${verifyUrl}" style="display:inline-block;background:#163b2c;color:white;text-decoration:none;font-weight:700;padding:14px 20px;border-radius:999px">Confirm my email</a></p><p style="font-size:13px;line-height:1.5;color:#6a7b74">This link expires in 30 minutes. If you didn't request this, you can ignore this email and nothing will be stored.</p></div>`,
    text: `Confirm your WeaveRelay waitlist spot: ${verifyUrl}\n\nThis link expires in 30 minutes. If you didn't request this, ignore this email and nothing will be stored.`
  });

  if (error) {
    console.error("Resend error", error);
    return json({ ok: false, message: "We couldn't send the verification email. Please try again shortly." }, 502);
  }

  return json({ ok: true, message: "Check your email for the verification link." });
};
