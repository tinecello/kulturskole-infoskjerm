// Henter gruppeundervisningen på Lørenskog Hus fra SpeedAdmin og gir skjermen bare det den skal vise.
// API-nøkkelen ligger i Netlify (SPEEDADMIN_API_KEY) og forlater aldri denne funksjonen.
// Ingen elevdata hentes eller sendes videre.
const BASE = 'https://api.speedadmin.dk/v1';

// Tines regel: disse navnene vises aldri på skjermen
const ALDRI_VIS = [/kjersti/i];

// Romnavn i SpeedAdmin → navn på skjermen
const ROM = {
  'Rom 10 (hjørne)': 'Rom 10',
  'Kunstrom (6 etg)': 'Kunstrom',
  'Slagverksrom': 'Slagverk',
};

// Korte visningsnavn per kurs (CourseName i SpeedAdmin). Når administrator har tilpasset
// navnene i SpeedAdmin, kan linjer her fjernes; da vises teksten fra SpeedAdmin direkte.
const KURS = {
  'Finn din stemme Solheim skole': t => `FDS ${t}`,
  'Lørenskog unge strykere': t => `LUS – ${t.toLowerCase()}`,
  'Gitarkurs for voksne': t => `Gitarkurs voksne – ${t.toLowerCase()}`,
  'Kunstkurs': t => `Kunstkurs ${t}`,
  'Fargespill': t => `Fargespill gruppe ${t}`,
  'Hip-hop': t => `Hip-hop ${t.toLowerCase().replace(/(\d+)\. klasse og oppover/, '$1. kl. +')}`,
};
const UKEDAG = /\b(mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)\b/gi;

const klokke = v => (v || '').slice(11, 16);          // "0001-01-01T18:00:00" → "18:00"
const dato = v => (v || '').slice(0, 10);              // "2026-10-29T00:00:00" → "2026-10-29"
const rydd = s => (s || '').replace(/\s+/g, ' ').trim();

function navn(l) {
  const kurs = rydd(l.CourseName), tittel = rydd(l.Title);
  // Tittelen uten ukedag og stedsnavn, f.eks. «Mandag 1» → «1», «Redesign 1 Lørenskog hus» → «Redesign 1»
  let t = rydd(tittel.replace(UKEDAG, '').replace(/lørenskog hus/i, '').replace(/\bgruppe\s+(\d)/i, '$1'));
  if (KURS[kurs]) return rydd(KURS[kurs](t));
  if (!t || t.toLowerCase() === kurs.toLowerCase()) return kurs;
  return t;
}

function laerere(s) {
  const alle = (s || '').split(',').map(rydd).filter(Boolean);
  // Grupper med mer enn to lærere vises uten navn (telles før noen navn skjules)
  if (alle.length > 2) return '';
  return alle.filter(n => !ALDRI_VIS.some(re => re.test(n))).join(', ');
}

// Bilde til en nyhet: eget bildefelt fra SpeedAdmin, ellers første <img> i nyhetsteksten.
const URL_OK = /^(https?:\/\/|data:image\/)/i;
function bildeUrl(v){
  if (!v) return '';
  if (typeof v === 'string') return URL_OK.test(v.trim()) ? v.trim() : '';
  if (Array.isArray(v)) { for (const x of v) { const u = bildeUrl(x); if (u) return u; } return ''; }
  if (typeof v === 'object') return bildeUrl(v.Url ?? v.URL ?? v.url ?? v.Src ?? v.Link ?? v.FileUrl ?? v.ImageUrl ?? v.Path);
  return '';
}
function bilde(n){
  for (const [k, v] of Object.entries(n || {})) {
    if (/image|picture|photo|bilde|thumb|media|attach|file/i.test(k)) { const u = bildeUrl(v); if (u) return u; }
  }
  const html = String(n.Text ?? n.Body ?? n.Content ?? n.Description ?? n.Teaser ?? '');
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m && URL_OK.test(m[1]) ? m[1].replace(/&amp;/g, '&') : '';
}

