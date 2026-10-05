import { run } from "../shared/publicar.mjs";

// /.netlify/functions/publicar-test?key=TU_CLAVE&dry=1   -> muestra qué publicaría, sin publicar
// /.netlify/functions/publicar-test?key=TU_CLAVE&send=1  -> publica una prueba en el canal
export default async (req) => {
  const u = new URL(req.url);
  if (!process.env.TEST_KEY || u.searchParams.get("key") !== process.env.TEST_KEY) {
    return new Response("No autorizado", { status: 401 });
  }
  try {
    const out = await run({ dry: u.searchParams.get("send") !== "1", send: true, mark: false });
    return new Response(JSON.stringify(out, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8" } });
  } catch (e) {
    return new Response(String(e), { status: 500 });
  }
};
