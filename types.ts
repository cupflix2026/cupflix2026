export interface Channel {
  _key: string;
  name: string;
  logo: string;
  url: string;
  category?: string;
  country?: string;
  quality?: 'sd' | 'hd' | '4k';
  language?: string;
  order?: number;
  siteKey?: string;
  _isSite?: boolean;
}

export interface EPGEntry {
  start: number;
  end: number;
  title: string;
}

export interface Report {
  _key?: string;
  channelKey: string;
  channelName: string;
  reason: string;
  detail?: string;
  ts: number;
  resolved: boolean;
}

export interface Message {
  _key?: string;
  nick: string;
  msg: string;
  ts: number;
}

export interface WatchHistoryItem {
  _key: string;
  name: string;
  logo: string;
  url: string;
}

export interface SitePrefs {
  showSite: boolean;
}

export interface DatabaseBranding {
  title: string;
  accent: string;
}
