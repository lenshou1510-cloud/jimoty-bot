import { run } from "../shared/jimoty.mjs";

export default async () => {
  const out = await run();
  console.log(JSON.stringify(out));
};

// Cada 15 minutos
export const config = { schedule: "*/15 * * * *" };
