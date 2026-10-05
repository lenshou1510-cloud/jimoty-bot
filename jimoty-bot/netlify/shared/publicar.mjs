import { getStore } from "@netlify/blobs";

const SITE = (process.env.SITE_URL || "https://latinosenjapon.com").replace(/\/$/, "");
// Si una URL contiene alguna de estas palabras, no se publica
const EXCLUDE = ["admin", "login", "panel", "gracias", "404"];
const UA = "Mozilla/5.0 (compatible; LatinosEnJaponBot)";

async function getText(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}

async function readSitemap(url, urls, depth = 0) {
  const xml = await getText(url);
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
  for (const l of locs) {
    if (l.endsWith(".xml") && depth < 2) await readSitemap(l, urls, depth + 1);
    else urls.add(l);
  }
}

// Lista de páginas: del sitemap.xml, o de la variable PAGES (una URL por línea o separadas por comas)
async function getUrls() {
  const urls = new Set();
  try {
    await readSitemap(`${SITE}/sitemap.xml`, urls);
  } catch (e) {
    console.log("Sin sitemap:", String(e));
  }
  (process.env.PAGES || "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .forEach((u) => urls.add(u.startsWith("http") ? u : `${SITE}/${u.replace(/^\//, "")}`));
  return [...urls].filter((u) => u.startsWith("http") && !EXCLUDE.some((w) => u.toLowerCase().includes(w)));
}

const decode = (s) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();

function meta(html, name) {
  const a = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']`, "i"));
  const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${name}["']`, "i"));
  return decode((a || b || [])[1] || "");
}

async function describe(url) {
  const html = await getText(url);
  const t = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = meta(html, "og:title") || decode((t || [])[1] || "") || url;
  const desc = meta(html, "og:description") || meta(html, "description");
  return { url, title, desc: desc.length > 300 ? desc.slice(0, 297) + "..." : desc };
}

async function telegram(text) {
  const { TELEGRAM_TOKEN, TELEGRAM_CHANNEL } = process.env;
  const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TELEGRAM_CHANNEL, text }),
  });
  if (!r.ok) throw new Error(`Telegram ${r.status}: ${await r.text()}`);
}

function format(p) {
  return `📌 ${p.title}\n\n${p.desc ? p.desc + "\n\n" : ""}👉 ${p.url}\n\n🇯🇵 Latinos en Japón · 日本のラテン系コミュニティ`;
}

// dry: solo muestra qué publicaría | send: publica | mark: recuerda lo publicado para no repetir
export async function run({ dry = false, send = true, mark = true } = {}) {
  const store = getStore("publicaciones");
  let posted = (await store.get("posted", { type: "json" })) || [];
  const all = await getUrls();
  if (!all.length) throw new Error("No encontré páginas. Revisa sitemap.xml o la variable PAGES.");

  let candidates = all.filter((u) => !posted.includes(u));
  if (!candidates.length) {
    posted = [];
    candidates = all;
  }
  const url = candidates[Math.floor(Math.random() * candidates.length)];
  const page = await describe(url);

  if (dry) return { paginasEncontradas: all.length, pendientes: candidates.length, siguiente: page, mensaje: format(page) };

  if (send) await telegram(format(page));
  if (mark) await store.setJSON("posted", [...posted, url]);
  return { publicado: page.url, titulo: page.title, paginasEncontradas: all.length };
}
