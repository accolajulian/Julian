import type { Platform } from './types';

export type LinkPreview = {
  title?: string;
  thumbnailUrl?: string;
};

export function detectPlatform(url: string): Platform {
  const host = hostOf(url);
  if (!host) return 'other';
  if (host.endsWith('youtube.com') || host === 'youtu.be') return 'youtube';
  if (host.endsWith('tiktok.com')) return 'tiktok';
  if (host.endsWith('instagram.com')) return 'instagram';
  return 'other';
}

export const PLATFORM_LABEL: Record<Platform, string> = {
  youtube: 'YouTube',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  other: 'Link',
};

// Adds https:// if it's missing and checks it's a real web link.
export function normalizeUrl(input: string): string | null {
  let text = input.trim();
  if (!text) return null;
  if (!/^https?:\/\//i.test(text)) text = `https://${text}`;
  return hostOf(text) ? text : null;
}

// Asks the site for the video's title and thumbnail through its public oEmbed
// endpoint. Never throws: if the site says no (Instagram usually does), you
// just get back whatever we could work out, possibly nothing.
export async function fetchPreview(url: string): Promise<LinkPreview> {
  const platform = detectPlatform(url);
  const endpoint = oembedEndpoint(platform, url);

  let preview: LinkPreview = {};
  if (endpoint) {
    try {
      const data = await fetchJson(endpoint);
      preview = {
        title: typeof data.title === 'string' && data.title.trim() ? data.title.trim() : undefined,
        thumbnailUrl: typeof data.thumbnail_url === 'string' ? data.thumbnail_url : undefined,
      };
    } catch {
      // The site refused or we're offline. That's fine — save the link anyway.
    }
  }

  // YouTube thumbnails can be built from the video id even if oEmbed failed.
  if (!preview.thumbnailUrl && platform === 'youtube') {
    const id = youtubeId(url);
    if (id) preview.thumbnailUrl = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  }
  return preview;
}

function oembedEndpoint(platform: Platform, url: string): string | null {
  const encoded = encodeURIComponent(url);
  switch (platform) {
    case 'youtube':
      return `https://www.youtube.com/oembed?format=json&url=${encoded}`;
    case 'tiktok':
      return `https://www.tiktok.com/oembed?url=${encoded}`;
    case 'instagram':
      // Instagram mostly requires a developer token now, so this often fails.
      return `https://api.instagram.com/oembed/?url=${encoded}`;
    default:
      return null;
  }
}

async function fetchJson(endpoint: string): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(endpoint, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function youtubeId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/);
  return match ? match[1] : null;
}

function hostOf(url: string): string | null {
  const match = url.match(/^https?:\/\/([^/?#:]+)/i);
  if (!match || !match[1].includes('.')) return null;
  return match[1].toLowerCase().replace(/^(www\.|m\.)/, '');
}
