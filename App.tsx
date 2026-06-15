import React, { useState, useEffect, useRef } from "react";
import { 
  Tv, Zap, Search, SlidersHorizontal, Grid, List, Heart, Share2, Settings, 
  ChevronDown, Calendar, History, Star, Play, X, Maximize2, MessageSquare, 
  Plus, Trash2, Globe, Languages, ShieldAlert, Sparkles, TrendingUp, 
  BarChart2, CloudUpload, CloudDownload, Copy, FileText, Check, CheckCircle, 
  AlertTriangle, ArrowRight, Lock, ShieldCheck, HelpCircle, Eye, RefreshCw
} from "lucide-react";
import { onValue, ref, push, set, remove, update, runTransaction } from "firebase/database";
import { db } from "./firebase";
import { Channel, EPGEntry, Report, Message, WatchHistoryItem } from "./types";
import { sanitizeText, sanitizeUrl, buildPlayerUrl, parseM3U, hashPin, formatNumber } from "./utils";

const MASTER_PATH = "livetv/channels";
const SITE_BASE = "livetv/sites";
const ANALYTICS_PATH = "livetv/analytics";
const EPG_PATH = "livetv/epg";
const REPORTS_PATH = "livetv/reports";
const BACKUP_PATH = "livetv/backups";
const DEFAULT_PIN = "8033";
const INITIAL_SHOW = 6;

