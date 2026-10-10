import { getStore } from "@netlify/blobs";

// Guarda un registro de cada publicación (las últimas 200) para poder ver cómo les va.
export async function anotar(entrada) {
  try {
    const store = getStore("registro");
    const lista = (await store.get("publicaciones", { type: "json" })) || [];
    lista.push({ fecha: new Date().toISOString(), ...entrada });
    await store.setJSON("publicaciones", lista.slice(-200));
  } catch (e) {
    console.log("registro falló:", String(e));
  }
}

export async function leer() {
  const store = getStore("registro");
  return (await store.get("publicaciones", { type: "json" })) || [];
}
