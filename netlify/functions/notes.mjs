// Bendri užrašai: kiekvienas įrašas saugomas atskiru Netlify Blobs raktu "<tema>/<id>",
// todėl keli žmonės vienu metu gali rašyti neperrašydami vienas kito.
import { getStore } from "@netlify/blobs";

const KEY_RE = /^[a-z0-9:_-]{1,120}$/i;
const MAX_TEXT = 4000;
const MAX_NAME = 40;
const MAX_PER_KEY = 500;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export default async (req) => {
  const store = getStore({ name: "bendri-uzrasai", consistency: "strong" });
  const url = new URL(req.url);

  if (req.method === "GET") {
    // ?counts → kiek įrašų turi kiekviena tema
    const many = url.searchParams.get("counts");
    if (many !== null) {
      const { blobs } = await store.list();
      const counts = {};
      for (const b of blobs) { const k = b.key.slice(0, b.key.lastIndexOf("/")); counts[k] = (counts[k] || 0) + 1; }
      return json({ counts });
    }
    const key = url.searchParams.get("key") || "";
    if (!KEY_RE.test(key)) return json({ error: "bad key" }, 400);
    const { blobs } = await store.list({ prefix: key + "/" });
    const items = (await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })))).filter(Boolean);
    items.sort((a, b) => a.t - b.t);
    return json({ items });
  }

  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
    const key = String(body.key || "");
    if (!KEY_RE.test(key)) return json({ error: "bad key" }, 400);

    if (body.action === "add") {
      const text = String(body.text || "").trim().slice(0, MAX_TEXT);
      const author = String(body.author || "").trim().slice(0, MAX_NAME) || "Anonimė";
      if (!text) return json({ error: "empty" }, 400);
      const { blobs } = await store.list({ prefix: key + "/" });
      if (blobs.length >= MAX_PER_KEY) return json({ error: "full" }, 400);
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const item = { id, text, author, t: Date.now() };
      await store.setJSON(key + "/" + id, item);
      return json({ item });
    }
    if (body.action === "delete") {
      const id = String(body.id || "");
      if (!/^[a-z0-9]{4,30}$/.test(id)) return json({ error: "bad id" }, 400);
      await store.delete(key + "/" + id);
      return json({ ok: true });
    }
    return json({ error: "bad action" }, 400);
  }
  return json({ error: "method" }, 405);
};

export const config = { path: "/api/notes" };
