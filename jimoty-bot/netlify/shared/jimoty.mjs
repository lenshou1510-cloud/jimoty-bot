import * as cheerio from "cheerio";
import { getStore } from "@netlify/blobs";
import { QUERIES, EXCLUDE, GOOD_WORDS } from "./config.mjs";

const AREA = process.env.AREA || "all"; // ej: "aichi", "tokyo", "osaka"
const UA = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchList(q) {
  const url = `https://jmty.jp/${AREA}/sale?keyword=${encodeURIComponent(q.keyword)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "ja,es;q=0.8" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const $ = cheerio.load(await res.text());
  const items = new Map();

  $('a[href*="/article-"]').each((_, a) => {
    const href = $(a).attr("href") || "";
    const m = href.match(/article-([a-z0-9]+)/i);
    if (!m) return;
    const id = m[1];
    const link = href.startsWith("http") ? href : `https://jmty.jp${href}`;
    const title = $(a).text().replace(/\s+/g, " ").trim();
    const box = $(a).closest("li, article");
    const boxEl = box.length ? box : $(a).parent();
    const text = boxEl.text().replace(/\s+/g, " ");
    const priceMatch = text.match(/([\d,]+)\s*円/);
    const free = /無料|あげます|0円/.test(text);
    const price = free ? 0 : priceMatch ? parseInt(priceMatch[1].replace(/,/g, ""), 10) : null;
    const img = boxEl.find("img").first();
    const image = img.attr("data-src") || img.attr("src") || null;

    const prev = items.get(id);
    if (!prev || title.length > prev.title.length) {
      items.set(id, { id, link, title: title || prev?.title || "(sin título)", price, image, keyword: q.keyword, moto: !!q.moto, maxPrice: q.maxPrice });
    }
  });
  return [...items.values()];
}

function passes(item) {
  if (EXCLUDE.some((w) => item.title.includes(w))) return false;
  if (item.maxPrice != null && item.price != null && item.price > item.maxPrice) return false;
  return true;
}

async function telegram(text) {
  const { TELEGRAM_TOKEN, TELEGRAM_CHAT_ID } = process.env;
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
  });
  if (!res.ok) throw new Error(`Telegram ${res.status}: ${await res.text()}`);
}

function format(i) {
  const precio = i.price === 0 ? "GRATIS 🎁" : i.price != null ? `${i.price.toLocaleString()} 円` : "precio no visible";
  let nota = "";
  if (i.moto) {
    nota = GOOD_WORDS.some((w) => i.title.includes(w))
      ? "\n✅ Dice que tiene llave/papeles"
      : "\n⚠️ Pregunta por llave y papeles";
  }
  return `🔔 ${i.title}\n💴 ${precio}  (${i.keyword})${nota}\n${i.link}`;
}

// opciones: dry = solo muestra lo encontrado; force = manda hasta 3 aunque ya estén vistos
export async function run({ dry = false, force = false } = {}) {
  const store = getStore("jimoty-seen");
  const stored = await store.get("ids", { type: "json" });
  const firstRun = !stored;
  const seen = new Set(stored || []);

  const found = [];
  const errors = [];
  for (let i = 0; i < QUERIES.length; i += 3) {
    const batch = QUERIES.slice(i, i + 3);
    const results = await Promise.allSettled(batch.map(fetchList));
    results.forEach((r, j) => (r.status === "fulfilled" ? found.push(...r.value) : errors.push(String(r.reason))));
    await sleep(1000);
  }

  const unique = new Map();
  found.forEach((x) => unique.set(x.id, x));
  const all = [...unique.values()].filter(passes);

  if (dry) return { total: all.length, errors, sample: all.slice(0, 10) };

  const fresh = force ? all.slice(0, 3) : all.filter((x) => !seen.has(x.id));

  // Primera vez: guarda todo en silencio para no recibir cientos de avisos
  if (!firstRun || force) {
    for (const item of fresh.slice(0, 15)) await telegram(format(item));
  }

  all.forEach((x) => seen.add(x.id));
  await store.setJSON("ids", [...seen].slice(-3000));
  return { total: all.length, nuevos: firstRun && !force ? 0 : fresh.length, primeraVez: firstRun, errors };
}
