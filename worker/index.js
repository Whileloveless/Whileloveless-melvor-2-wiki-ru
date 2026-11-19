const json = (status, body) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store" }
});

function decodeAsset(base64) {
  const text = atob(base64);
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index++) bytes[index] = text.charCodeAt(index);
  return bytes;
}

async function readSuggestion(request) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 16_384) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  return JSON.parse(text + decoder.decode());
}

async function submit(request, env, url) {
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  }
  const user = request.headers.get("oai-authenticated-user-id");
  if (!user) return json(401, { error: "signin_required" });
  if (request.headers.get("Origin") !== url.origin) return json(403, { error: "invalid_origin" });
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("Content-Type") || "")) {
    return json(415, { error: "invalid_type" });
  }

  let payload;
  try {
    payload = await readSuggestion(request);
  } catch {
    return json(400, { error: "invalid_suggestion" });
  }
  const page = payload?.page;
  const message = typeof payload?.message === "string" ? payload.message.trim() : "";
  if (typeof page !== "string" || page.length > 300 || !/^#\/[^\s<>]*$/.test(page) ||
      !message || message.length > 2000) {
    return json(400, { error: "invalid_suggestion" });
  }

  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([user,page,message])));
    const id = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    const result = await env.DB.prepare(
      "INSERT INTO suggestions (id, page, message) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING"
    ).bind(id, page, message).run();
    if (!result.success) return json(503, { error: "storage_unavailable" });
  } catch (error) {
    console.error("Suggestion storage failed", error.name);
    return json(503, { error: "storage_unavailable" });
  }
  return json(201, { saved: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/suggestions") return submit(request, env, url);
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
    }
    const path = url.pathname === "/" ? "/index.html" : url.pathname;
    if (!Object.hasOwn(assets, path)) return new Response("Страница не найдена", { status: 404 });
    const [type, content, binary] = assets[path];
    const body = request.method === "HEAD" ? null :
      binary ? decodeAsset(content) : content;
    return new Response(body, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "private, max-age=0, must-revalidate",
        "X-Content-Type-Options": "nosniff"
      }
    });
  }
};
