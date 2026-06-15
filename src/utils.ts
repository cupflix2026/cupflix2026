import { Channel } from "./types";

export function sanitizeText(str: string, maxLength = 200): string {
  if (!str) return "";
  const cleaned = str.replace(/<\/?[^>]+(>|$)/g, "").trim();
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength) : cleaned;
}

export function sanitizeUrl(url: string): string {
  if (!url) return "";
  const trimmed = url.trim();
  if (/^mora=/i.test(trimmed)) return trimmed;
  if (/^embed=/i.test(trimmed)) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return "";
}

export function buildPlayerUrl(rawUrl: string): string {
  if (!rawUrl) return "";
  const trimmed = rawUrl.trim();
  const PLAYER_BASE = "https://sports803.github.io/player/";
  if (/^mora=/i.test(trimmed)) {
    return `${PLAYER_BASE}?mora=${encodeURIComponent(trimmed.slice(5).trim())}`;
  }
  if (/^embed=/i.test(trimmed)) {
    return `${PLAYER_BASE}?embed=${encodeURIComponent(trimmed.slice(6).trim())}`;
  }
  // If it's a raw stream link (usually contains common stream file types)
  if (/\.(m3u8|mpd|ts|mp4|flv|mkv)/i.test(trimmed)) {
    return `${PLAYER_BASE}?mora=${encodeURIComponent(trimmed)}`;
  }
  // If it's any raw HTTP/HTTPS protocol url, let's proxy through player to ensure robust decoding/HLS parsing
  if (/^https?:\/\//i.test(trimmed)) {
    if (/youtube\.com|youtu\.be|vimeo\.com|twitch\.tv|facebook\.com|dailymotion\.com|ok\.ru|cloudup\.com/i.test(trimmed)) {
      return `${PLAYER_BASE}?embed=${encodeURIComponent(trimmed)}`;
    }
    return `${PLAYER_BASE}?mora=${encodeURIComponent(trimmed)}`;
  }
  return trimmed;
}

export function parseM3U(m3uContent: string): Partial<Channel>[] {
  const lines = m3uContent.split("\n");
  const channels: Partial<Channel>[] = [];
  let currentChannel: Partial<Channel> = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("#EXTINF")) {
      const nameMatch = line.match(/,(.+)$/);
      const logoMatch = line.match(/tvg-logo="([^"]+)"/i);
      const groupMatch = line.match(/group-title="([^"]+)"/i);

      currentChannel = {
        name: nameMatch ? nameMatch[1].trim() : "Unknown Stream",
        logo: logoMatch ? logoMatch[1] : "",
        category: groupMatch ? groupMatch[1].toLowerCase() : "general",
      };
    } else if (line && !line.startsWith("#") && currentChannel.name) {
      currentChannel.url = line.trim();
      channels.push({ ...currentChannel });
      currentChannel = {};
    }
  }
  return channels;
}

export async function hashPin(pin: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Simple deterministic fallback obfuscation
  return btoa(pin + ":s803").replace(/[^a-z0-9]/gi, "").slice(0, 32);
}

export function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toString();
}
