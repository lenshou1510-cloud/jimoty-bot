import { leer } from "../shared/registro.mjs";

// /.netlify/functions/panel?key=TU_CLAVE  -> últimas 30 publicaciones y cómo les va
export default async (req) => {
  const u = new URL(req.url);
  if (!process.env.TEST_KEY || u.searchParams.get("key") !== process.env.TEST_KEY) {
    return new Response("No autorizado", { status: 401 });
  }
  const { FACEBOOK_PAGE_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  const lista = (await leer()).slice(-30).reverse();

  // Facebook: reacciones, comentarios y veces compartido
  await Promise.all(
    lista.map(async (p) => {
      if (!p.facebook_id || !FACEBOOK_PAGE_TOKEN) return;
      try {
        const r = await fetch(
          `https://graph.facebook.com/v26.0/${p.facebook_id}?fields=reactions.summary(true).limit(0),comments.summary(true).limit(0),shares&access_token=${FACEBOOK_PAGE_TOKEN}`
        );
        const j = await r.json();
        p.facebook = r.ok
          ? { reacciones: j.reactions?.summary?.total_count ?? 0, comentarios: j.comments?.summary?.total_count ?? 0, compartidos: j.shares?.count ?? 0 }
          : "no se pudo leer";
      } catch {
        p.facebook = "no se pudo leer";
      }
    })
  );

  // Hilda Social: vistas guardadas en la tabla posts
  const hildaIds = lista.map((p) => p.hilda_id).filter(Boolean);
  if (hildaIds.length && SUPABASE_URL && SUPABASE_SERVICE_KEY) {
    try {
      const headers = { apikey: SUPABASE_SERVICE_KEY };
      if (SUPABASE_SERVICE_KEY.startsWith("eyJ")) headers.Authorization = `Bearer ${SUPABASE_SERVICE_KEY}`;
      const r = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/posts?id=in.(${hildaIds.join(",")})&select=id,views`, { headers });
      const filas = await r.json();
      const vistas = Object.fromEntries((Array.isArray(filas) ? filas : []).map((x) => [x.id, x.views]));
      lista.forEach((p) => { if (p.hilda_id) p.hilda_vistas = vistas[p.hilda_id] ?? 0; });
    } catch {}
  }

  const salida = lista.map(({ facebook_id, hilda_id, ...resto }) => resto);
  return new Response(JSON.stringify({ total: salida.length, publicaciones: salida }, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};
