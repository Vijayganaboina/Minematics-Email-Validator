export async function handler(event) {
  const { httpMethod, path, rawQuery, body } = event;

  // Incoming path examples:
  // /.netlify/functions/emailProxy/validate
  // /.netlify/functions/emailProxy/validate/batch
  const proxyPath = path.split("/emailProxy")[1] || "";

  const targetBase = "https://rapid-email-verifier.fly.dev/api";
  const targetUrl = `${targetBase}${proxyPath}${rawQuery ? `?${rawQuery}` : ""}`;

  // Handle preflight (some browsers may still send OPTIONS)
  if (httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Accept",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      },
      body: "",
    };
  }

  try {
    const res = await fetch(targetUrl, {
      method: httpMethod,
      headers: {
        "Content-Type": event.headers["content-type"] || "application/json",
        Accept: event.headers["accept"] || "application/json",
      },
      body: ["GET", "HEAD"].includes(httpMethod) ? undefined : body,
    });

    const text = await res.text();

    return {
      statusCode: res.status,
      headers: {
        "Content-Type": res.headers.get("content-type") || "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: text,
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        error: "Proxy request failed",
        details: String(err),
      }),
    };
  }
}
