import * as cheerio from "cheerio";
import { getStore } from "@netlify/blobs";
import { anotar } from "./registro.mjs";

// IDs de lo último publicado (para el panel de estadísticas)
const ids = {};

// ====== EDITA AQUÍ ======

// Fuentes (RSS). Si una falla, el bot la salta y sigue con las demás.
const FEEDS = [
  { name: "NHK (principales)", url: "https://www3.nhk.or.jp/rss/news/cat0.xml" },
  { name: "NHK (sociedad)", url: "https://www3.nhk.or.jp/rss/news/cat1.xml" },
  { name: "NHK (política)", url: "https://www3.nhk.or.jp/rss/news/cat4.xml" },
  { name: "NHK (economía)", url: "https://www3.nhk.or.jp/rss/news/cat5.xml" },
  { name: "Japan Today", url: "https://japantoday.com/feed" },
  { name: "The Japan Times", url: "https://www.japantimes.co.jp/feed/" },
];

// Palabras que hacen una noticia relevante para tu audiencia. peso 3 = muy importante
const KEYWORDS = [
  [3, "外国人"], [3, "在留"], [3, "ビザ"], [3, "入管"], [3, "技能実習"], [3, "特定技能"], [3, "育成就労"], [3, "日系"],
  [3, "foreign resident"], [3, "foreigner"], [3, "visa"], [3, "immigration"], [3, "nikkei"], [3, "residency"],
  [2, "最低賃金"], [2, "賃上げ"], [2, "年金"], [2, "健康保険"], [2, "マイナンバー"], [2, "住民税"], [2, "税制"],
  [2, "minimum wage"], [2, "pension"], [2, "health insurance"], [2, "my number"], [2, "tax"], [2, "wage"],
  [2, "地震"], [2, "台風"], [2, "津波"], [2, "防災"], [2, "earthquake"], [2, "typhoon"], [2, "tsunami"],
  [1, "物価"], [1, "円安"], [1, "円高"], [1, "inflation"], [1, "yen"], [1, "labor"], [1, "workers"], [1, "housing"],
  [1, "給与"], [1, "給料"], [1, "雇用"], [1, "労働"], [1, "家賃"], [1, "住宅"], [1, "医療"], [1, "保険料"], [1, "児童手当"], [1, "子育て"], [1, "教育"], [1, "外国"],
  [1, "salary"], [1, "employment"], [1, "rent"], [1, "childcare"], [1, "school"], [1, "tourist"], [1, "medical"], [1, "japan's economy"],
];

// Si el título tiene alguna de estas palabras, se descarta
const EXCLUDE = [
  "殺人", "逮捕", "容疑", "死亡事故", "murder", "arrest", "suspect", "stabbing", "killed", "dies",
  "trump", "h-1b", "vance", "new york", "white house", "u.s.", "ice agents", "federal immigration", "biden", "ukraine", "gaza",
];
// Si la dirección de la noticia contiene esto, se descarta (noticias del mundo, no de Japón)
const EXCLUDE_URL = ["/category/world/"];

// ========================

const UA = "Mozilla/5.0 (compatible; LatinosEnJaponBot)";
const clean = (s = "") =>
  s.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

async function readFeed(feed) {
  const r = await fetch(feed.url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`${r.status}`);
  const $ = cheerio.load(await r.text(), { xmlMode: true });
  const items = [];
  $("item, entry").each((_, el) => {
    const e = $(el);
    const title = clean(e.find("title").first().text());
    let link = clean(e.find("link").first().text());
    if (!link) link = e.find("link").first().attr("href") || "";
    const desc = clean(e.find("description, summary, content").first().text());
    const date = Date.parse(e.find("pubDate, published, updated, dc\\:date").first().text()) || null;
    if (title && link) items.push({ title, link, desc: desc.slice(0, 250), date, source: feed.name });
  });
  return items;
}

