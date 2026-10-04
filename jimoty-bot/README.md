# Bot de Jimoty → Telegram (Netlify)

## 1. Crear el bot de Telegram
1. En Telegram habla con **@BotFather** → `/newbot` → copia el **token**.
2. Escríbele cualquier mensaje a tu bot nuevo.
3. Abre `https://api.telegram.org/bot<TOKEN>/getUpdates` y copia el número de `"chat":{"id":...}`.

## 2. Subir a Netlify
Las funciones programadas necesitan deploy con build, no arrastrar carpeta:
- Sube esta carpeta a un repositorio de GitHub → Netlify → Add new site → Import from Git.
- O con CLI: `npm i -g netlify-cli && netlify deploy --prod`

## 3. Variables de entorno (Site settings → Environment variables)
- `TELEGRAM_TOKEN`
- `TELEGRAM_CHAT_ID`
- `AREA` → tu prefectura en minúsculas (aichi, tokyo, osaka, kanagawa...) o `all`
- `TEST_KEY` → una clave inventada por ti

## 4. Probar
- `https://TU-SITIO.netlify.app/.netlify/functions/jimoty-test?key=TU_KEY&dry=1` → debe mostrar anuncios.
- Con `&send=1` te manda 3 avisos a Telegram.
- La primera ejecución automática guarda todo en silencio; los avisos llegan desde la segunda.

## Ajustes
Todo en `netlify/shared/config.mjs`: palabras clave, precios máximos y palabras a descartar.
