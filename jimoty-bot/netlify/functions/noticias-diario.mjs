import { run } from "../shared/noticias.mjs";

export default async () => {
  console.log(JSON.stringify(await run()));
};

// 22:00, 03:00 y 11:00 UTC = 07:00, 12:00 y 20:00 en Japón
export const config = { schedule: "0 22,3,11 * * *" };
