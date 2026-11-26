#!/usr/bin/env node
// Fetches a Fathom recording's transcript from a PUBLIC share link.
// Works on Fathom's free plan with no API key: the share page exposes the
// numeric call_id and the "copy transcript" endpoint, both gated only by the
// share token (which is the share-link slug).
//
// Usage:  node fetch-fathom.mjs <https://fathom.video/share/TOKEN | TOKEN>
//
// Prints delimited sections (TITLE / DATE HINT / RECORDING / TRANSCRIPT /
// ACTION ITEMS) to stdout. The transcript is RAW, including any emails Fathom
// puts in speaker labels; the caller is responsible for PII-scrubbing when it
// writes the committed meeting note.

const UA = 'Mozilla/5.0';

function fail(msg) {
  console.error(`fetch-fathom: ${msg}`);
  process.exit(1);
}

// Decode the \uXXXX escapes Fathom's embedded JSON uses (title is regex-scraped
// from the page, not JSON.parse'd, so these would otherwise survive).
function decodeJsUnicode(s) {
  return s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

// Decode the HTML entities Fathom uses (named + numeric).
function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

// Turn Fathom's transcript HTML into readable plain text, one paragraph per
// line. Anchors like <a ...timestamp=52>@0:52</a> collapse to "@0:52" so the
// caller can rebuild ?timestamp= deep links from the M:SS marker.
function htmlToText(html) {
  return decodeEntities(
    html
      .replace(/<\s*(br|\/p|\/h[1-6]|\/div)\s*\/?\s*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  return { ok: res.ok, status: res.status, text: await res.text() };
}

const input = process.argv[2];
if (!input) fail('missing argument. Usage: node fetch-fathom.mjs <share-url|token>');

// Token == the share-link slug. Accept a full URL or a bare token.
const token = (input.match(/\/share\/([^/?#]+)/) || [null, input.trim()])[1];
if (!token || /\s/.test(token)) fail(`could not parse a share token from "${input}"`);

const sharePage = await get(`https://fathom.video/share/${token}`);
if (!sharePage.ok) fail(`share page returned HTTP ${sharePage.status} for token ${token}`);
const shareHtml = sharePage.text;

const callId = (shareHtml.match(/\/calls\/(\d+)\/copy_transcript/) ||
  shareHtml.match(/call-(\d+)/) ||
  shareHtml.match(/\/calls\/(\d+)/) || [])[1];
if (!callId) fail('could not find the call_id in the share page (Fathom may have changed its markup)');

const decodedPage = decodeEntities(shareHtml);
const title = decodeJsUnicode((decodedPage.match(/"title":"([^"]+)"/) || [])[1] || '(untitled meeting)');
const dateHint = (decodedPage.match(/\b(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}/) || [])[1] || 'unknown';

const transcriptRes = await get(
  `https://fathom.video/calls/${callId}/copy_transcript?token=${token}`,
);
let transcript = '';
try {
  transcript = htmlToText(JSON.parse(transcriptRes.text).html || '');
} catch {
  fail(`transcript endpoint did not return JSON (HTTP ${transcriptRes.status}); the token may be invalid or the recording is not shared`);
}
if (!transcript) fail('transcript was empty');

// Action items only exist when the recording has highlights; the endpoint
// returns an error HTML page otherwise. Best-effort.
let actionItems = 'none available';
try {
  const aiRes = await get(
    `https://fathom.video/calls/${callId}/clipboard_action_items?token=${token}`,
  );
  const parsed = JSON.parse(aiRes.text);
  const text = htmlToText(parsed.html || '');
  if (text) actionItems = text;
} catch {
  // no highlights on this recording, leave "none available"
}

const out = [
  '=== MEETING TITLE ===',
  title,
  '=== DATE HINT ===',
  dateHint,
  '=== RECORDING URL ===',
  `https://fathom.video/share/${token}`,
  '=== TRANSCRIPT ===',
  transcript,
  '=== ACTION ITEMS (Fathom) ===',
  actionItems,
  '',
].join('\n');
process.stdout.write(out);