export default async (req) => {
  const key = Netlify.env.get('SPEEDADMIN_API_KEY');
  if (!key) return Response.json({ ok: false, feil: 'Mangler API-nøkkel' }, { status: 500 });

  try {
    const res = await fetch(`${BASE}/lesson`, { headers: { Authorization: key } });
    if (!res.ok) throw new Error(`SpeedAdmin svarte ${res.status}`);
    const timer = await res.json();

    const grupper = timer
      .filter(l => l.Active && /lørenskog hus/i.test(`${l.School} ${l.Room}`))
      .map(l => {
        const romNavn = rydd(String(l.Room || '').replace(/^Lørenskog Hus\s*-\s*/i, ''));
        return {
          rom: ROM[romNavn] || romNavn,
          gruppe: navn(l),
          laerer: laerere(l.Teachers),
          dato: dato(l.Date),
          s: klokke(l.StartTime),
          e: klokke(l.EndTime),
        };
      })
      .filter(g => g.dato && g.s && g.e && !ALDRI_VIS.some(re => re.test(g.gruppe)));

    // Nyheter fra SpeedAdmin (Portal › Nyheter). Feiler dette, vises skjermen uten nyheter.
    // Nyheter fra SpeedAdmin (Portal › Nyheter). Feiler dette, vises skjermen uten nyheter.
    // Nyheter med «avlyst» eller «syk» i tittelen er endringer (sykdom, avlysninger) og
    // sendes for seg, så skjermen kan vise dem i «Endringer i dag» og merke raden AVLYST.
    let nyheter = [], endringer = [];
    try {
      const nr = await fetch(`${BASE}/news`, { headers: { Authorization: key } });
      if (nr.ok) {
        const data = await nr.json();
        const liste = Array.isArray(data) ? data : (data.Results || []);
        // MIDLERTIDIG (bare på test-grenen): ?felter=1 viser hvilke felt SpeedAdmin sender for nyhetene
        if (new URL(req.url).searchParams.get('felter')) {
          return Response.json(liste.slice(0, 8).map(n => Object.fromEntries(Object.entries(n).map(([k, v]) =>
            [k, typeof v === 'string' ? v.slice(0, 300) : v]))), { headers: { 'Cache-Control': 'no-store' } });
        }
        const idag = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' }); // ÅÅÅÅ-MM-DD norsk tid
        const tekst = s => rydd(String(s || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&'));
        const ENDRING = /\b(avlyst|avlyses|syk)/i;
        const alle = liste
          .map(n => ({
            tittel: tekst(n.Title ?? n.Headline ?? n.Subject ?? n.Name),
            tekst: tekst(n.Text ?? n.Body ?? n.Content ?? n.Description ?? n.Teaser).slice(0, 160),
            fra: dato(n.Start),   // «Vises fra» i SpeedAdmin
            til: dato(n.End),     // «Vises til» i SpeedAdmin
            bilde: bilde(n),
          }))
          .filter(n => n.tittel && !ALDRI_VIS.some(re => re.test(`${n.tittel} ${n.tekst}`)));

        // Vanlige nyheter: «Vises til» må være satt, så gamle interne nyheter uten sluttdato ikke vises
        nyheter = alle.filter(n => !ENDRING.test(n.tittel) && n.til && n.til >= idag && (!n.fra || n.fra <= idag));
        // Endringer: gjelder i perioden, eller bare «Vises fra»-dagen hvis sluttdato mangler
        endringer = alle.filter(n => ENDRING.test(n.tittel) &&
          (n.til ? (n.til >= idag && (!n.fra || n.fra <= idag)) : n.fra === idag));
      }
    } catch { /* uten nyheter */ }

    return Response.json({ ok: true, oppdatert: new Date().toISOString(), grupper, nyheter, endringer }, {
      headers: {
        // Skjermene deler ett svar i 5 minutter, så SpeedAdmin får få kall
        'Cache-Control': 'public, max-age=0, must-revalidate',
        'Netlify-CDN-Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (e) {
    return Response.json({ ok: false, feil: String(e.message || e) }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
};

export const config = { path: '/api/program' };
