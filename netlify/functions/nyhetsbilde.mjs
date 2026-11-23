// Viser bildet til en nyhet fra SpeedAdmin på infoskjermen (/api/nyhetsbilde/<BlobId>).
// Bildet hentes med API-nøkkelen her, så nøkkelen aldri sendes til skjermen.
// Bare bilder som hører til en nyhet som vises nå, slipper gjennom – ingen andre filer fra SpeedAdmin.
const BASE = 'https://api.speedadmin.dk/v1';
const dato = v => (v || '').slice(0, 10);

export default async (req, context) => {
  const key = Netlify.env.get('SPEEDADMIN_API_KEY');
  const id = context.params.id;
  const nei = (s = 404) => new Response('', { status: s, headers: { 'Cache-Control': 'no-store' } });
  if (!key || !/^[A-Za-z0-9]{10,80}$/.test(id || '')) return nei();

  try {
    const nr = await fetch(`${BASE}/news`, { headers: { Authorization: key } });
    if (!nr.ok) return nei(502);
    const data = await nr.json();
    const liste = Array.isArray(data) ? data : (data.Results || []);
    const idag = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });
    const nyhet = liste.find(n => n.Blob && n.Blob.BlobId === id && /^image\//i.test(n.Blob.MimeType || '') &&
      dato(n.End) >= idag && (!n.Start || dato(n.Start) <= idag));
    if (!nyhet) return nei();

    const br = await fetch(`${BASE}/blobs/${encodeURIComponent(id)}`, { headers: { Authorization: key } });
    if (!br.ok) return nei(502);
    let type = br.headers.get('content-type') || '';
    let bytes;
    if (/json/i.test(type)) {
      // Noen SpeedAdmin-svar pakker filen som base64 i JSON
      const j = await br.json();
      const b64 = typeof j === 'string' ? j : (j.Data ?? j.Content ?? j.Bytes ?? j.File ?? j.Base64 ?? '');
      if (!b64) return nei(502);
      bytes = Uint8Array.from(atob(String(b64).replace(/^data:[^,]*,/, '')), c => c.charCodeAt(0));
      type = nyhet.Blob.MimeType;
    } else {
      bytes = new Uint8Array(await br.arrayBuffer());
      if (!/^image\//i.test(type)) type = nyhet.Blob.MimeType;
    }
    return new Response(bytes, {
      headers: {
        'Content-Type': type,
        'Cache-Control': 'public, max-age=3600',
        'Netlify-CDN-Cache-Control': 'public, s-maxage=86400',
      },
    });
  } catch {
    return nei(502);
  }
};

export const config = { path: '/api/nyhetsbilde/:id' };
