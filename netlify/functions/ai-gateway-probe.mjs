export default async () => {
  try {
    const baseURL = process.env.AI_GATEWAY_URL;
    const apiKey = process.env.NETLIFY_AI_GATEWAY_TOKEN;
    if (!baseURL || !apiKey) {
      return Response.json({ ok: false, error: "AI_GATEWAY_ENV_UNAVAILABLE", hasBaseURL: !!baseURL, hasToken: !!apiKey }, { status: 503 });
    }

    const response = await fetch(`${baseURL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-4.1-mini",
        messages: [{ role: "user", content: "Reply exactly: NETLIFY_AI_GATEWAY_OK" }],
        temperature: 0,
        max_tokens: 20,
      }),
    });

    const data = await response.json().catch(() => ({}));
    const text = data?.choices?.[0]?.message?.content?.trim() || "";
    return Response.json({ ok: response.ok && text === "NETLIFY_AI_GATEWAY_OK", status: response.status, text });
  } catch (error) {
    return Response.json({ ok: false, error: String(error?.message || error) }, { status: 500 });
  }
};
