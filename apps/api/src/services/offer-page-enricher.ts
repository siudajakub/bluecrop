import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type OfferPageEnricherOptions = {
  allowedHosts?: string[];
  maxHtmlBytes?: number;
  fetcher?: typeof fetch;
  resolveHost?: typeof lookup;
};

export type OfferPageMetadata = {
  finalUrl: string;
  imageUrl: string | null;
};

export interface OfferPageEnricher {
  enrich(url: string): Promise<OfferPageMetadata>;
}

export class SafeHtmlOfferPageEnricher implements OfferPageEnricher {
  private readonly fetcher: typeof fetch;
  private readonly resolveHost: typeof lookup;
  private readonly allowedHosts: string[];
  private readonly maxHtmlBytes: number;

  constructor(options: OfferPageEnricherOptions = {}) {
    this.fetcher = options.fetcher ?? fetch;
    this.resolveHost = options.resolveHost ?? lookup;
    this.allowedHosts = (options.allowedHosts ?? []).map(normalizeHostname).filter(Boolean);
    this.maxHtmlBytes = options.maxHtmlBytes ?? 250_000;
    if (!Number.isSafeInteger(this.maxHtmlBytes) || this.maxHtmlBytes < 1) {
      throw new Error("OFFER_ENRICHMENT_MAX_HTML_BYTES must be a positive integer");
    }
  }

  async enrich(inputUrl: string): Promise<OfferPageMetadata> {
    let current = await this.validateUrl(inputUrl);
    for (let redirect = 0; redirect <= 3; redirect += 1) {
      const response = await this.fetcher(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(6_000),
        headers: {
          Accept: "text/html,application/xhtml+xml",
          Range: `bytes=0-${this.maxHtmlBytes - 1}`,
          "User-Agent": "BluecropOfferPreview/1.0 (+https://bluecrop.app)",
        },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw new Error(`Redirect ${response.status} has no Location header`);
        current = await this.validateUrl(new URL(location, current).href);
        continue;
      }
      if (!response.ok) throw new Error(`Shop returned HTTP ${response.status}`);
      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
        throw new Error(`Unsupported content type: ${contentType || "unknown"}`);
      }
      const html = await readLimitedText(response, this.maxHtmlBytes);
      return { finalUrl: current, imageUrl: extractPageImage(html, current) };
    }
    throw new Error("Too many redirects");
  }

  private async validateUrl(value: string): Promise<string> {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) {
      throw new Error("Only credential-free HTTPS URLs on the default port are allowed");
    }
    const hostname = normalizeHostname(url.hostname);
    if (this.allowedHosts.length && !this.allowedHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
      throw new Error(`Host is not allowlisted: ${hostname}`);
    }
    const addresses = await this.resolveHost(hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
      throw new Error(`Host resolves to a private or invalid address: ${hostname}`);
    }
    return url.href;
  }
}

export function extractPageImage(html: string, pageUrl: string): string | null {
  const tags = html.match(/<meta\s+[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const key = attribute(tag, "property") ?? attribute(tag, "name");
    if (!key || !["og:image", "og:image:url", "twitter:image", "twitter:image:url"].includes(key.toLowerCase())) continue;
    const content = attribute(tag, "content");
    if (!content) continue;
    const image = safePublicHttpUrl(decodeEntities(content), pageUrl);
    if (image) return image;
  }
  return null;
}

async function readLimitedText(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new Error(`Page exceeds ${maxBytes} bytes`);
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`Page exceeds ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function attribute(tag: string, name: string): string | null {
  return tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:["']([^"']+)["']|([^\\s>]+))`, "i"))?.slice(1).find(Boolean) ?? null;
}

function safePublicHttpUrl(value: string, baseUrl: string): string | null {
  try {
    const url = new URL(value, baseUrl);
    return ["http:", "https:"].includes(url.protocol) && !isPrivateHostname(url.hostname) ? url.href : null;
  } catch {
    return null;
  }
}

function decodeEntities(value: string): string {
  return value.replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#(?:x27|39);/gi, "'");
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
}

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "::1" || host.endsWith(".local") || (isIP(host) !== 0 && isPrivateAddress(host));
}

function isPrivateAddress(address: string): boolean {
  const kind = isIP(address);
  if (kind === 4) {
    const [a = 0, b = 0] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (kind === 6) {
    const normalized = address.toLowerCase();
    if (normalized.startsWith("::ffff:")) return isPrivateAddress(normalized.slice(7));
    return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd")
      || /^fe[89ab]/.test(normalized);
  }
  return true;
}
