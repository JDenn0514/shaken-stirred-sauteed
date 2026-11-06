// POST /api/fetch { url }: a recipe website's page, for the intake
// (docs/specs/recipe-editor-design.md, "Recipe websites"). A browser can't
// read another site's page from this one, so the Worker gets it. index.js only
// sends signed-in requests here, so it can't be used as an open proxy.
//
// Answers { html, url } (url: where the page ended up after redirects), or
// { error } with a message to show as it is, plus `refused: true` when the
// site turned the request away (copying the page's text is the way round).
//
// Only https, and only public websites: a private or local address
// (localhost, 10.x, 192.168.x, 127.x, ::1, link-local and the like) is
// refused before anything is sent, and so is a redirect to one. Cloudflare
// runs the Worker away from any private network anyway; this keeps it that way
// on purpose. Pages over 5 MB, and sites slower than 10 seconds, are given up on.
const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
// Like a web browser, since many recipe sites turn away anything else, but
// saying who's asking.
const USER_AGENT = "Mozilla/5.0 (compatible; recipe reader; +https://shaken-stirred-sauteed.com)";
const COPY_INSTEAD = "Open the recipe on that site, copy its text, and paste it below.";

class Problem extends Error {
  constructor(status, error, extra = {}) {
    super(error);
    this.status = status;
    this.extra = extra;
  }
}

export async function fetchPage(request, env) {
  let address;
  try {
    ({ url: address } = await request.json());
  } catch {
    address = null;
  }
  try {
    const { html, url } = await get(address, Number(env.FETCH_TIMEOUT_MS) || TIMEOUT_MS);
    return Response.json({ html, url });
  } catch (e) {
    if (!(e instanceof Problem)) throw e;
    return Response.json({ error: e.message, ...e.extra }, { status: e.status });
  }
}

async function get(address, timeout) {
  const signal = AbortSignal.timeout(timeout);
  let url = checked(address);
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await fetch(url, {
        redirect: "manual",
        signal,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.has("Location")) {
        await res.body?.cancel();
        url = checked(new URL(res.headers.get("Location"), url).href);
        continue;
      }
      return { html: await read(res, url), url: url.href };
    }
  } catch (e) {
    if (e instanceof Problem) throw e;
    if (signal.aborted) throw new Problem(504, `That site took too long to answer. Try again, or: ${lower(COPY_INSTEAD)}`);
    throw new Problem(502, "Couldn't reach that site. Check the address.");
  }
  throw new Problem(502, "That site keeps redirecting, so the page can't be read.");
}

async function read(res, url) {
  if (!res.ok) {
    await res.body?.cancel();
    if (res.status === 404 || res.status === 410) throw new Problem(502, "That site says the page doesn't exist. Check the address.");
    if ([401, 403, 406, 429, 451, 503].includes(res.status)) {
      throw new Problem(502, `${url.hostname} won't share its pages with other sites. ${COPY_INSTEAD}`, { refused: true });
    }
    throw new Problem(502, `That site answered with an error (${res.status}). Try again later, or: ${lower(COPY_INSTEAD)}`);
  }
  const type = (res.headers.get("Content-Type") || "text/html").split(";")[0].trim().toLowerCase();
  if (!/^(text\/html|application\/xhtml\+xml|text\/plain)$/.test(type)) {
    await res.body?.cancel();
    const pdf = type === "application/pdf" ? " It's a PDF: download it, then use “Choose a PDF”." : "";
    throw new Problem(415, `That link isn't a web page.${pdf}`);
  }
  const tooBig = new Problem(413, `That page is too big to read (over 5 MB). ${COPY_INSTEAD}`);
  if (Number(res.headers.get("Content-Length")) > MAX_BYTES) {
    await res.body?.cancel();
    throw tooBig;
  }
  // Counted as it comes, since Content-Length can be missing or wrong.
  const chunks = [];
  let size = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw tooBig;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { bytes.set(c, at); at += c.byteLength; }
  const charset = /charset=["']?([\w-]+)/i.exec(res.headers.get("Content-Type") || "")?.[1];
  try {
    return new TextDecoder(charset || "utf-8").decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

const lower = (s) => s[0].toLowerCase() + s.slice(1);

// The address as a URL, if it's an https address of a public website.
function checked(address) {
  let url;
  try {
    url = new URL(String(address ?? "").trim());
  } catch {
    url = null;
  }
  if (!url || url.protocol !== "https:") throw new Problem(400, "Give the page's full address, starting https://");
  if (url.username || url.password || isPrivate(url.hostname)) throw new Problem(400, "That address isn't a public website.");
  return url;
}

// Names and addresses that aren't the public internet. The URL parser has
// already turned other ways of writing an IPv4 address (2130706433,
// 0x7f000001, 127.1) into the usual four numbers.
function isPrivate(host) {
  host = host.toLowerCase().replace(/\.$/, "");
  if (host.startsWith("[")) return privateV6(host.slice(1, -1));
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
  if (v4) return privateV4(v4.slice(1).map(Number));
  // A name with no dot, or one only a local network knows.
  return !host.includes(".") || /\.(localhost|local|lan|home|internal|intranet|corp|private|test|invalid|home\.arpa)$/.test(host);
}

function privateV4([a, b]) {
  return a === 0 || a === 10 || a === 127 || a >= 224 // this network, private, loopback, multicast and reserved
    || (a === 100 && b >= 64 && b <= 127) // shared address space (carrier NAT)
    || (a === 169 && b === 254) // link-local, including cloud metadata
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0) // IETF protocol assignments
    || (a === 198 && (b === 18 || b === 19)); // benchmarking
}

function privateV6(host) {
  // An IPv4 address inside IPv6 (::ffff:7f00:1 is 127.0.0.1).
  const mapped = /^(?:0*:)*:?ffff:([\da-f]{1,4}):([\da-f]{1,4})$/.exec(host);
  if (mapped) {
    const [hi, lo] = [parseInt(mapped[1], 16), parseInt(mapped[2], 16)];
    return privateV4([hi >> 8, hi & 255, lo >> 8, lo & 255]);
  }
  const first = parseInt(host.split(":")[0] || "0", 16);
  return host === "::" || host === "::1"
    || host.startsWith("::") // other addresses starting with zeros: IPv4-compatible and reserved
    || (first & 0xfe00) === 0xfc00 // unique local, fc00::/7
    || (first & 0xffc0) === 0xfe80 // link-local, fe80::/10
    || (first & 0xff00) === 0xff00 // multicast
    || first === 0x64 // NAT64, 64:ff9b::/96
    || first === 0x2001 && parseInt(host.split(":")[1] || "0", 16) < 0x200; // Teredo and other special 2001::/23
}
