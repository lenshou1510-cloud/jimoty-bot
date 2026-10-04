import { run } from "../shared/jimoty.mjs";

// Prueba: /.netlify/functions/jimoty-test?key=TU_TEST_KEY&dry=1   (solo muestra lo encontrado)
//         /.netlify/functions/jimoty-test?key=TU_TEST_KEY&send=1  (manda 3 avisos a Telegram)
export default async (req) => {
  const u = new URL(req.url);
  if (!process.env.TEST_KEY || u.searchParams.get("key") !== process.env.TEST_KEY) {
    return new Response("No autorizado", { status: 401 });
  }
  try {
    const out = await run({ dry: u.searchParams.get("dry") === "1", force: u.searchParams.get("send") === "1" });
    return new Response(JSON.stringify(out, null, 2), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(String(e), { status: 500 });
  }
};
