import { getStore } from "@netlify/blobs";
import { anotar } from "./registro.mjs";

// IDs de lo último publicado (para el panel de estadísticas)
const ids = {};

// Agrega marcas a los enlaces de tu sitio para ver de qué red llegan las visitas (Google Analytics / Search Console)
function conUtm(url, red) {
  try {
    const u = new URL(url);
    u.searchParams.set("utm_source", red);
    u.searchParams.set("utm_medium", "bot");
    u.searchParams.set("utm_campaign", "guia-diaria");
    return u.toString();
  } catch {
    return url;
  }
}

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

// Facebook: solo publica si existen FACEBOOK_PAGE_ID y FACEBOOK_PAGE_TOKEN
async function facebook(p) {
  const { FACEBOOK_PAGE_ID, FACEBOOK_PAGE_TOKEN } = process.env;
  if (!FACEBOOK_PAGE_ID || !FACEBOOK_PAGE_TOKEN) return "omitido (faltan variables)";
  const body = new URLSearchParams({
    message: `📌 ${p.title}\n\n${p.desc ? p.desc + "\n\n" : ""}🇯🇵 Latinos en Japón · 日本のラテン系コミュニティ`,
    link: conUtm(p.url, "facebook"),
    access_token: FACEBOOK_PAGE_TOKEN,
  });
  const r = await fetch(`https://graph.facebook.com/v26.0/${FACEBOOK_PAGE_ID}/feed`, { method: "POST", body });
  const j = await r.json().catch(() => ({}));
  ids.facebook = j.id;
  if (!r.ok) throw new Error(`Facebook ${r.status}: ${JSON.stringify(j.error || j)}`);
  return "ok";
}

// Hilda Social: guarda una publicación nueva en la tabla "posts" de Supabase.
// Necesita SUPABASE_URL, SUPABASE_SERVICE_KEY y HILDA_BOT_USER_ID (usuario del bot).
async function hilda(texto) {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY, HILDA_BOT_USER_ID } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !HILDA_BOT_USER_ID) return "omitido (faltan variables)";
  const headers = { "Content-Type": "application/json", apikey: SUPABASE_SERVICE_KEY, Prefer: "return=representation" };
  if (SUPABASE_SERVICE_KEY.startsWith("eyJ")) headers.Authorization = `Bearer ${SUPABASE_SERVICE_KEY}`;
  const r = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/posts`, {
    method: "POST",
    headers,
    body: JSON.stringify({ user_id: HILDA_BOT_USER_ID, content: texto }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`Hilda ${r.status}: ${await r.text()}`);
  const filas = await r.json().catch(() => []);
  ids.hilda = filas?.[0]?.id;
  return "ok";
}

function format(p, red = "web") {
  return `📌 ${p.title}\n\n${p.desc ? p.desc + "\n\n" : ""}👉 ${conUtm(p.url, red)}\n\n🇯🇵 Latinos en Japón · 日本のラテン系コミュニティ`;
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

  const resultado = {};
  ids.facebook = ids.hilda = undefined;
  if (send) {
    try { await telegram(format(page, "telegram")); resultado.telegram = "ok"; } catch (e) { resultado.telegram = String(e); }
    try { resultado.facebook = await facebook(page); } catch (e) { resultado.facebook = String(e); }
    try { resultado.hilda = await hilda(format(page, "hilda")); } catch (e) { resultado.hilda = String(e); }
  }
  const algunoOk = [resultado.telegram, resultado.facebook, resultado.hilda].includes("ok");
  if (send) await anotar({ tipo: "guía", prueba: !mark, titulo: page.title, url: page.url, telegram: resultado.telegram, facebook_id: ids.facebook || null, hilda_id: ids.hilda || null });
  if (mark && (algunoOk || !send)) await store.setJSON("posted", [...posted, url]);
  return { publicado: page.url, titulo: page.title, paginasEncontradas: all.length, ...resultado };
}
