// MIDLERTIDIG TEST – slettes etter prøven. Finnes bare på grenen «test-booking», aldri på main.
// ?steg=les  → leser rom, bookingtyper, lærer-id og eksisterende bookinger i Madsensalen (endrer ingenting)
// ?steg=prov&kode=…&type=N → oppretter én testbooking søndag 29.11 kl. 07:00–07:15 og sletter den straks
const BASE = 'https://api.speedadmin.dk/v1';
const KODE = '656f6775d2e62a11';

export default async (req) => {
  const key = Netlify.env.get('SPEEDADMIN_API_KEY');
  if (!key) return Response.json({ ok: false, feil: 'Mangler API-nøkkel på denne grenen' }, { status: 500 });
  const url = new URL(req.url);
  const steg = url.searchParams.get('steg') || 'les';
  const h = { Authorization: key, 'Content-Type': 'application/json' };
  const kall = async (metode, sti, body) => {
    const r = await fetch(`${BASE}${sti}`, { method: metode, headers: h, body: body ? JSON.stringify(body) : undefined });
    const tekst = await r.text();
    let data; try { data = JSON.parse(tekst); } catch { data = tekst.slice(0, 500); }
    return { status: r.status, data };
  };

  const rom = await kall('GET', '/rooms/all');
  const aktuelle = Array.isArray(rom.data)
    ? rom.data.filter(r => /madsen|volt/i.test(`${r.Room}`)).map(r => ({ RoomId: r.RoomId, Room: r.Room, School: r.School }))
    : rom;
  const typer = await kall('GET', '/bookings/bookingtypes');
  const laerer = await kall('POST', '/teachers', { LastName: 'Johnsgaard', Take: 5, Skip: 0 });
  const tine = Array.isArray(laerer.data?.Results ?? laerer.data)
    ? (laerer.data.Results ?? laerer.data).map(t => ({ TeacherId: t.TeacherId ?? t.Id, navn: `${t.FirstName ?? ''} ${t.LastName ?? ''}`.trim() }))
    : laerer;
  const madsen = Array.isArray(aktuelle) ? aktuelle.find(r => /madsen/i.test(r.Room)) : null;

  if (steg === 'les') {
    const typeIds = Array.isArray(typer.data) ? typer.data.map(t => t.BookingTypeID) : [];
    const bookinger = madsen && typeIds.length
      ? await kall('POST', '/bookings', { BookingTypeIds: typeIds, RoomIds: [madsen.RoomId], DateFrom: new Date().toISOString().slice(0, 10), Take: 20, Skip: 0 })
      : null;
    return Response.json({ steg, rom: aktuelle, bookingtyper: typer, laerer: tine, bookingerIMadsensalen: bookinger });
  }

  if (steg === 'prov') {
    if (url.searchParams.get('kode') !== KODE) return Response.json({ ok: false, feil: 'Feil kode' }, { status: 403 });
    const type = Number(url.searchParams.get('type'));
    const teacherId = Array.isArray(tine) && tine[0]?.TeacherId;
    if (!madsen || !type || !teacherId) return Response.json({ ok: false, feil: 'Mangler rom, type eller lærer', madsen, type, tine });
    const opprett = await kall('POST', '/bookings/createbooking', {
      BookingTypeId: type,
      Title: 'TEST – slettes straks',
      TeacherId: teacherId,
      RoomIds: [madsen.RoomId],
      BookingDates: [{ BookingDate: '2026-11-29T00:00:00', StartTime: '2026-11-29T07:00:00', EndTime: '2026-11-29T07:15:00' }],
    });
    // Finn id-en: enten i svaret, eller ved å lete opp testbookingen
    let id = typeof opprett.data === 'number' ? opprett.data : (opprett.data?.BookingId ?? opprett.data?.Id ?? null);
    let funnet = null;
    if (!id && opprett.status < 300) {
      funnet = await kall('POST', '/bookings', { BookingTypeIds: [type], RoomIds: [madsen.RoomId], DateFrom: '2026-11-28', Take: 50, Skip: 0 });
      const liste = funnet.data?.Results ?? funnet.data;
      const treff = Array.isArray(liste) ? liste.find(b => /TEST – slettes straks/.test(JSON.stringify(b))) : null;
      id = treff?.BookingId ?? treff?.Id ?? null;
    }
    const slett = id ? await kall('GET', `/bookings/deletebooking/${id}`) : null;
    const sjekk = await kall('POST', '/bookings', { BookingTypeIds: [type], RoomIds: [madsen.RoomId], DateFrom: '2026-11-28', Take: 50, Skip: 0 });
    const igjen = JSON.stringify(sjekk.data).includes('TEST – slettes straks');
    return Response.json({ steg, opprett, id, funnet, slett, testbookingenFinnesFortsatt: igjen });
  }
  return Response.json({ ok: false, feil: 'Ukjent steg' }, { status: 400 });
};

export const config = { path: '/api/speedadmin-test' };
