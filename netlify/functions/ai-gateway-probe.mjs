export default async () => {
  try {
    const baseURL = process.env.OPENAI_BASE_URL;
    const apiKey = process.env.OPENAI_API_KEY;
    if (!baseURL || !apiKey) {
      return Response.json({ ok: false, error: "AI_GATEWAY_ENV_UNAVAILABLE", hasBaseURL: !!baseURL, hasKey: !!apiKey }, { status: 503 });
    }

    const response = await fetch(`${baseURL.replace(/\/$/, "")}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-5",
        messages: [{ role: "user", content: "Reply exactly: NETLIFY_AI_GATEWAY_OK" }],
        max_completion_tokens: 20,
      }),
    });

    const data = await response.json().catch(() => ({}));
    const text = data?.choices?.[0]?.message?.content?.trim() || "";
    return Response.json({ ok: response.ok && text === "NETLIFY_AI_GATEWAY_OK", status: response.status, text });
  } catch (error) {
    return Response.json({ ok: false, error: String(error?.message || error) }, { status: 500 });
  }
};
