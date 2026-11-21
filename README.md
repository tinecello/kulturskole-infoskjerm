# Infoskjerm – Lørenskog Kulturskole

«Dagens program» på infoskjermen i Lørenskog Hus (vises via LoopSign).

- `public/index.html` – selve skjermen (fast ukeplan, ekstra datoer, ferier, bursdager)
- `netlify/functions/program.mjs` – henter grupper og nyheter fra SpeedAdmin (`/api/program`)
- API-nøkkelen ligger i Netlify som `SPEEDADMIN_API_KEY`, aldri i repoet

Endringer på `main` publiseres automatisk. Test på en egen gren først: Netlify lager en forhåndsvisning uten å røre skjermen.