function score(item) {
  const text = `${item.title} ${item.desc}`.toLowerCase();
  if (EXCLUDE_URL.some((u) => item.link.includes(u))) return 0;
  if (EXCLUDE.some((w) => text.includes(w.toLowerCase()))) return 0;
  return KEYWORDS.reduce((s, [w, k]) => s + (text.includes(k.toLowerCase()) ? w : 0), 0);
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

async function facebook(n) {
  const { FACEBOOK_PAGE_ID, FACEBOOK_PAGE_TOKEN } = process.env;
  if (!FACEBOOK_PAGE_ID || !FACEBOOK_PAGE_TOKEN) return "omitido (faltan variables)";
  const body = new URLSearchParams({ message: format(n), link: n.link, access_token: FACEBOOK_PAGE_TOKEN });
  const r = await fetch(`https://graph.facebook.com/v26.0/${FACEBOOK_PAGE_ID}/feed`, { method: "POST", body });
  const j = await r.json().catch(() => ({}));
  ids.facebook = j.id;
  if (!r.ok) throw new Error(`Facebook ${r.status}: ${JSON.stringify(j.error || j)}`);
  return "ok";
}

// Traduce al español con la API de Claude. Sin ANTHROPIC_API_KEY o si falla, deja la noticia como está.
async function traducir(n) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return n;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        messages: [{
          role: "user",
          content:
            "Traduce al español neutro esta noticia de Japón para una comunidad latina que vive en Japón. " +
            "No inventes datos ni agregues información. Mantén nombres propios, cifras y fechas. " +
            "El resumen debe tener máximo 2 oraciones. Si no hay resumen, devuelve resumen vacío. " +
            'Responde SOLO con JSON: {"titulo":"...","resumen":"..."}\n\n' +
            `TITULO: ${n.title}\nRESUMEN: ${n.desc}`,
        }],
      }),
      signal: AbortSignal.timeout(15000),
    });
    const j = await r.json();
    const txt = (j.content?.[0]?.text || "").replace(/```json|```/g, "").trim();
    const o = JSON.parse(txt);
    if (o.titulo) return { ...n, title: o.titulo, desc: o.resumen || "" };
  } catch (e) {
    console.log("traducción falló:", String(e));
  }
  return n;
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

function format(n) {
  return `📰 ${n.title}\n\n${n.desc ? n.desc + "\n\n" : ""}🔗 ${n.link}\n\nFuente: ${n.source}\n🇯🇵 Latinos en Japón · 日本のラテン系コミュニティ`;
}

// dry: solo muestra lo que encontró | send: publica | mark: recuerda lo publicado
export async function run({ dry = false, send = true, mark = true } = {}) {
  const store = getStore("noticias");
  const posted = new Set((await store.get("posted", { type: "json" })) || []);

  const feeds = [];
  const all = [];
  const results = await Promise.allSettled(FEEDS.map(readFeed));
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      feeds.push(`${FEEDS[i].name}: ${r.value.length} noticias`);
      all.push(...r.value);
    } else feeds.push(`${FEEDS[i].name}: ERROR ${String(r.reason)}`);
  });

  const dayAgo = Date.now() - 36 * 3600 * 1000;
  const candidates = all
    .filter((n) => !posted.has(n.link) && (!n.date || n.date > dayAgo))
    .map((n) => ({ ...n, puntos: score(n) }))
    .filter((n) => n.puntos > 0)
    .sort((a, b) => b.puntos - a.puntos || (b.date || 0) - (a.date || 0));

  if (dry) {
    const prueba = candidates[0] ? await traducir(candidates[0]) : null;
    return { fuentes: feeds, totalLeidas: all.length, relevantes: candidates.length, traduccionPrueba: prueba && { titulo: prueba.title, resumen: prueba.desc }, top: candidates.slice(0, 5) };
  }
  if (!candidates.length) return { fuentes: feeds, resultado: "Sin noticias relevantes nuevas; no se publicó nada." };

  const n = await traducir(candidates[0]);
  const resultado = {};
  ids.facebook = ids.hilda = undefined;
  if (send) {
    try { await telegram(format(n)); resultado.telegram = "ok"; } catch (e) { resultado.telegram = String(e); }
    try { resultado.facebook = await facebook(n); } catch (e) { resultado.facebook = String(e); }
    try { resultado.hilda = await hilda(format(n)); } catch (e) { resultado.hilda = String(e); }
  }
  const ok = [resultado.telegram, resultado.facebook, resultado.hilda].includes("ok");
  if (send) await anotar({ tipo: "noticia", prueba: !mark, titulo: n.title, url: n.link, telegram: resultado.telegram, facebook_id: ids.facebook || null, hilda_id: ids.hilda || null });
  if (mark && ok) await store.setJSON("posted", [...posted, n.link].slice(-1000));
  return { publicado: n.link, titulo: n.title, puntos: n.puntos, fuentes: feeds, ...resultado };
}
