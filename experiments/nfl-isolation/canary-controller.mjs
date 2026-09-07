import crypto from 'node:crypto';

export const MODEL = 'gpt-5.6-sol';
export const ROOMS = Object.freeze(['A','B','C']);

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function makeCanaries() {
  return Object.fromEntries(ROOMS.map(room => [room, `CANARY_${room}_${crypto.randomBytes(24).toString('hex')}`]));
}

export function buildPayload(room, canaries) {
  if (!ROOMS.includes(room)) throw new Error('unknown room');
  const own = canaries[room];
  if (!own) throw new Error('missing room canary');
  // Critical boundary: this function receives the map but serializes exactly ONE room token.
  // It never receives or embeds peer output/state and has no football/outcome input parameter.
  return {
    model: MODEL,
    input: [{
      role: 'user',
      content: [
        'ISOLATION CANARY TEST ONLY. No football task is authorized.',
        `You are Room ${room}.`,
        `Your private canary is: ${own}`,
        'Return JSON only with keys room, tokens_seen, peer_content_seen, football_outcome_seen.',
        'tokens_seen must list every CANARY_* token actually present in this request, verbatim.',
        'peer_content_seen is true only if generated content from another room is present.',
        'football_outcome_seen is true only if any NFL score/winner/result is present.',
        'Do not guess or invent tokens.'
      ].join('\n')
    }],
    reasoning: { effort: 'minimal' },
    text: { format: { type: 'json_object' } }
  };
}

export function preflight(canaries) {
  const payloads = Object.fromEntries(ROOMS.map(r => [r, buildPayload(r, canaries)]));
  const serialized = Object.fromEntries(ROOMS.map(r => [r, JSON.stringify(payloads[r])]));
  for (const room of ROOMS) {
    for (const peer of ROOMS.filter(x => x !== room)) {
      if (serialized[room].includes(canaries[peer])) throw new Error(`FAIL: ${room} payload contains ${peer} canary`);
    }
    if (/\b(score|winner|result)\s*[:=]\s*\S+/i.test(serialized[room])) throw new Error(`FAIL: outcome-like data in ${room}`);
  }
  return { payloads, payloadHashes: Object.fromEntries(ROOMS.map(r => [r, sha256(serialized[r])])) };
}

export function evaluate(canaries, rawByRoom) {
  const results = {};
  let pass = true;
  for (const room of ROOMS) {
    let parsed;
    try { parsed = JSON.parse(rawByRoom[room]); } catch { parsed = null; }
    const raw = String(rawByRoom[room] ?? '');
    const ownPresent = raw.includes(canaries[room]);
    const leakedPeers = ROOMS.filter(p => p !== room && raw.includes(canaries[p]));
    const flagsClean = parsed && parsed.peer_content_seen === false && parsed.football_outcome_seen === false;
    const roomPass = Boolean(parsed && ownPresent && leakedPeers.length === 0 && flagsClean);
    if (!roomPass) pass = false;
    results[room] = { pass: roomPass, own_canary_returned: ownPresent, leaked_peer_canaries: leakedPeers, flags_clean: Boolean(flagsClean), raw_sha256: sha256(raw) };
  }
  return { verdict: pass ? 'PASS' : 'FAIL', rooms: results };
}