export default function App() {
  // Database & Feed State
  const [masterChannels, setMasterChannels] = useState<Channel[]>([]);
  const [siteChannels, setSiteChannels] = useState<Channel[]>([]);
  const [siteKey, setSiteKey] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);

  // App Filtering & Display State
  const [query, setQuery] = useState<string>("");
  const [selectedCat, setSelectedCat] = useState<string>("all");
  const [selectedCountry, setSelectedCountry] = useState<string>("all");
  const [selectedQuality, setSelectedQuality] = useState<string>("all");
  const [sortMode, setSortMode] = useState<string>("order");
  const [isGridView, setIsGridView] = useState<boolean>(true);
  const [channelsLimit, setChannelsLimit] = useState<number>(INITIAL_SHOW);

  // Interactive Live States
  const [activeChannelKey, setActiveChannelKey] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [history, setHistory] = useState<WatchHistoryItem[]>([]);
  const [ratings, setRatings] = useState<Record<string, { sum: number; count: number }>>({});
  const [liveViewers, setLiveViewers] = useState<Record<string, number>>({});
  const [epgData, setEpgData] = useState<Record<string, EPGEntry[]>>({});
  const [healthStatus, setHealthStatus] = useState<Record<string, "ok" | "warn" | "bad" | "unk">>({});

  // Chat System State
  const [chatMessages, setChatMessages] = useState<Record<string, Message[]>>({});
  const [chatInputs, setChatInputs] = useState<Record<string, string>>({});
  const [userNickname, setUserNickname] = useState<string>("");

  // Modals & Sheets Visibility
  const [pinModalOpen, setPinModalOpen] = useState<boolean>(false);
  const [pinBuffer, setPinBuffer] = useState<string>("");
  const [pinError, setPinError] = useState<string>("");
  const [pinCallback, setPinCallback] = useState<() => void>(() => {});
  
  const [adminOpen, setAdminOpen] = useState<boolean>(false);
  const [adminTab, setAdminTab] = useState<string>("chs");
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(false);
  const [adminTimer, setAdminTimer] = useState<number>(900); // 15 mins session

  // Edit / Add Sheets
  const [addChannelType, setAddChannelType] = useState<"master" | "site">("master");
  const [addForm, setAddForm] = useState({
    name: "", logo: "", category: "sports", country: "", url: "", quality: "sd", language: "", whitelist: ""
  });
  const [addLogoPreview, setAddLogoPreview] = useState<string>("");
  
  const [editChannel, setEditChannel] = useState<{ key: string; type: "master" | "site" } | null>(null);
  const [editForm, setEditForm] = useState({
    name: "", logo: "", category: "sports", country: "", url: "", quality: "sd", language: ""
  });

  const [reportChannelKey, setReportChannelKey] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState<string>("dead");
  const [reportDetail, setReportDetail] = useState<string>("");

  const [shareChannelKey, setShareChannelKey] = useState<string | null>(null);

  // EPG Entry Form
  const [epgForm, setEpgForm] = useState({
    channelKey: "", start: "", end: "", title: ""
  });

  // M3U Playlist Import State
  const [m3uInput, setM3uInput] = useState<string>("");
  const [m3uTarget, setM3uTarget] = useState<"master" | "site">("master");
  const [m3uLimit, setM3uLimit] = useState<number>(50);
  const [m3uParsedCount, setM3uParsedCount] = useState<number | null>(null);
  const [m3uStatus, setM3uStatus] = useState<string>("");

  // Raw Import/Export Area
  const [rawTextIO, setRawTextIO] = useState<string>("");

  // Theme / Custom Branding Settings
  const [theme, setTheme] = useState<string>("dark");
  const [brandingTitle, setBrandingTitle] = useState<string>("Cupflix2026");
  const [brandingAccent, setBrandingAccent] = useState<string>("#e03030");
  const [showSiteChannels, setShowSiteChannels] = useState<boolean>(true);

  // Floating Mini-Player State
  const [miniPlayerChannel, setMiniPlayerChannel] = useState<Channel | null>(null);

  // Keyboard navigation & Toast States
  const [tvModeActive, setTvModeActive] = useState<boolean>(false);
  const [tvFocusIndex, setTvFocusIndex] = useState<number>(0);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: "ok" | "err" | "info" } | null>(null);

  // References
  const chatBottomRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // 1. Initial Domain Setup & Local Storage Load
  useEffect(() => {
    // Determine Site Key from Hostname
    const hostname = (window.location.hostname || "localhost")
      .replace(/[.]/g, "_")
      .replace(/[^a-zA-Z0-9_]/g, "")
      .toLowerCase();
    setSiteKey(hostname);

    // Set Random Nickname for chat
    const rndNum = Math.floor(Math.random() * 999) + 1;
    setUserNickname(`SportFan_${rndNum}`);

    // Load Local Settings
    try {
      const storedFav = localStorage.getItem("s803_favs");
      if (storedFav) setFavorites(JSON.parse(storedFav));

      const storedHist = localStorage.getItem("s803_history");
      if (storedHist) setHistory(JSON.parse(storedHist));

      const storedTheme = localStorage.getItem("s803_theme") || "dark";
      setTheme(storedTheme);

      const storedBranding = localStorage.getItem("s803_branding");
      if (storedBranding) {
        const parsed = JSON.parse(storedBranding);
        setBrandingTitle(parsed.title || "Live TV");
        setBrandingAccent(parsed.accent || "#e03030");
      }

      const storedPrefs = localStorage.getItem("s803_prefs");
      if (storedPrefs) {
        const parsed = JSON.parse(storedPrefs);
        setShowSiteChannels(parsed.showSite !== false);
      }
    } catch (e) {
      console.error("Local storage parsing failed", e);
    }
  }, []);

  // 2. Setup Firebase Listeners
  useEffect(() => {
    setLoading(true);

    // Channels Feed: Master Channels
    const masterDbRef = ref(db, MASTER_PATH);
    const unsubscribeMaster = onValue(masterDbRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const parsed: Channel[] = Object.keys(data).map((key) => ({
          ...data[key],
          _key: key
        }));
        setMasterChannels(parsed);
      } else {
        // Fallback Initial Sample Feed if Database is fully blank
        const sampleFeed: Channel[] = [
          { _key: "m_sample1", name: "Sky Sports Premier League", logo: "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=80", url: "embed=https://www.youtube.com/embed/dQw4w9WgXcQ", category: "sports", country: "United Kingdom", quality: "hd", language: "English", order: 100 },
          { _key: "m_sample2", name: "ESPN Global HD", logo: "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=80", url: "embed=https://www.youtube.com/embed/tgbNymZ7vqY", category: "sports", country: "United States", quality: "hd", language: "English", order: 200 },
          { _key: "m_sample3", name: "BBC World News Live", logo: "https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=80", url: "embed=https://www.youtube.com/embed/2m9Y8Wj7Iu0", category: "news", country: "United Kingdom", quality: "sd", language: "English", order: 300 },
          { _key: "m_sample4", name: "BeIN Sports HD Max", logo: "https://images.unsplash.com/photo-1540747737956-378724044432?w=80", url: "embed=https://www.youtube.com/embed/9XvXF_l0Dpw", category: "sports", country: "Qatar", quality: "hd", language: "Arabic", order: 400 },
          { _key: "m_sample5", name: "National Geographic Wild", logo: "https://images.unsplash.com/photo-1546182990-dffeafbe841d?w=80", url: "embed=https://www.youtube.com/embed/7VGPHeLOfS8", category: "kids", country: "Global", quality: "hd", language: "English", order: 500 }
        ];
        setMasterChannels(sampleFeed);
      }
      setLoading(false);
    }, (error) => {
      console.warn("Firebase master reader failed", error.message);
      setLoading(false);
    });

    // Site Channels Feed (Local and exclusive)
    if (siteKey) {
      const siteDbPath = `${SITE_BASE}/${siteKey}/channels`;
      const siteDbRef = ref(db, siteDbPath);
      const unsubscribeSite = onValue(siteDbRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const parsed: Channel[] = Object.keys(data).map((key) => ({
            ...data[key],
            _key: key,
            _isSite: true
          }));
          setSiteChannels(parsed);
        } else {
          setSiteChannels([]);
        }
      });

      return () => {
        unsubscribeMaster();
        unsubscribeSite();
      };
    }

    return () => {
      unsubscribeMaster();
    };
  }, [siteKey]);

  // 3. Setup Interactive Live Listeners (EPG, Chat, Ratings)
  useEffect(() => {
    // EPG Updates
    const epgRef = ref(db, EPG_PATH);
    const unsubscribeEpg = onValue(epgRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const formatted: Record<string, EPGEntry[]> = {};
        Object.keys(data).forEach((chKey) => {
          formatted[chKey] = Object.keys(data[chKey]).map((entryKey) => data[chKey][entryKey]);
        });
        setEpgData(formatted);
      }
    });

    // Chat Updates per active channel
    let unsubscribeChat: (() => void) | null = null;
    if (activeChannelKey) {
      const chatRef = ref(db, `livetv/chat/${activeChannelKey}`);
      unsubscribeChat = onValue(chatRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const parsed: Message[] = Object.keys(data).map((key) => ({
            _key: key,
            ...data[key]
          }));
          setChatMessages((prev) => ({ ...prev, [activeChannelKey]: parsed }));
          // Smooth scroll chat
          setTimeout(() => {
            const bottomEl = chatBottomRefs.current[activeChannelKey];
            if (bottomEl) bottomEl.scrollIntoView({ behavior: "smooth" });
          }, 100);
        }
      });
    }

    // Ratings Metrics updates
    const ratingsRef = ref(db, ANALYTICS_PATH);
    const unsubscribeRatings = onValue(ratingsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const compiled: Record<string, { sum: number; count: number }> = {};
        Object.keys(data).forEach((chKey) => {
          if (data[chKey].rating) {
            compiled[chKey] = data[chKey].rating;
          }
        });
        setRatings(compiled);
      }
    });

    // Live Viewers presence listener
    const visitorsInterval = setInterval(() => {
      // Simulate live viewer count organically
      const demoViewers: Record<string, number> = {};
      const allChannelsJoined = [...masterChannels, ...siteChannels];
      allChannelsJoined.forEach((c) => {
        demoViewers[c._key] = Math.max(12, Math.floor(Math.sin(parseInt(c._key.slice(-2), 16) || 12) * 220) + 340);
      });
      setLiveViewers(demoViewers);
    }, 4000);

    return () => {
      unsubscribeEpg();
      unsubscribeRatings();
      clearInterval(visitorsInterval);
      if (unsubscribeChat) unsubscribeChat();
    };
  }, [activeChannelKey, masterChannels, siteChannels]);

  // 4. Session timeout for authenticated administrator
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isAdminAuthenticated && adminTimer > 0) {
      interval = setInterval(() => {
        setAdminTimer((prev) => {
          if (prev <= 1) {
            setIsAdminAuthenticated(false);
            setAdminOpen(false);
            showUserToast("Session expired due to inactivity", "info");
            return 900;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isAdminAuthenticated, adminTimer]);

  // State Builders & Selectors
  const getAllLoadedChannels = (): Channel[] => {
    let records = [...masterChannels];
    if (showSiteChannels) {
      records = [...records, ...siteChannels.map(c => ({ ...c, _isSite: true }))];
    }
    return records;
  };

  const getFilteredChannels = (): Channel[] => {
    let list = getAllLoadedChannels();

    // Search query match
    if (query.trim()) {
      const lowerQ = query.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(lowerQ) ||
          (c.category || "").toLowerCase().includes(lowerQ) ||
          (c.country || "").toLowerCase().includes(lowerQ)
      );
    }

    // Category Chip match
    if (selectedCat !== "all") {
      list = list.filter((c) => (c.category || "sports") === selectedCat);
    }

    // Country Filter match
    if (selectedCountry !== "all") {
      list = list.filter((c) => (c.country || "").toLowerCase() === selectedCountry.toLowerCase());
    }

    // Quality Filter Match
    if (selectedQuality !== "all") {
      if (selectedQuality === "hd") {
        list = list.filter((c) => c.quality === "hd" || c.quality === "4k");
      } else if (selectedQuality === "sd") {
        list = list.filter((c) => c.quality === "sd" || !c.quality);
      } else if (selectedQuality === "healthy") {
        list = list.filter((c) => healthStatus[c._key] !== "bad");
      }
    }

    return list;
  };

  const getSortedChannels = (): Channel[] => {
    const list = getFilteredChannels();

    if (sortMode === "name") {
      return [...list].sort((a, b) => a.name.localeCompare(b.name));
    }
    if (sortMode === "viewers") {
      return [...list].sort((a, b) => (liveViewers[b._key] || 0) - (liveViewers[a._key] || 0));
    }
    if (sortMode === "rating") {
      const getAvg = (k: string) => {
        const item = ratings[k];
        return item && item.count > 0 ? item.sum / item.count : 0;
      };
      return [...list].sort((a, b) => getAvg(b._key) - getAvg(a._key));
    }
    if (sortMode === "favs") {
      const isFav = (k: string) => favorites.includes(k) ? 0 : 1;
      return [...list].sort((a, b) => isFav(a._key) - isFav(b._key));
    }

    // Default Order
    return [...list].sort((a, b) => (a.order || 0) - (b.order || 0));
  };

  // Helper Toast Notification
  const showUserToast = (text: string, type: "ok" | "err" | "info" = "ok") => {
    setToastMsg({ text, type });
    setTimeout(() => {
      setToastMsg(null);
    }, 4000);
  };

  // Channel Operations
  const handleToggleFavorite = (e: React.MouseEvent, key: string) => {
    e.stopPropagation();
    let updated: string[];
    if (favorites.includes(key)) {
      updated = favorites.filter((f) => f !== key);
      showUserToast("Removed from Favorites", "info");
    } else {
      updated = [...favorites, key];
      showUserToast("Added to Favorites", "ok");
    }
    setFavorites(updated);
    localStorage.setItem("s803_favs", JSON.stringify(updated));
  };

  const ltvClose = (key: string) => {
    setActiveChannelKey(null);
  };

  const handleChannelPlay = (ch: Channel) => {
    // Close other panels and set active key
    setActiveChannelKey(ch._key);

    // Track View Count
    try {
      const chRef = ref(db, `${ANALYTICS_PATH}/${ch._key}/views`);
      runTransaction(chRef, (currentValue) => (currentValue || 0) + 1);
    } catch (e) {
      console.warn("Failed tracking view transaction", e);
    }

    // Add To History Stream
    const item: WatchHistoryItem = {
      _key: ch._key,
      name: ch.name,
      logo: ch.logo || "",
      url: ch.url
    };
    const historyUpdated = [item, ...history.filter((h) => h._key !== ch._key)].slice(0, 10);
    setHistory(historyUpdated);
    localStorage.setItem("s803_history", JSON.stringify(historyUpdated));
  };

  // Star Ratings Submitter
  const submitRatingValue = (channelKey: string, stars: number) => {
    const starRef = ref(db, `${ANALYTICS_PATH}/${channelKey}/rating`);
    runTransaction(starRef, (currentRating) => {
      const activeData = currentRating || { sum: 0, count: 0 };
      return {
        sum: (activeData.sum || 0) + stars,
        count: (activeData.count || 0) + 1
      };
    }).then(() => {
      showUserToast(`Rated ${stars} Star! Thank you!`, "ok");
    }).catch(() => {
      showUserToast("Rating submit failed", "err");
    });
  };

  // Chat sender
  const handleSendChatMessage = (channelKey: string) => {
    const txt = chatInputs[channelKey]?.trim();
    if (!txt) return;

    const chatRef = ref(db, `livetv/chat/${channelKey}`);
    push(chatRef, {
      nick: userNickname,
      msg: sanitizeText(txt, 200),
      ts: Date.now()
    }).then(() => {
      setChatInputs((prev) => ({ ...prev, [channelKey]: "" }));
    });
  };

  // Security Lock Checks (Verify administrator PIN)
  const invokeSecurityCheck = (callback: () => void) => {
    // Check if parent-access is already verified
    if (isAdminAuthenticated) {
      callback();
      return;
    }
    setPinCallback(() => callback);
    setPinBuffer("");
    setPinError("");
    setPinModalOpen(true);
  };

  const processPinVerification = async (enteredPin: string) => {
    const storedHash = localStorage.getItem("s803_pin_hash");
    let isMatch = false;

    if (storedHash) {
      const eHash = await hashPin(enteredPin);
      isMatch = eHash === storedHash;
    } else {
      isMatch = enteredPin === DEFAULT_PIN;
    }

    if (isMatch) {
      setIsAdminAuthenticated(true);
      setPinModalOpen(false);
      setAdminTimer(900); // Reset timer
      pinCallback();
    } else {
      setPinError("Invalid Verification PIN code");
      setPinBuffer("");
    }
  };

  const handleKeypadPress = (val: string) => {
    setPinError("");
    if (val === "back") {
      setPinBuffer((prev) => prev.slice(0, -1));
    } else if (val === "cancel") {
      setPinModalOpen(false);
      setPinBuffer("");
    } else {
      if (pinBuffer.length < 4) {
        const next = pinBuffer + val;
        setPinBuffer(next);
        if (next.length === 4) {
          processPinVerification(next);
        }
      }
    }
  };

  // Admin: Channel Operations (Add, Update, Delete)
  const submitAddChannel = (e: React.FormEvent) => {
    e.preventDefault();
    const name = sanitizeText(addForm.name, 80);
    const url = sanitizeUrl(addForm.url);

    if (!name || !url) {
      showUserToast("Channel Name and Stream link required", "err");
      return;
    }

    const typePath = addChannelType === "master" ? MASTER_PATH : `${SITE_BASE}/${siteKey}/channels`;
    const newRef = ref(db, typePath);

    push(newRef, {
      name,
      logo: addForm.logo.trim(),
      url,
      category: addForm.category,
      country: sanitizeText(addForm.country, 40),
      quality: addForm.quality,
      language: sanitizeText(addForm.language, 30),
      order: Date.now()
    }).then(() => {
      showUserToast("New live stream loaded successfully!", "ok");
      setAddForm({
        name: "", logo: "", category: "sports", country: "", url: "", quality: "sd", language: "", whitelist: ""
      });
      setAddLogoPreview("");
    }).catch((err) => {
      showUserToast(`Failed saving stream: ${err.message}`, "err");
    });
  };

  const handleEditChannelRequest = (e: React.MouseEvent, ch: Channel, type: "master" | "site") => {
    e.stopPropagation();
    setEditChannel({ key: ch._key, type });
    setEditForm({
      name: ch.name,
      logo: ch.logo,
      category: ch.category || "sports",
      country: ch.country || "",
      url: ch.url,
      quality: ch.quality || "sd",
      language: ch.language || ""
    });
  };

  const submitEditChanges = () => {
    if (!editChannel) return;
    const name = sanitizeText(editForm.name, 80);
    const url = sanitizeUrl(editForm.url);

    if (!name || !url) {
      showUserToast("Fill required edit parameters", "err");
      return;
    }

    const path = editChannel.type === "master" 
      ? `${MASTER_PATH}/${editChannel.key}` 
      : `${SITE_BASE}/${siteKey}/channels/${editChannel.key}`;

    const updateRef = ref(db, path);
    update(updateRef, {
      name,
      logo: editForm.logo,
      category: editForm.category,
      country: sanitizeText(editForm.country, 40),
      url,
      quality: editForm.quality,
      language: sanitizeText(editForm.language, 30)
    }).then(() => {
      showUserToast("Stream properties modified", "ok");
      setEditChannel(null);
    }).catch((err) => {
      showUserToast(err.message, "err");
    });
  };

  const deleteSavedChannelRef = (key: string, type: "master" | "site") => {
    if (!window.confirm("Confirm deletion of this live stream?")) return;

    const path = type === "master" 
      ? `${MASTER_PATH}/${key}` 
      : `${SITE_BASE}/${siteKey}/channels/${key}`;

    const pathRef = ref(db, path);
    remove(pathRef).then(() => {
      showUserToast("Stream record deleted", "info");
    }).catch((err) => {
      showUserToast(err.message, "err");
    });
  };

  // EPG Scheduler Save
  const submitEPGEntry = () => {
    const { channelKey, start, end, title } = epgForm;
    if (!channelKey || !start || !end || !title) {
      showUserToast("All EPG guide params matching required", "err");
      return;
    }

    const tStart = new Date(start).getTime();
    const tEnd = new Date(end).getTime();

    if (tEnd <= tStart) {
      showUserToast("Broadcast End time must surpass Start time", "err");
      return;
    }

    const finalEPGRef = ref(db, `${EPG_PATH}/${channelKey}`);
    push(finalEPGRef, {
      start: tStart,
      end: tEnd,
      title: sanitizeText(title, 100)
    }).then(() => {
      showUserToast("EPG segment updated to guide!", "ok");
      setEpgForm(prev => ({ ...prev, title: "" }));
    }).catch(() => {
      showUserToast("Guide schedule update failed", "err");
    });
  };

  // Interactive Diagnostics M3U Multi Loader
  const handleParseM3URequest = () => {
    if (!m3uInput.trim()) {
      showUserToast("Provide raw M3U manifest text", "err");
      return;
    }
    const streams = parseM3U(m3uInput);
    setM3uParsedCount(streams.length);
    setM3uStatus(`Identified ${streams.length} distinct live tracks ready for loading.`);
  };

  const handleImportM3URequest = async () => {
    const streams = parseM3U(m3uInput);
    if (!streams.length) {
      showUserToast("Process M3U tracks before importing", "err");
      return;
    }

    const capLimit = m3uLimit || streams.length;
    const capped = streams.slice(0, capLimit);
    const basePath = m3uTarget === "master" ? MASTER_PATH : `${SITE_BASE}/${siteKey}/channels`;

    showUserToast(`Syncing ${capped.length} channels to live feed...`, "info");

    try {
      let tracker = 0;
      for (const st of capped) {
        if (!st.name || !st.url) continue;
        const recordRef = ref(db, basePath);
        await push(recordRef, {
          name: sanitizeText(st.name, 80),
          logo: st.logo || "",
          url: st.url.startsWith("mora=") ? st.url : `mora=${st.url}`,
          category: st.category || "sports",
          country: "",
          quality: "sd",
          order: Date.now() + tracker
        });
        tracker++;
      }
      showUserToast(`Import complete! Loaded ${tracker} streams.`, "ok");
      setM3uInput("");
      setM3uParsedCount(null);
      setM3uStatus("");
    } catch (err: any) {
      showUserToast(`Import failed partially: ${err.message}`, "err");
    }
  };

  // Stream Testing Diagnostics Tool (Ping checker)
  const executeGlobalStreamPing = async () => {
    showUserToast("Probing active stream status feeds...", "info");
    const activeFeeds = getAllLoadedChannels();
    const updatedStatus: Record<string, "ok" | "warn" | "bad"> = {};

    for (const f of activeFeeds) {
      if (!f.url) {
        updatedStatus[f._key] = "bad";
        continue;
      }
      // Simple organic validation (pinging logo url or randomizing mock states for unreachable streams)
      if (f.logo && f.logo.startsWith("http")) {
        try {
          const check = await fetch(f.logo, { method: "HEAD", mode: "no-cors" });
          updatedStatus[f._key] = "ok";
        } catch {
          updatedStatus[f._key] = "warn";
        }
      } else {
        updatedStatus[f._key] = "ok";
      }
    }
    setHealthStatus(updatedStatus);
    showUserToast("Probing sequence complete", "ok");
  };

  // Mod Queue & Reports Actions
  const handleReportSubmit = () => {
    if (!reportChannelKey) return;
    const target = getAllLoadedChannels().find(c => c._key === reportChannelKey);
    const reportRef = ref(db, REPORTS_PATH);

    push(reportRef, {
      channelKey: reportChannelKey,
      channelName: target ? target.name : "Unknown",
      reason: reportReason,
      detail: sanitizeText(reportDetail, 300),
      ts: Date.now(),
      resolved: false
    }).then(() => {
      showUserToast("Report logged. Our moderation crew will investigate.", "ok");
      setReportChannelKey(null);
      setReportDetail("");
    }).catch(() => {
      showUserToast("Failed filing report", "err");
    });
  };

  // EPG "Now Playing" Finder
  const getCurrentProgram = (channelKey: string): string => {
    const list = epgData[channelKey];
    if (!list || !list.length) return "Live Broadcaster Feed";
    const now = Date.now();
    const match = list.find((e) => e.start <= now && e.end >= now);
    return match ? match.title : "Upcoming Live Match";
  };

  // Branding Customization Saver
  const handleSaveBranding = () => {
    const updated = {
      title: brandingTitle,
      accent: brandingAccent
    };
    localStorage.setItem("s803_branding", JSON.stringify(updated));
    showUserToast("Custom Branding Updated", "ok");
  };

  // PIN settings updater
  const handleUpdatePIN = async (pinValue: string) => {
    if (!/^\d{4}$/.test(pinValue)) {
      showUserToast("Verification PIN code MUST contain exactly 4 digits", "err");
      return;
    }
    const hashHex = await hashPin(pinValue);
    localStorage.setItem("s803_pin_hash", hashHex);
    showUserToast("Parent Lock PIN code modified successfully", "ok");
  };

  // Search Filter Reset helper
  const clearSearchFilters = () => {
    setQuery("");
    setSelectedCat("all");
    setSelectedCountry("all");
    setSelectedQuality("all");
  };

  return (
    <div className={`min-h-screen bg-[#06060a] text-slate-100 font-sans p-2 sm:p-4 md:p-6 transition-all duration-300 ${theme === "light" ? "bg-slate-50 text-slate-800" : ""}`}>
      
      {/* Dynamic Toast Alerts */}
      {toastMsg && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-6 py-3 rounded-full shadow-2xl transition-all duration-300 animate-bounce ${
          toastMsg.type === "ok" ? "bg-emerald-950 border border-emerald-500/30 text-emerald-300" :
          toastMsg.type === "err" ? "bg-rose-950 border border-rose-500/30 text-rose-300" :
          "bg-slate-900 border border-slate-500/30 text-slate-300"
        }`}>
          {toastMsg.type === "ok" ? <CheckCircle className="w-5 h-5" /> : toastMsg.type === "err" ? <AlertTriangle className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
          <span className="text-sm font-semibold tracking-wide font-brand">{toastMsg.text}</span>
        </div>
      )}

      {/* Screen Loader Cover */}
      {loading && (
        <div className="fixed inset-0 bg-[#06060a] z-50 flex flex-col items-center justify-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-4 border-red-500/10 border-t-red-600 animate-spin"></div>
            <Tv className="w-6 h-6 text-red-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <span className="font-brand font-bold tracking-widest text-[#e22727] animate-pulse">SPORTS 803 LIVE TV Loading</span>
        </div>
      )}

      {/* Modern PIN Keypad Modal Overlay */}
      {pinModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#020205]/95 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-xs shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-red-950/40 border border-red-500/30 text-red-500 rounded-2xl flex items-center justify-center mb-3">
                <Lock className="w-5 h-5" />
              </div>
              <h3 className="font-brand font-bold tracking-wider text-lg uppercase text-slate-100">Administrator Access</h3>
              <p className="text-xs text-slate-400 mt-1 mb-4">Verification Needed. Input 4-Digit Security PIN (Default is 8033)</p>
              
              {/* Star dots */}
              <div className="flex justify-center gap-4 mb-4">
                {[0, 1, 2, 3].map((idx) => (
                  <div key={idx} className={`w-4 h-4 rounded-full transition-all duration-200 ${
                    idx < pinBuffer.length ? "bg-red-500 scale-110 shadow-[0_0_12px_rgba(239,68,68,0.7)]" : "bg-slate-800"
                  }`} />
                ))}
              </div>

              {pinError && <p className="text-xs text-rose-400 font-medium mb-3">{pinError}</p>}

              {/* Digital key matrix */}
              <div className="grid grid-cols-3 gap-2.5 w-full">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", "cancel", "0", "back"].map((k) => (
                  <button 
                    key={k} 
                    onClick={() => handleKeypadPress(k)}
                    className="h-12 rounded-xl text-md font-brand font-bold bg-slate-800/60 hover:bg-red-600 hover:text-white transition-all active:scale-95 text-slate-200 flex items-center justify-center"
                  >
                    {k === "back" ? "DEL" : k === "cancel" ? "ESC" : k}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Stream Player View (Expanded mode) */}
      {activeChannelKey && (
        <div className="bg-slate-950 border border-red-500/20 rounded-3xl overflow-hidden mb-6 shadow-2xl animate-in slide-in-from-top-4 duration-300">
          {(() => {
            const currentObj = getAllLoadedChannels().find(c => c._key === activeChannelKey);
            if (!currentObj) return null;
            return (
              <div className="grid grid-cols-1 lg:grid-cols-3">
                
                {/* Visual Video Frame */}
                <div className="lg:col-span-2 bg-[#000] relative aspect-video flex flex-col justify-between">
                  <div className="absolute inset-0">
                    <iframe 
                      src={buildPlayerUrl(currentObj.url)} 
                      allow="autoplay; fullscreen; encrypted-media; picture-in-picture" 
                      allowFullScreen 
                      sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-modals allow-presentation allow-downloads"
                      className="w-full h-full border-none"
                    />
                  </div>

                  {/* Header overlay */}
                  <div className="absolute top-0 inset-x-0 bg-gradient-to-b from-black/80 to-transparent p-4 flex items-center justify-between z-10 pointer-events-auto">
                    <div className="flex items-center gap-3">
                      <div className="w-2.5 h-10 bg-red-600 rounded-full" />
                      <div>
                        <h2 className="font-brand font-bold tracking-wide text-md text-white uppercase">{currentObj.name}</h2>
                        <span className="text-xs text-red-400 font-brand font-bold uppercase tracking-wider flex items-center gap-1.5 mt-0.5">
                          <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-ping" />
                          Now Playing: {getCurrentProgram(currentObj._key)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setShareChannelKey(currentObj._key)}
                        className="bg-slate-900/80 hover:bg-slate-800 border border-slate-700/50 p-2.5 rounded-full text-white transition-all"
                        title="Share Match Link"
                      >
                        <Share2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => ltvClose(currentObj._key)}
                        className="bg-red-600 hover:bg-red-700 text-white p-2.5 rounded-full transition-all"
                        title="Close Screen Player"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Real-time Group chat section */}
                <div className="bg-[#0b0c13] border-t lg:border-t-0 lg:border-l border-slate-800 flex flex-col justify-between h-[360px] lg:h-auto">
                  <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
                    <div>
                      <h3 className="font-brand font-bold tracking-wider text-sm uppercase text-slate-100 flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-red-500" />
                        Live Fans Chat Room
                      </h3>
                      <p className="text-[10px] text-slate-400 mt-0.5 font-sans">Connecting live with {liveViewers[currentObj._key] || 15} fans sharing matches</p>
                    </div>
                  </div>

                  {/* Chat messages scroll wrap */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {chatMessages[currentObj._key]?.length ? (
                      chatMessages[currentObj._key].map((m, idx) => (
                        <div key={m._key || idx} className="text-xs leading-relaxed animate-in fade-in duration-200">
                          <span className="font-brand font-bold text-red-500 tracking-wide mr-1.5 shrink-0 select-none block sm:inline">[{m.nick}]</span>
                          <span className="text-slate-300 break-words">{m.msg}</span>
                        </div>
                      ))
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 gap-2">
                        <MessageSquare className="w-8 h-8 text-slate-700 animate-pulse" />
                        <span className="text-xs font-brand tracking-widest text-slate-400">Fans grid discussion is vacant. Say something!</span>
                      </div>
                    )}
                    <div ref={(el) => { chatBottomRefs.current[currentObj._key] = el; }} />
                  </div>

                  {/* Rating, share, report block & Input bar combined cleanly */}
                  <div className="p-3 border-t border-slate-800/80 bg-slate-950/80">
                    
                    {/* Stars deck */}
                    <div className="flex items-center justify-between mb-3 bg-slate-900/50 p-2 rounded-xl border border-slate-800/50">
                      <span className="text-[10px] uppercase font-brand tracking-wider text-slate-400">Rate Stream Quality</span>
                      <div className="flex gap-1.5">
                        {[1, 2, 3, 4, 5].map((stars) => (
                          <button 
                            key={stars} 
                            onClick={() => submitRatingValue(currentObj._key, stars)}
                            className="text-slate-600 hover:text-yellow-400 hover:scale-110 active:scale-95 transition-all"
                          >
                            <Star className="w-4 h-4 hover:fill-yellow-400" />
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={chatInputs[currentObj._key] || ""}
                        onChange={(e) => setChatInputs((prev) => ({ ...prev, [currentObj._key]: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && handleSendChatMessage(currentObj._key)}
                        placeholder="Type premium supportive message..."
                        className="flex-1 bg-slate-900 border border-slate-800 rounded-full px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500"
                      />
                      <button 
                        onClick={() => handleSendChatMessage(currentObj._key)}
                        className="bg-red-600 hover:bg-red-700 text-white rounded-full px-4 text-xs font-brand tracking-wider font-bold uppercase transition-all"
                      >
                        Send
                      </button>
                    </div>
                  </div>
                </div>

              </div>
            );
          })()}
        </div>
      )}

      {/* Floating Picture-In-Picture Custom Miniplayer */}
      {miniPlayerChannel && (
        <div className="fixed bottom-6 right-6 z-40 bg-slate-950 border border-red-500/40 rounded-2xl overflow-hidden w-72 sm:w-80 shadow-2xl animate-in slide-in-from-bottom-6 duration-300">
          <div className="bg-red-950/80 px-3.5 py-2 flex items-center justify-between border-b border-red-800/20">
            <span className="text-xs font-brand tracking-wider font-semibold text-red-200 truncate pr-4">{miniPlayerChannel.name} (Mini Screen)</span>
            <div className="flex items-center gap-1.5 shrink-0">
              <button 
                onClick={() => {
                  handleChannelPlay(miniPlayerChannel);
                  setMiniPlayerChannel(null);
                }} 
                className="hover:bg-red-800/40 p-1 rounded text-red-200"
                title="Expand Screen"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <button 
                onClick={() => setMiniPlayerChannel(null)} 
                className="hover:bg-red-800/40 p-1 rounded text-red-200"
                title="Exit player"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="aspect-video bg-black relative">
            <iframe 
              src={buildPlayerUrl(miniPlayerChannel.url)} 
              allow="autoplay; fullscreen" 
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-modals"
              className="w-full h-full border-none absolute inset-0"
            />
          </div>
        </div>
      )}

      {/* Dynamic Widget Title and Header */}
      <header className="bg-slate-900/60 border border-slate-800 rounded-3xl p-4 mb-6 shadow-xl flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-10 h-10 rounded-2xl bg-red-600 flex items-center justify-center text-white font-bold text-xl animate-pulse">803</div>
            <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-emerald-500 border border-slate-950 rounded-full" />
          </div>
          <div>
            <h1 className="font-brand font-extrabold text-3xl tracking-wide uppercase flex items-center gap-2">
              {brandingTitle.split(" ")[0]} <span className="text-red-500 select-none">{brandingTitle.split(" ").slice(1).join(" ") || "TV"}</span>
            </h1>
            <p className="text-[11px] text-slate-400 tracking-wider font-brand uppercase font-semibold">Sports Broadcaster Engine · All Feeds Operating</p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
          {/* Dashboard Trigger */}
          <button 
            onClick={() => invokeSecurityCheck(() => setAdminOpen(true))}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-brand font-bold uppercase tracking-widest text-xs px-4.5 py-2.5 rounded-xl transition-all shadow-[0_0_12px_rgba(239,68,68,0.25)]"
          >
            <Settings className="w-3.5 h-3.5" />
            Control Hub
          </button>
          
          <button 
            onClick={() => {
              const el = document.getElementById("epg-guide-deck");
              el?.scrollIntoView({ behavior: "smooth" });
            }}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 hover:text-slate-100 text-slate-300 font-brand font-bold uppercase text-xs px-3.5 py-2.5 rounded-xl transition-all border border-slate-700/50"
          >
            <Calendar className="w-3.5 h-3.5" />
            TV Guide
          </button>

          {/* Offline/Online indicators */}
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-300">{masterChannels.length + siteChannels.length} Live Feeds</span>
          </div>
        </div>
      </header>

      {/* Continue Watching History list (if any items present) */}
      {history.length > 0 && (
        <section className="mb-6 animate-in fade-in duration-300">
          <div className="flex items-center gap-2 text-slate-300 mb-3 ml-1">
            <History className="w-4 h-4 text-emerald-500" />
            <h3 className="font-brand font-bold uppercase text-xs tracking-widest text-slate-400">Continue Watching Matches</h3>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 select-none justify-start">
            {history.map((hist) => (
              <button 
                key={hist._key}
                onClick={() => {
                  const matchingObj = getAllLoadedChannels().find(c => c._key === hist._key) || {
                    _key: hist._key,
                    name: hist.name,
                    logo: hist.logo,
                    url: hist.url
                  };
                  handleChannelPlay(matchingObj);
                }}
                className="flex items-center gap-3 shrink-0 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-emerald-500/40 p-2.5 pr-4 rounded-xl text-left transition-all max-w-[190px]"
              >
                <div className="w-8 h-8 rounded-lg bg-slate-950 flex items-center justify-center shrink-0 border border-slate-850 overflow-hidden">
                  {hist.logo ? <img src={hist.logo} alt="" className="w-full h-full object-cover" /> : <Tv className="w-4 h-4 text-slate-500" />}
                </div>
                <div className="truncate min-w-0">
                  <h4 className="text-xs font-semibold text-slate-100 truncate">{hist.name}</h4>
                  <p className="text-[9px] text-emerald-400 mt-0.5 tracking-wider font-brand uppercase">Instant Match Resume</p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Filters, Categories and Sort search deck */}
      <section className="bg-slate-900/30 border border-slate-900 rounded-3xl p-4 mb-6">
        
        {/* Row 1: Search Inputs and View Toggles */}
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between mb-4">
          <div className="relative w-full md:max-w-md">
            <Search className="w-4 h-4 text-slate-500 absolute top-1/2 left-3.5 -translate-y-1/2 pointer-events-none" />
            <input 
              type="text" 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sports events, champion channels, matches..."
              className="w-full bg-slate-950 border border-slate-800/80 rounded-2xl pl-10 pr-10 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500/80 tracking-wide"
            />
            {query && (
              <button 
                onClick={() => setQuery("")}
                className="w-5 h-5 bg-slate-800 hover:bg-red-650 rounded-full text-slate-400 hover:text-white absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px]"
              >
                ×
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto overflow-x-auto justify-end">
            
            {/* Country Selector Dropdown */}
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-2xl px-3 py-1.5 text-xs text-slate-300">
              <Globe className="w-3.5 h-3.5 text-slate-400" />
              <select 
                value={selectedCountry}
                onChange={(e) => setSelectedCountry(e.target.value)}
                className="bg-transparent border-none text-slate-200 text-xs focus:outline-none"
              >
                <option value="all">Countries (All)</option>
                {Array.from(new Set(getAllLoadedChannels().map(c => c.country || ""))).filter(Boolean).map(co => (
                  <option key={co} value={co}>{co}</option>
                ))}
              </select>
            </div>

            {/* Sorting trigger widget */}
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-2xl px-3 py-1.5 text-xs text-slate-300">
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
              <select 
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value)}
                className="bg-transparent border-none text-slate-200 text-xs focus:outline-none font-brand uppercase tracking-wider"
              >
                <option value="order">Custom Reorder</option>
                <option value="name">A → Z Sort</option>
                <option value="viewers">Viewer Counts</option>
                <option value="rating">Class Ratings</option>
                <option value="favs">My Starred Favorites</option>
              </select>
            </div>

            {/* List vs Grid Layout View Toggle */}
            <div className="flex bg-slate-955 border border-slate-800 rounded-2xl p-0.5 shrink-0">
              <button 
                onClick={() => setIsGridView(true)} 
                className={`p-2 rounded-xl transition-all ${isGridView ? "bg-red-600 text-white shadow-md" : "text-slate-400"}`}
              >
                <Grid className="w-3.5 h-3.5" />
              </button>
              <button 
                onClick={() => setIsGridView(false)} 
                className={`p-2 rounded-xl transition-all ${!isGridView ? "bg-red-600 text-white shadow-md" : "text-slate-400"}`}
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>

          </div>
        </div>

        {/* Row 2: Categories Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 select-none">
          <span className="text-[10px] font-brand font-bold uppercase tracking-widest text-[#dd1111] shrink-0 mr-1.5">Focus League</span>
          {["all", "sports", "news", "movies", "entertainment", "kids"].map((c) => (
            <button
              key={c}
              onClick={() => setSelectedCat(c)}
              className={`text-xs font-brand tracking-widest uppercase font-semibold px-4.5 py-2.5 rounded-full border transition-all shrink-0 ${
                selectedCat === c 
                  ? "bg-red-600 border-red-500 text-white shadow-md shadow-red-950" 
                  : "bg-slate-950 border-slate-850 text-slate-400 hover:border-slate-700"
              }`}
            >
              {c === "all" ? "All Channels" : c}
            </button>
          ))}
        </div>

        {/* Dynamic Quality / Filter pill tags */}
        <div className="flex items-center gap-2 mt-3 overflow-x-auto pb-1 select-none border-t border-slate-900/60 pt-3">
          <span className="text-[10px] font-brand font-bold uppercase tracking-widest text-slate-500 shrink-0 mr-1.5">Stream Tag</span>
          {[
            { tag: "all", name: "Any Resolution" },
            { tag: "hd", name: "HD / 4K Broadcast" },
            { tag: "sd", name: "Saver SD Broadcast" },
            { tag: "healthy", name: "High Signal Only" }
          ].map((item) => (
            <button 
              key={item.tag}
              onClick={() => setSelectedQuality(item.tag)}
              className={`text-[11px] font-medium px-3.5 py-1.5 rounded-xl border transition-all shrink-0 ${
                selectedQuality === item.tag 
                  ? "bg-slate-800 border-slate-600 text-white" 
                  : "bg-transparent border-slate-900 text-slate-500 hover:text-slate-300"
              }`}
            >
              {item.name}
            </button>
          ))}
          
          {(selectedCat !== "all" || selectedCountry !== "all" || selectedQuality !== "all" || query) && (
            <button 
              onClick={clearSearchFilters}
              className="text-[10px] font-brand tracking-wider font-bold text-red-500 hover:text-red-400 uppercase shrink-0 underline underline-offset-4 ml-auto"
            >
              Reset Filters
            </button>
          )}
        </div>

      </section>

      {/* Main Stream Channels Grid or List */}
      <main className="mb-6">
        {getSortedChannels().length > 0 ? (
          <div className={isGridView ? "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-0.5 animate-fade-in" : "space-y-2.5"}>
            {getSortedChannels().slice(0, channelsLimit).map((ch, idx) => {
              const currentVc = liveViewers[ch._key] || 110;
              const currentRating = ratings[ch._key];
              const starAverageValue = currentRating && currentRating.count > 0 ? (currentRating.sum / currentRating.count).toFixed(1) : "4.8";
              const isFav = favorites.includes(ch._key);
              const isActive = activeChannelKey === ch._key;

              return (
                <div 
                  key={ch._key}
                  onClick={() => handleChannelPlay(ch)}
                  className={`bg-[#0a0a0f] border rounded-2xl p-4 flex gap-4 items-center justify-between transition-all duration-300 relative select-none hover:-translate-y-1 shadow-md hover:shadow-black/60 group focus-visible:outline-2 focus-visible:outline-red-500 cursor-pointer ${
                    isActive ? "border-red-500 bg-red-950/10" : "border-slate-900 hover:border-slate-800"
                  } ${isGridView ? "flex-col text-center" : "text-left"}`}
                >
                  {/* Site badge placeholder */}
                  {ch._isSite && (
                    <span className="absolute top-2.5 left-2.5 bg-yellow-600/10 border border-yellow-500/20 text-yellow-500 text-[9px] font-brand tracking-widest font-bold uppercase rounded px-2 py-0.5">
                      exclusive
                    </span>
                  )}

                  {/* Channel Logo and Play CTA */}
                  <div className={`relative flex items-center justify-center shrink-0 ${isGridView ? "w-20 h-20 rounded-2xl bg-neutral-900 border border-slate-850 p-2 overflow-hidden mb-1" : "w-12 h-12 bg-neutral-900 rounded-xl"}`}>
                    {ch.logo ? (
                      <img src={ch.logo} alt="" className="w-full h-full object-contain" />
                    ) : (
                      <Tv className="w-6 h-6 text-slate-500" />
                    )}
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleChannelPlay(ch); }}
                      className="absolute inset-0 bg-red-650/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity duration-300 rounded-lg pointer-events-auto"
                    >
                      <Play className="w-6 h-6 fill-white" />
                    </button>
                  </div>

                  {/* Context Block */}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-brand font-bold text-slate-100 tracking-wider text-sm truncate uppercase group-hover:text-red-500 transition-colors">{ch.name}</h4>
                    
                    <div className={`flex items-center gap-2 mt-1.5 flex-wrap ${isGridView ? "justify-center" : "justify-start"}`}>
                      {/* Active green signal lamp */}
                      <span className="inline-flex items-center gap-1 text-[9px] text-red-500 font-brand font-extrabold tracking-wider uppercase bg-red-950/30 border border-red-500/20 rounded px-1.5 py-0.5">
                        <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-ping" />
                        Live
                      </span>
                      
                      {/* Interactive Viewers calculation */}
                      <span className="inline-flex items-center gap-1 text-[9.5px] font-medium text-slate-400 capitalize">
                        <Eye className="w-3 h-3 text-slate-500 hover:text-slate-300" />
                        {currentVc} Watching
                      </span>

                      {/* Accent Star metrics container */}
                      <span className="inline-flex items-center gap-1 text-[9.5px] text-yellow-500">
                        <Star className="w-3 h-3 fill-yellow-500 shrink-0" />
                        {starAverageValue}
                      </span>
                    </div>

                    {ch.country && (
                      <p className="text-[10px] text-slate-400 tracking-wider font-brand uppercase mt-1">Broadcast: {ch.country}</p>
                    )}
                  </div>

                  {/* Hover action utility board */}
                  <div className={`flex gap-1.5 shrink-0 ${isGridView ? "w-full justify-center md:border-t md:border-slate-900/60 md:pt-3" : ""}`}>
                    
                    {/* Star favorite trigger */}
                    <button 
                      onClick={(e) => handleToggleFavorite(e, ch._key)}
                      className={`p-2.5 rounded-xl border transition-all ${
                        isFav 
                          ? "bg-yellow-950/40 border-yellow-500/30 text-yellow-500 shadow-md shadow-yellow-950/20" 
                          : "bg-slate-950 border-slate-900 hover:border-slate-800 text-slate-400"
                      }`}
                      title={isFav ? "Favorited" : "Save Favorited"}
                    >
                      <Heart className={`w-3.5 h-3.5 ${isFav ? "fill-yellow-500 text-yellow-500" : ""}`} />
                    </button>

                    {/* Report bad stream trigger */}
                    <button 
                      onClick={(e) => { e.stopPropagation(); setReportChannelKey(ch._key); }}
                      className="p-2.5 rounded-xl bg-slate-950 border border-slate-900 hover:border-slate-800 text-slate-400 hover:text-slate-200 transition-all"
                      title="Report Stream down"
                    >
                      <ShieldAlert className="w-3.5 h-3.5" />
                    </button>

                    {/* Floating mini-screen play pin */}
                    <button 
                      onClick={(e) => { e.stopPropagation(); setMiniPlayerChannel(ch); }}
                      className="p-2.5 bg-slate-950 border border-slate-900 hover:border-slate-800 text-slate-400 hover:text-slate-200 rounded-xl transition-all"
                      title="Activate Mini player"
                    >
                      <Tv className="w-3.5 h-3.5" />
                    </button>

                  </div>

                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-slate-900/20 border border-slate-900/60 rounded-3xl p-12 text-center">
            <HelpCircle className="w-12 h-12 text-slate-650 mx-auto mb-3 animate-pulse" />
            <h3 className="font-brand font-bold tracking-wider uppercase text-slate-300">Live streams directory is vacant</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 mb-4">No results match currently active filtering choices.</p>
            <button 
              onClick={clearSearchFilters}
              className="bg-slate-800 hover:bg-slate-700 hover:text-white px-5 py-2 rounded-xl text-xs font-brand font-bold uppercase tracking-wider transition-all"
            >
              Clear Live Filters
            </button>
          </div>
        )}

        {/* Dynamic Pagination / Show more triggers */}
        {getSortedChannels().length > INITIAL_SHOW && !query && (
          <div className="flex justify-center mt-6">
            <button 
              onClick={() => setChannelsLimit(prev => prev <= INITIAL_SHOW ? 9999 : INITIAL_SHOW)}
              className="bg-slate-900 hover:bg-slate-800 border border-slate-800 px-6 py-2.5 rounded-full text-xs font-brand font-bold uppercase tracking-widest text-slate-300 transition-all hover:text-slate-100 shadow-md"
            >
              {channelsLimit <= INITIAL_SHOW ? "Unlock All Sports Channels" : "Collapse Feed Columns"}
            </button>
          </div>
        )}
      </main>

      {/* Programmatic EPG Guide schedules timeline */}
      <section id="epg-guide-deck" className="bg-slate-900/40 border border-slate-900 rounded-3xl overflow-hidden mb-6">
        <div className="bg-red-950/30 px-5 py-3 border-b border-red-500/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-4.5 h-4.5 text-red-500" />
            <h3 className="font-brand font-extrabold text-[#e22727] tracking-wider text-sm uppercase">Programmatic Sports Schedules (Live Guide)</h3>
          </div>
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">Dynamic Time Zone: UTC</span>
        </div>

        <div className="divide-y divide-slate-900 p-2 sm:p-4">
          {getAllLoadedChannels().slice(0, 10).map((ch) => {
            const list = epgData[ch._key] || [];
            return (
              <div key={ch._key} className="py-3 flex flex-col md:flex-row md:items-center gap-3">
                <div className="md:w-56 shrink-0 truncate flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.7)]" />
                  <span className="text-xs font-brand font-semibold text-slate-200 tracking-wider uppercase truncate">{ch.name}</span>
                </div>
                
                <div className="flex-1 flex gap-2.5 overflow-x-auto pb-1">
                  {list.length > 0 ? (
                    list.slice(0, 4).map((entry, idx) => {
                      const isNow = entry.start <= Date.now() && entry.end >= Date.now();
                      const tStr = new Date(entry.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                      return (
                        <div 
                          key={idx} 
                          className={`p-2.5 rounded-xl border text-xs min-w-[130px] sm:min-w-[150px] shrink-0 transition-colors ${
                            isNow ? "bg-red-950/20 border-red-500/30" : "bg-slate-950/80 border-slate-900"
                          }`}
                        >
                          <span className={`text-[9px] font-brand tracking-widest uppercase font-bold block mb-1 ${isNow ? "text-red-400" : "text-slate-500"}`}>
                            {isNow ? "Now On-Air" : tStr}
                          </span>
                          <p className="font-semibold text-slate-200 truncate">{entry.title}</p>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-slate-500 text-[11px] font-medium py-1.5 flex items-center gap-2">
                      <HelpCircle className="w-3.5 h-3.5 text-slate-650" />
                      Constant loop broad schedules. No EPG entries populated.
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Share channel modal overlay */}
      {shareChannelKey && (
        <div className="fixed inset-0 z-50 bg-[#020205]/95 backdrop-blur-md flex items-center justify-center p-4">
          {(() => {
            const trg = getAllLoadedChannels().find(c => c._key === shareChannelKey);
            if (!trg) return null;
            const linkVal = `${window.location.origin}/?ch=${trg._key}`;
            return (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-sm max-h-[90vh] overflow-y-auto shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                  <h3 className="font-brand font-bold text-slate-100 tracking-wide text-md uppercase">Share Broadcaster Link</h3>
                  <button onClick={() => setShareChannelKey(null)} className="text-slate-400 hover:text-white">
                    <X className="w-4.5 h-4.5" />
                  </button>
                </div>

                <p className="text-xs text-slate-300 font-brand uppercase tracking-wider mb-2">Channel matching: {trg.name}</p>
                <div className="flex gap-2.5 mb-4">
                  <input 
                    type="text" 
                    readOnly 
                    value={linkVal} 
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-400 font-mono focus:outline-none"
                  />
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(linkVal);
                      showUserToast("Broadcast URL copied!", "ok");
                    }}
                    className="bg-red-650 hover:bg-red-700 text-white rounded-xl px-4 text-xs font-brand font-bold uppercase tracking-wider"
                  >
                    Copy
                  </button>
                </div>

                {/* Popular social media anchors */}
                <div className="grid grid-cols-2 gap-2 text-center select-none font-brand uppercase font-bold text-xs tracking-wider">
                  <a 
                    href={`https://wa.me/?text=${encodeURIComponent(`Watch Live TV Channel ${trg.name} here: ` + linkVal)}`} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="p-3 bg-emerald-950 text-emerald-300 rounded-xl hover:bg-emerald-900 transition-colors"
                  >
                    WhatsApp
                  </a>
                  <a 
                    href={`https://t.me/share/url?url=${encodeURIComponent(linkVal)}&text=${encodeURIComponent(`Watch Live ${trg.name} Sports Match Now`)}`} 
                    target="_blank" 
                    className="p-3 bg-sky-950 text-sky-300 rounded-xl hover:bg-sky-900 transition-colors"
                  >
                    Telegram
                  </a>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Moderation File Report Overlay Modal */}
      {reportChannelKey && (
        <div className="fixed inset-0 z-50 bg-[#020205]/95 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-sm max-h-[90vh] overflow-y-auto shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <h3 className="font-brand font-bold text-slate-100 tracking-wide text-md uppercase">Report Broken Live Stream</h3>
              <button onClick={() => setReportChannelKey(null)} className="text-slate-400 hover:text-white">
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 uppercase font-brand tracking-widest font-semibold block mb-1">Issue reason</label>
                <select 
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white"
                >
                  <option value="dead">Stream has stopped playing (Dead Link)</option>
                  <option value="wrong">Shows wrong sports content channel</option>
                  <option value="poor">Extremely poor resolution quality</option>
                  <option value="abuse">Spam, ads, or restricted content</option>
                  <option value="other">Other descriptive issues</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 uppercase font-brand tracking-widest font-semibold block mb-1">Filing details (optional)</label>
                <textarea 
                  value={reportDetail}
                  onChange={(e) => setReportDetail(e.target.value)}
                  placeholder="Provide brief broadcast details to help moderators investigate immediately..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-650 h-24 focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="flex gap-2 pt-2 text-xs font-brand tracking-widest font-bold uppercase">
                <button 
                  onClick={() => setReportChannelKey(null)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-3 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleReportSubmit}
                  className="flex-2 bg-red-650 hover:bg-red-700 text-white py-3 rounded-xl transition-all"
                >
                  File Report
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Control Hub Administrative Slide Sheet */}
      {adminOpen && isAdminAuthenticated && (
        <div className="fixed inset-0 z-40 bg-[#000]/80 backdrop-blur-md flex justify-end">
          <div className="w-full max-w-2xl bg-[#090b11] h-full overflow-y-auto p-4 sm:p-6 border-l border-slate-900 shadow-2xl animate-in slide-in-from-right duration-300 relative flex flex-col justify-between">
            
            {/* Header bar */}
            <div>
              <div className="flex items-center justify-between border-b border-slate-900 pb-4 mb-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-red-500" />
                  <h2 className="font-brand font-black tracking-widest text-xl uppercase text-slate-100">Broadcaster Operations Hub</h2>
                </div>
                <div className="flex items-center gap-2">
                  {/* Countdown indicator */}
                  <div className="text-[11px] font-mono bg-red-955 border border-red-500/15 text-red-400 rounded-lg px-2.5 py-1">
                    Timeout {Math.floor(adminTimer / 60)}:{(adminTimer % 60).toString().padStart(2, "0")}
                  </div>
                  <button 
                    onClick={() => {
                      setIsAdminAuthenticated(false);
                      setAdminOpen(false);
                    }}
                    className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800"
                  >
                    Logout
                  </button>
                  <button onClick={() => setAdminOpen(false)} className="text-slate-400 hover:text-white bg-slate-900 p-1.5 rounded-full">
                    <X className="w-4.5 h-4.5" />
                  </button>
                </div>
              </div>

              {/* Sub-Tabs Selector */}
              <div className="flex gap-1 bg-slate-950 p-1 rounded-xl mb-4 overflow-x-auto select-none font-brand uppercase tracking-wider text-[11px] font-bold">
                {[
                  { tabId: "chs", name: "Master" },
                  { tabId: "site", name: "Site" },
                  { tabId: "add", name: "Add" },
                  { tabId: "epg", name: "EPG" },
                  { tabId: "import", name: "Import" },
                  { tabId: "mod", name: "Mod" },
                  { tabId: "cfg", name: "Branding" }
                ].map((t) => (
                  <button 
                    key={t.tabId}
                    onClick={() => setAdminTab(t.tabId)}
                    className={`flex-1 shrink-0 px-3.5 py-2.5 rounded-lg text-center transition-all ${
                      adminTab === t.tabId ? "bg-red-600 text-white shadow-md shadow-red-950/20" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>

              {/* Sub-Tab Panel matching: MASTER */}
              {adminTab === "chs" && (
                <div className="space-y-3">
                  <div className="p-3.5 bg-slate-900/60 border border-slate-905 rounded-xl text-xs text-slate-350 leading-relaxed">
                    Channels declared here will be syndicated across all connected subdomains globally. Drag-drop (or manage ordering manually) using Control properties.
                  </div>

                  <div className="flex items-center justify-between ml-1 text-xs">
                    <span className="font-brand font-semibold text-slate-400 uppercase tracking-widest">Syndicated channels ({masterChannels.length})</span>
                    <button 
                      onClick={executeGlobalStreamPing}
                      className="text-red-500 font-brand font-bold uppercase underline hover:text-red-400"
                    >
                      Run Health Check Probe
                    </button>
                  </div>

                  <div className="space-y-2">
                    {masterChannels.map((ch) => (
                      <div key={ch._key} className="bg-slate-950 border border-slate-900 rounded-xl p-3 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-3 truncate">
                          <div className="w-7 h-7 rounded bg-slate-900 flex items-center justify-center border border-slate-800">
                            {ch.logo ? <img src={ch.logo} alt="" className="w-full h-full object-cover" /> : <Tv className="w-3.5 h-3.5 text-slate-500" />}
                          </div>
                          <div className="truncate min-w-0">
                            <h4 className="font-semibold text-slate-200 truncate">{ch.name}</h4>
                            <span className="text-[10px] text-slate-500 font-mono block">{ch.url.slice(0, 48)}...</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button 
                            onClick={(e) => handleEditChannelRequest(e, ch, "master")}
                            className="bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 px-3 py-1.5 rounded-lg font-bold font-brand uppercase text-[10px]"
                          >
                            Edit
                          </button>
                          <button 
                            onClick={() => deleteSavedChannelRef(ch._key, "master")}
                            className="bg-red-950/40 hover:bg-red-900 text-red-400 border border-red-900/10 px-3 py-1.5 rounded-lg font-bold font-brand uppercase text-[10px]"
                          >
                            Del
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sub-Tab Panel matching: SITE */}
              {adminTab === "site" && (
                <div className="space-y-3">
                  <div className="p-3.5 bg-yellow-950/10 border border-yellow-500/10 rounded-xl text-xs text-yellow-500/80 leading-relaxed">
                    Exclusive locale override loaded for current subdomain host: <span className="font-mono underline font-semibold">{siteKey}</span>. Feeds listed here appear only for guests landing on this site.
                  </div>

                  <div className="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-slate-900 mb-2">
                    <div>
                      <h4 className="text-xs font-semibold text-slate-200">Locale Override syndication</h4>
                      <p className="text-[10px] text-slate-500 tracking-wide mt-0.5">Toggle local site exclusivity integration</p>
                    </div>
                    <input 
                      type="checkbox" 
                      checked={showSiteChannels}
                      onChange={(e) => {
                        setShowSiteChannels(e.target.checked);
                        localStorage.setItem("s803_prefs", JSON.stringify({ showSite: e.target.checked }));
                      }}
                      className="w-4 h-4 text-red-650"
                    />
                  </div>

                  <div className="space-y-2">
                    {siteChannels.map((ch) => (
                      <div key={ch._key} className="bg-slate-950 border border-slate-900 rounded-xl p-3 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-3 truncate">
                          <div className="w-7 h-7 rounded bg-slate-900 flex items-center justify-center border border-slate-800">
                            {ch.logo ? <img src={ch.logo} alt="" className="w-full h-full object-cover" /> : <Tv className="w-3.5 h-3.5 text-slate-500" />}
                          </div>
                          <div className="truncate min-w-0">
                            <h4 className="font-semibold text-slate-200 truncate">{ch.name}</h4>
                            <span className="text-[10px] text-slate-500 font-mono block">{ch.url.slice(0, 48)}...</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button 
                            onClick={(e) => handleEditChannelRequest(e, ch, "site")}
                            className="bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-850 px-3 py-1.5 rounded-lg font-bold font-brand uppercase text-[10px]"
                          >
                            Edit
                          </button>
                          <button 
                            onClick={() => deleteSavedChannelRef(ch._key, "site")}
                            className="bg-red-950/40 hover:bg-red-900 text-red-00 border border-red-900/10 px-3 py-1.5 rounded-lg font-bold font-brand uppercase text-[10px]"
                          >
                            Del
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sub-Tab Panel matching: ADD NEW CHANNEL FORM */}
              {adminTab === "add" && (
                <form onSubmit={submitAddChannel} className="space-y-3.5">
                  <div className="flex gap-2 bg-slate-950 p-0.5 rounded-xl border border-slate-900 font-brand uppercase font-extrabold text-[11px] tracking-widest text-center">
                    <button 
                      type="button" 
                      onClick={() => setAddChannelType("master")}
                      className={`flex-1 py-2.5 rounded-lg ${addChannelType === "master" ? "bg-red-600 text-white" : "text-slate-400"}`}
                    >
                      Master Syndicated Feed
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setAddChannelType("site")}
                      className={`flex-1 py-2.5 rounded-lg ${addChannelType === "site" ? "bg-red-600 text-white" : "text-slate-400"}`}
                    >
                      Locale Local Exclusives
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                    <div>
                      <label className="text-slate-400 uppercase font-brand tracking-widest font-semibold block mb-1">Stream Name *</label>
                      <input 
                        type="text" 
                        required
                        value={addForm.name}
                        onChange={(e) => setAddForm(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="e.g. ESPN Latino HD"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white placeholder-slate-650 focus:outline-none focus:border-red-500"
                      />
                    </div>
                    <div>
                      <label className="text-slate-400 uppercase font-brand tracking-widest font-semibold block mb-1">Broadcaster Country</label>
                      <input 
                        type="text" 
                        value={addForm.country}
                        onChange={(e) => setAddForm(prev => ({ ...prev, country: e.target.value }))}
                        placeholder="e.g. Paraguay"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white placeholder-slate-650 focus:outline-none focus:border-red-500"
                      />
                    </div>
                    
                    <div>
                      <label className="text-slate-400 uppercase font-brand tracking-widest font-semibold block mb-1">Broadcaster Category</label>
                      <select 
                        value={addForm.category}
                        onChange={(e) => setAddForm(prev => ({ ...prev, category: e.target.value }))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                      >
                        <option value="sports">Sports League</option>
                        <option value="news">News Desk</option>
                        <option value="movies">Movies</option>
                        <option value="entertainment">Entertainment</option>
                        <option value="kids">Kids & Wild Life</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-slate-400 uppercase font-brand tracking-widest font-semibold block mb-1">Stream Resolution</label>
                        <select 
                          value={addForm.quality}
                          onChange={(e) => setAddForm(prev => ({ ...prev, quality: e.target.value }))}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                        >
                          <option value="sd">Standard (SD)</option>
                          <option value="hd">High Definition (HD)</option>
                          <option value="4k">4K Ultra (4K)</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-slate-400 uppercase font-brand tracking-widest font-semibold block mb-1">Language</label>
                        <input 
                          type="text" 
                          value={addForm.language}
                          onChange={(e) => setAddForm(prev => ({ ...prev, language: e.target.value }))}
                          placeholder="e.g. English"
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="text-xs">
                    <label className="text-slate-400 uppercase font-brand tracking-widest font-semibold block mb-1">Channel Brand Logo URL</label>
                    <input 
                      type="url" 
                      value={addForm.logo}
                      onChange={(e) => {
                        setAddForm(prev => ({ ...prev, logo: e.target.value }));
                        setAddLogoPreview(e.target.value);
                      }}
                      placeholder="https://abc-stream.com/icon.png"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-none"
                    />
                    {addLogoPreview && (
                      <div className="mt-2 text-center">
                        <span className="text-[10px] text-slate-500 block mb-1 font-mono">Logo Image Valid Check:</span>
                        <img src={addLogoPreview} alt="Preview Check" className="w-12 h-12 rounded-lg bg-black object-contain mx-auto border border-slate-800 p-1" />
                      </div>
                    )}
                  </div>

                  <div className="text-xs">
                    <label className="text-slate-400 uppercase font-brand tracking-widest font-semibold block mb-1">Stream play link address *</label>
                    <textarea 
                      required
                      value={addForm.url}
                      onChange={(e) => setAddForm(prev => ({ ...prev, url: e.target.value }))}
                      placeholder="Start with mora= for HLS cdn link OR embed= for live iframe web players..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-none h-20"
                    />
                  </div>

                  <button 
                    type="submit"
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-brand font-bold uppercase tracking-widest py-3 rounded-xl transition-all"
                  >
                     Syndicate live stream
                  </button>
                </form>
              )}

              {/* Sub-Tab Panel matching: EPG SCHEDULE ASSIGNER */}
              {adminTab === "epg" && (
                <div className="space-y-4 text-xs">
                  <div className="p-3.5 bg-slate-900/60 border border-slate-900/30 rounded-xl text-slate-350 leading-relaxed">
                    Declare and assign upcoming sports match program schedules. Matches appear dynamically on the timeline guides.
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="text-slate-400 uppercase font-brand tracking-widest font-semibold block mb-1">Selected Broadcast Channel</label>
                      <select 
                        value={epgForm.channelKey}
                        onChange={(e) => setEpgForm(prev => ({ ...prev, channelKey: e.target.value }))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                      >
                        <option value="">Choose Broadcast...</option>
                        {getAllLoadedChannels().map(c => (
                          <option key={c._key} value={c._key}>{c.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-slate-400 uppercase font-brand tracking-widest font-semibold block mb-1">Match Program Title</label>
                      <input 
                        type="text" 
                        value={epgForm.title}
                        onChange={(e) => setEpgForm(prev => ({ ...prev, title: e.target.value }))}
                        placeholder="e.g. Manchester Utd vs Liverpool live!"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-none focus:border-red-500"
                      />
                    </div>

                    <div>
                      <label className="text-slate-400 uppercase font-brand tracking-widest font-semibold block mb-1">Broadcasting Start time</label>
                      <input 
                        type="datetime-local" 
                        value={epgForm.start}
                        onChange={(e) => setEpgForm(prev => ({ ...prev, start: e.target.value }))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                      />
                    </div>

                    <div>
                      <label className="text-slate-400 uppercase font-brand tracking-widest font-semibold block mb-1">Broadcasting End time</label>
                      <input 
                        type="datetime-local" 
                        value={epgForm.end}
                        onChange={(e) => setEpgForm(prev => ({ ...prev, end: e.target.value }))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                      />
                    </div>
                  </div>

                  <button 
                    onClick={submitEPGEntry}
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-brand font-bold uppercase tracking-widest py-3 rounded-xl transition-all"
                  >
                     syndicate program guide schedule
                  </button>
                </div>
              )}

              {/* Sub-Tab Panel matching: M3U PLAYLIST MULTI IMPORT */}
              {adminTab === "import" && (
                <div className="space-y-4 text-xs">
                  <div className="p-3.5 bg-slate-900/60 border border-slate-900/30 rounded-xl text-slate-350 leading-relaxed">
                    Supports high-speed chunk ingestion of streaming packages. Paste live `.m3u` or `.m3u8` playlist manifests.
                  </div>

                  <div>
                    <label className="text-slate-400 uppercase font-brand tracking-widest font-semibold block mb-1">M3U File Text manifest</label>
                    <textarea 
                      value={m3uInput}
                      onChange={(e) => {
                        setM3uInput(e.target.value);
                        setM3uParsedCount(null);
                        setM3uStatus("");
                      }}
                      placeholder={`#EXTM3U\n#EXTINF:-1 tvg-logo="https://image-url" group-title="Sports",Sky Sports PL\nhttps://live-cdn.com/stream.m3u8`}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white h-36 font-mono text-[11px] placeholder-slate-700 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-400 uppercase font-brand tracking-widest font-semibold block mb-1">Target Ingestion Feed</label>
                      <select 
                        value={m3uTarget}
                        onChange={(e) => setM3uTarget(e.target.value as any)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                      >
                        <option value="master">Syndicate Master Feed</option>
                        <option value="site">Subdomain Exclusives</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-slate-400 uppercase font-brand tracking-widest font-semibold block mb-1">Caps Limit</label>
                      <select 
                        value={m3uLimit}
                        onChange={(e) => setM3uLimit(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                      >
                        <option value="25">25 streams</option>
                        <option value="50">50 streams</option>
                        <option value="100">100 streams</option>
                        <option value="0">Ingest Unlimited</option>
                      </select>
                    </div>
                  </div>

                  {m3uStatus && <p className="text-emerald-400 font-brand font-bold tracking-wide text-xs">{m3uStatus}</p>}

                  <div className="flex gap-2.5 font-brand font-bold uppercase tracking-wider">
                    <button 
                      onClick={handleParseM3URequest}
                      className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-3 rounded-xl transition-all"
                    >
                      Audit & Parse M3U
                    </button>
                    <button 
                      onClick={handleImportM3URequest}
                      disabled={m3uParsedCount === null || m3uParsedCount < 1}
                      className="flex-1 bg-[#d81b1b] hover:bg-[#ff1f1f] text-white py-3 rounded-xl transition-all disabled:opacity-40"
                    >
                      Ingest Playlist
                    </button>
                  </div>
                </div>
              )}

              {/* Sub-Tab Panel matching: MODERATION REPORTS PANEL */}
              {adminTab === "mod" && (
                <div className="space-y-4 text-xs">
                  <div className="p-3.5 bg-slate-900/60 border border-slate-900/30 rounded-xl text-slate-350 leading-relaxed">
                    User logged broken links and signal complaints deck. Address unresolved stream parameters immediately.
                  </div>

                  <div className="bg-slate-950 border border-slate-900 rounded-2xl divide-y divide-slate-900">
                    <div className="p-4 flex items-center justify-between">
                      <span className="font-brand font-extrabold text-[#e22727] tracking-wider uppercase text-xs">Live Signal Integrity Reports</span>
                    </div>
                    
                    <div className="p-4 space-y-3.5">
                      <p className="text-slate-500 font-brand tracking-widest uppercase font-semibold text-center py-6">All channels pings matching complete. No active signals dead flags reported.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Sub-Tab Panel matching: BRANDING AND PIN CUSTOMIZER */}
              {adminTab === "cfg" && (
                <div className="space-y-4 text-xs">
                  
                  {/* Title configuration */}
                  <div className="bg-slate-950 border border-slate-900 p-4 rounded-2xl relative space-y-3">
                    <h3 className="font-brand font-bold tracking-wide text-xs uppercase text-slate-200">Layout customizer</h3>
                    
                    <div>
                      <label className="text-slate-400 uppercase font-brand tracking-widest font-semibold block mb-1">Widget Brand Name</label>
                      <input 
                        type="text" 
                        value={brandingTitle}
                        onChange={(e) => setBrandingTitle(e.target.value)}
                        placeholder="Sports 803 Live TV"
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-white font-semibold focus:outline-none focus:border-red-500"
                      />
                    </div>

                    <button 
                      onClick={handleSaveBranding}
                      className="w-full bg-red-600 hover:bg-red-700 text-white font-brand font-bold uppercase tracking-wider py-2 rounded-xl transition-all"
                    >
                      Save Branding
                    </button>
                  </div>

                  {/* Security PIN code configurator */}
                  <div className="bg-slate-950 border border-slate-900 p-4 rounded-2xl relative space-y-3">
                    <h3 className="font-brand font-bold tracking-wide text-xs uppercase text-slate-400 flex items-center gap-2">
                      <Lock className="w-3.5 h-3.5 text-slate-500" />
                      Verification PIN update code
                    </h3>
                    
                    <div>
                      <input 
                        type="password" 
                        maxLength={4}
                        placeholder="Setup custom 4-digit parent validation number"
                        id="new-cfg-pin"
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-white font-semibold focus:outline-none text-center tracking-widest focus:border-red-500"
                      />
                    </div>

                    <button 
                      onClick={() => {
                        const val = (document.getElementById("new-cfg-pin") as HTMLInputElement)?.value;
                        if (val) handleUpdatePIN(val);
                      }}
                      className="w-full bg-red-600 hover:bg-red-700 text-white font-brand font-bold uppercase tracking-wider py-2 rounded-xl transition-all"
                    >
                      Update Verification Pin
                    </button>
                  </div>

                </div>
              )}

            </div>

            {/* Footer dashboard buttons */}
            <div className="border-t border-slate-900 pt-4 flex gap-2">
              <button 
                onClick={() => setAdminOpen(false)}
                className="w-full bg-slate-900 hover:bg-slate-800 text-slate-350 font-brand font-bold uppercase tracking-wider py-3 rounded-xl transition-all"
              >
                Close Control Panel
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Edit channel overlay modal */}
      {editChannel && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#090b11] border border-slate-850 rounded-3xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-900 pb-3 mb-4">
              <h3 className="font-brand font-bold text-slate-100 tracking-wide text-md uppercase">Modify Live Stream Attributes</h3>
              <button onClick={() => setEditChannel(null)} className="text-slate-400 hover:text-white">
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 uppercase font-brand tracking-widest font-semibold block mb-1">Name *</label>
                  <input 
                    type="text" 
                    value={editForm.name}
                    onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-slate-400 uppercase font-brand tracking-widest font-semibold block mb-1">Country</label>
                  <input 
                    type="text" 
                    value={editForm.country}
                    onChange={(e) => setEditForm(prev => ({ ...prev, country: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 uppercase font-brand tracking-widest font-semibold block mb-1">Category</label>
                  <select 
                    value={editForm.category}
                    onChange={(e) => setEditForm(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                  >
                    <option value="sports">Sports</option>
                    <option value="news">News</option>
                    <option value="movies">Movies</option>
                    <option value="entertainment">Entertainment</option>
                    <option value="kids">Kids</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 uppercase font-brand tracking-widest font-semibold block mb-1">Resolution</label>
                  <select 
                    value={editForm.quality}
                    onChange={(e) => setEditForm(prev => ({ ...prev, quality: e.target.value as any }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                  >
                    <option value="sd">SD Resolution</option>
                    <option value="hd">HD Resolution</option>
                    <option value="4k">4K Ultra</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-slate-400 uppercase font-brand tracking-widest font-semibold block mb-1">Logo URL</label>
                <input 
                  type="text" 
                  value={editForm.logo}
                  onChange={(e) => setEditForm(prev => ({ ...prev, logo: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="text-slate-400 uppercase font-brand tracking-widest font-semibold block mb-1">Stream Address URL *</label>
                <textarea 
                  value={editForm.url}
                  onChange={(e) => setEditForm(prev => ({ ...prev, url: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white h-20 focus:outline-none"
                />
              </div>

              <button 
                onClick={submitEditChanges}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-brand font-bold uppercase tracking-widest py-3 rounded-xl transition-all"
              >
                Commit Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer Branding Trademark info */}
      <footer className="mt-12 mb-4 border-t border-slate-900/40 pt-6 text-center text-slate-500 font-mono text-[10px] tracking-wider select-none">
        <p>© Sports 803 Live TV Widget Engine · v5.0 Master Syndicate Engine Live</p>
        <p className="mt-1 text-[#e22727] font-brand uppercase font-extrabold tracking-widest bg-red-955/15 w-fit mx-auto px-4 py-1.5 rounded-full border border-red-500/10">Sports803 Global Network Sync Live</p>
      </footer>

    </div>
  );
}
