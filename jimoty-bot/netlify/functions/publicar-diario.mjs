import { run } from "../shared/publicar.mjs";

export default async () => {
  const out = await run();
  console.log(JSON.stringify(out));
};

// Todos los días a las 10:00 UTC = 19:00 hora de Japón
export const config = { schedule: "0 10 * * *" };
