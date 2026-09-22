"use strict";

/* =========================================================================
   Auralis Music — player client
   Rebuilt for simplicity and smoothness. Keeps the proven external data
   contract (iTunes search/lookup, iTunes RSS charts, LRCLIB lyrics,
   YouTube IFrame API, demo auth + localStorage).
   ========================================================================= */

/* ----------------------------- Config ----------------------------- */
const GOOGLE_CLIENT_ID = "";
const YOUTUBE_API_KEY = "AIzaSyCXNkqREBNn0AOSmJdJ6-2bOxEkTzKvJ44";
const API_PROXY_URL = "https://music-streaming-site-applemarketingtools.exeinn-info.workers.dev";
const ITUNES_SEARCH_URL = "https://itunes.apple.com/search";
const ITUNES_LOOKUP_URL = "https://itunes.apple.com/lookup";
const ITUNES_CHART_FEED_URL = "https://itunes.apple.com/us/rss";
const LRCLIB_GET_URL = "https://lrclib.net/api/get";
const LRCLIB_SEARCH_URL = "https://lrclib.net/api/search";
const WIKIPEDIA_API_URL = "https://en.wikipedia.org/w/api.php";
const YOUTUBE_EMBED_HOST = "https://www.youtube-nocookie.com";
const SEARCH_DEBOUNCE_MS = 450;
const HOME_FEED_LIMIT = 30;
const RECENTLY_PLAYED_KEY = "auralis-recently-played";
const RECENTLY_PLAYED_LIMIT = 20;
const LAST_PLAYED_KEY = "auralis-last-played";
const VOLUME_KEY = "auralis-volume";

const DIRECT_API_ENDPOINTS = {
  itunes: { search: ITUNES_SEARCH_URL, lookup: ITUNES_LOOKUP_URL },
  lrclib: { get: LRCLIB_GET_URL, search: LRCLIB_SEARCH_URL },
};

const state = {
  activeTrack: null,
  isPlaying: false,
  isSeeking: false,
  isMuted: false,
  queue: [],
  liked: new Set(readArray("auralis-liked").filter((id) => typeof id === "string")),
  savedTracks: readObject("auralis-saved-tracks"),
  customPlaylists: readObject("auralis-playlists"),
  user: readUser(),
  theme: localStorage.getItem("auralis-theme") || "dark",
  view: "home",
  homeResults: [],
  searchResults: [],
  searchAlbums: [],
  searchArtists: [],
  currentAlbum: null,
  currentArtist: null,
  activeContextTracks: [],
  recentlyPlayed: readArray(RECENTLY_PLAYED_KEY),
  homeShuffled: false,
  lyrics: { trackId: "", status: "Choose a song", lines: [], plain: "", activeIndex: -1, expanded: false },
};

const els = {
  root: document.documentElement,
  greeting: document.querySelector("#greeting"),
  heroSub: document.querySelector("#heroSub"),
  homeBody: document.querySelector("#homeBody"),
  librarySummary: document.querySelector("#librarySummary"),
  searchInput: document.querySelector("#searchInput"),
  clearSearch: document.querySelector("#clearSearch"),
  searchResults: document.querySelector("#searchResults"),
  searchTitle: document.querySelector("#searchTitle"),
  searchCount: document.querySelector("#searchCount"),
  albumDetail: document.querySelector("#albumDetail"),
  artistDetail: document.querySelector("#artistDetail"),
  likedList: document.querySelector("#likedList"),
  likedCount: document.querySelector("#likedCount"),
  playlistGrid: document.querySelector("#playlistGrid"),
  shuffleAll: document.querySelector("#shuffleAll"),
  toastContainer: document.querySelector("#toastContainer"),
  playerTrack: document.querySelector("#playerTrack"),
  playerArt: document.querySelector("#playerArt"),
  playerTitle: document.querySelector("#playerTitle"),
  playerArtist: document.querySelector("#playerArtist"),
  playButton: document.querySelector("#playButton"),
  prevButton: document.querySelector("#prevButton"),
  nextButton: document.querySelector("#nextButton"),
  seekBar: document.querySelector("#seekBar"),
  currentTime: document.querySelector("#currentTime"),
  duration: document.querySelector("#duration"),
  volumeSlider: document.querySelector("#volumeSlider"),
  volumeIcon: document.querySelector("#volumeIcon"),
  queueToggle: document.querySelector("#queueToggle"),
  queuePanel: document.querySelector("#queuePanel"),
  closeQueue: document.querySelector("#closeQueue"),
  clearQueue: document.querySelector("#clearQueue"),
  queueList: document.querySelector("#queueList"),
  npOverlay: document.querySelector("#npOverlay"),
  npClose: document.querySelector("#npClose"),
  npArt: document.querySelector("#npArt"),
  npTitle: document.querySelector("#npTitle"),
  npArtist: document.querySelector("#npArtist"),
  npSeekBar: document.querySelector("#npSeekBar"),
  npCurrent: document.querySelector("#npCurrent"),
  npTotal: document.querySelector("#npTotal"),
  npPlay: document.querySelector("#npPlay"),
  npMute: document.querySelector("#npMute"),
  npPrev: document.querySelector("#npPrev"),
  npNext: document.querySelector("#npNext"),
  npVideo: document.querySelector("#npVideo"),
  npLyrics: document.querySelector("#npLyrics"),
  lyricsPanel: document.querySelector(".lyrics-panel"),
  lyricsClose: document.querySelector("#lyricsClose"),
  lyricsList: document.querySelector("#lyricsList"),
  authButton: document.querySelector("#authButton"),
  authDialog: document.querySelector("#authDialog"),
  demoSignIn: document.querySelector("#demoSignIn"),
  authLabel: document.querySelector("#authLabel"),
  avatar: document.querySelector("#avatar"),
  googleButton: document.querySelector("#googleButton"),
  themeToggle: document.querySelector("#themeToggle"),
  youtubePlayer: document.querySelector("#youtubePlayer"),
};

let player;
let progressTimer;
let searchTimer;
let searchRequestId = 0;
let lyricsRequestId = 0;
let youtubeApiLoading = false;
let pendingYouTubeRequest = null;

/* ----------------------------- Storage ----------------------------- */
function readArray(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readObject(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function readUser() {
  try {
    const parsed = JSON.parse(localStorage.getItem("auralis-user"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function saveUserData() {
  localStorage.setItem("auralis-liked", JSON.stringify([...state.liked]));
  localStorage.setItem("auralis-saved-tracks", JSON.stringify(state.savedTracks));
  localStorage.setItem("auralis-user", JSON.stringify(state.user));
  localStorage.setItem("auralis-theme", state.theme);
  localStorage.setItem("auralis-playlists", JSON.stringify(state.customPlaylists));
}

/* ----------------------------- Helpers ----------------------------- */
function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function icon(name) {
  return `<span class="material-symbols-outlined" aria-hidden="true">${escapeHtml(name)}</span>`;
}

function formatTime(value) {
  if (!Number.isFinite(value) || value <= 0) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function normalizedText(value = "") {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slugify(value = "") {
  return normalizedText(value).replace(/\s+/g, "-");
}

function releaseYear(value) {
  if (!value) return "";
  const year = new Date(value).getFullYear();
  return Number.isFinite(year) ? String(year) : "";
}

function dedupeBy(items, getKey) {
  const seen = new Set();
  return items.filter((item) => {
    const key = getKey(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeArtwork(url) {
  if (!url) return "";
  return url
    .replace(/\{w\}/g, "600")
    .replace(/\{h\}/g, "600")
    .replace(/\/\d+x\d+bb\.(jpg|png|webp)(?:$|\?)/, "/600x600bb.$1")
    .replace("100x100bb", "600x600bb")
    .replace("200x200bb", "600x600bb");
}

function artwork600(url) {
  return url?.replace("100x100bb", "600x600bb");
}

function placeholderCover(title = "Music", artist = "Artist") {
  const initials = `${title[0] || "M"}${artist[0] || "A"}`.toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#22d3ee"/><stop offset="1" stop-color="#818cf8"/></linearGradient></defs><rect width="600" height="600" fill="#161c26"/><circle cx="300" cy="300" r="190" fill="url(#g)" opacity=".34"/><text x="300" y="340" text-anchor="middle" font-family="Arial, sans-serif" font-size="200" font-weight="800" fill="#e6edf3">${initials}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function trackImage(track, quality = "hqdefault") {
  return (
    track.artwork ||
    track.thumbnail ||
    thumbnail(track.youtubeId || track.id, quality) ||
    placeholderCover(track.title, track.artist)
  );
}

function thumbnail(videoId, quality = "hqdefault") {
  return videoId ? `https://i.ytimg.com/vi/${videoId}/${quality}.jpg` : "";
}

/* ----------------------------- Toasts ----------------------------- */
function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `${icon(type === "success" ? "check_circle" : type === "error" ? "error" : "info")}<span>${escapeHtml(message)}</span>`;
  els.toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

/* =========================================================================
   Data fetching (iTunes via proxy/JSONP, iTunes RSS charts, LRCLIB)
   ========================================================================= */
function proxiedApiUrl(service, endpoint, params) {
  const query = params?.toString?.() || "";
  if (!API_PROXY_URL) return directApiUrl(service, endpoint, params);
  return `${API_PROXY_URL.replace(/\/+$/, "")}/${service}/${endpoint}${query ? `?${query}` : ""}`;
}

function directApiUrl(service, endpoint, params) {
  const base = DIRECT_API_ENDPOINTS[service]?.[endpoint] || "";
  const query = params?.toString?.() || "";
  return `${base}${query ? `?${query}` : ""}`;
}

function fetchJsonp(url, params, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const callbackName = `auralisJsonp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const query = new URLSearchParams(params);
    query.set("callback", callbackName);
    const script = document.createElement("script");
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("iTunes JSONP timed out."));
    }, timeoutMs);
    function cleanup() {
      clearTimeout(timer);
      script.remove();
      delete window[callbackName];
    }
    window[callbackName] = (data) => {
      cleanup();
      resolve(data);
    };
    script.onerror = () => {
      cleanup();
      reject(new Error("iTunes JSONP failed."));
    };
    script.src = `${url}?${query}`;
    document.head.appendChild(script);
  });
}

async function fetchItunesJson(endpoint, params) {
  const attempts = [];
  if (API_PROXY_URL) {
    attempts.push(async () => {
      const response = await fetch(proxiedApiUrl("itunes", endpoint, params));
      if (!response.ok) throw new Error(response.status === 429 ? "iTunes is rate limited." : `iTunes ${endpoint} failed.`);
      return response.json();
    });
  }
  attempts.push(() => fetchJsonp(DIRECT_API_ENDPOINTS.itunes[endpoint], params));
  attempts.push(async () => {
    const response = await fetch(directApiUrl("itunes", endpoint, params));
    if (!response.ok) throw new Error(`iTunes ${endpoint} failed.`);
    return response.json();
  });

  let lastError;
  for (const attempt of attempts) {
    try {
      const data = await attempt();
      if (data && Array.isArray(data.results)) return data;
      lastError = new Error(`iTunes ${endpoint} returned unexpected data.`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error(`iTunes ${endpoint} failed.`);
}

/* Normalizers */
function normalizeITunesTrack(item) {
  const artwork = artwork600(item.artworkUrl100);
  return {
    id: `itunes-${item.trackId}`,
    youtubeId: "",
    title: item.trackName,
    artist: item.artistName,
    album: item.collectionName,
    mood: item.primaryGenreName || "music",
    playlist: item.collectionName,
    artwork: artwork || item.artworkUrl100,
    thumbnail: artwork || item.artworkUrl100,
    trackNumber: item.trackNumber,
    trackCount: item.trackCount,
    collectionId: item.collectionId,
    releaseDate: item.releaseDate,
    duration: item.trackTimeMillis ? Math.round(item.trackTimeMillis / 1000) : undefined,
    source: "itunes",
    youtubeQuery: `${item.artistName} ${item.trackName} official audio`,
  };
}

function normalizeITunesAlbum(item) {
  return {
    collectionId: item.collectionId,
    title: item.collectionName,
    artist: item.artistName,
    artistId: item.artistId,
    thumbnail: artwork600(item.artworkUrl100) || item.artworkUrl100,
    trackCount: item.trackCount,
    releaseDate: item.releaseDate,
    genre: item.primaryGenreName || "Music",
  };
}

function normalizeITunesArtist(item) {
  return { artistId: item.artistId, name: item.artistName, genre: item.primaryGenreName || "Music" };
}

function normalizeYouTubeItem(item) {
  const raw = item.snippet?.title || "";
  const title = raw.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  if (!item.id?.videoId || isLikelyPlaylist(title)) return null;
  return {
    id: item.id.videoId,
    title,
    artist: item.snippet?.channelTitle || "Unknown channel",
    mood: "youtube",
    playlist: "YouTube Search",
    thumbnail: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url,
  };
}

function isLikelyPlaylist(title) {
  return /(official video|official playlist|lyrics|live at|radio edit)/i.test(title);
}

function rssLabel(value, fallback = "") {
  return value?.label || fallback;
}

function rssEntries(feed) {
  if (!feed?.entry) return [];
  return Array.isArray(feed.entry) ? feed.entry : [feed.entry];
}

function rssArtwork(entry) {
  const images = Array.isArray(entry["im:image"]) ? entry["im:image"] : [];
  return normalizeArtwork(images.at(-1)?.label || "");
}

function rssId(entry) {
  return entry.id?.attributes?.["im:id"] || "";
}

function rssGenre(entry, fallback = "Music") {
  return entry.category?.attributes?.label || entry.category?.attributes?.term || fallback;
}

function rssArtistId(entry) {
  const href = entry["im:artist"]?.attributes?.href || "";
  return href.match(/\/artist\/[^/]+\/(\d+)/)?.[1] || "";
}

function normalizeITunesRssTrack(entry) {
  const trackId = rssId(entry);
  const title = rssLabel(entry["im:name"], "Untitled");
  const artist = rssLabel(entry["im:artist"], "Unknown artist");
  const album = rssLabel(entry["im:collection"]?.["im:name"], "");
  const artwork = rssArtwork(entry);
  const genre = rssGenre(entry);
  const collectionUrl = entry["im:collection"]?.link?.attributes?.href || "";
  const collectionId = collectionUrl.match(/\/album\/[^/]+\/(\d+)/)?.[1] || "";
  return {
    id: trackId ? `itunes-${trackId}` : `rss-${artist}-${title}`,
    youtubeId: "",
    title,
    artist,
    album,
    mood: genre,
    playlist: "Top Songs",
    artwork,
    thumbnail: artwork,
    collectionId,
    releaseDate: rssLabel(entry["im:releaseDate"], ""),
    source: "itunes-rss",
    youtubeQuery: `${artist} ${title} official audio`,
  };
}

function normalizeITunesRssAlbum(entry) {
  return {
    collectionId: rssId(entry),
    title: rssLabel(entry["im:name"], "Untitled album"),
    artist: rssLabel(entry["im:artist"], "Unknown artist"),
    artistId: rssArtistId(entry),
    thumbnail: rssArtwork(entry),
    trackCount: Number(rssLabel(entry["im:itemCount"], "0")) || 0,
    releaseDate: rssLabel(entry["im:releaseDate"], ""),
    genre: rssGenre(entry),
  };
}

async function fetchITunesChartFeed(chart, limit = 20) {
  const key = `feed:${chart}:${limit}`;
  const cached = sessionCache(key);
  if (cached) return cached;
  const response = await fetch(`${ITUNES_CHART_FEED_URL}/${chart}/limit=${limit}/json`);
  if (!response.ok) throw new Error("Chart feed failed.");
  const data = await response.json();
  const entries = rssEntries(data.feed);
  sessionCache(key, entries);
  return entries;
}

async function fetchMusicMetadata(term, limit = 18) {
  const params = new URLSearchParams({ term, media: "music", entity: "song", limit: String(limit), country: "US" });
  const data = await fetchItunesJson("search", params);
  return data.results.filter((item) => item.kind === "song").map(normalizeITunesTrack);
}

async function fetchAlbums(term, limit = 12) {
  const params = new URLSearchParams({ term, media: "music", entity: "album", limit: String(limit), country: "US" });
  const data = await fetchItunesJson("search", params);
  return data.results.filter((item) => item.collectionType === "Album").map(normalizeITunesAlbum);
}

async function fetchArtists(term, limit = 8) {
  const params = new URLSearchParams({ term, media: "music", entity: "musicArtist", limit: String(limit), country: "US" });
  const data = await fetchItunesJson("search", params);
  return data.results.filter((item) => item.wrapperType === "artist").map(normalizeITunesArtist);
}

async function fetchYouTubeTracks(term, maxResults = 10) {
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    videoCategoryId: "10",
    maxResults: String(maxResults),
    q: term,
    key: YOUTUBE_API_KEY,
  });
  const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "YouTube search failed.");
  return data.items.filter((item) => item.id?.videoId).map(normalizeYouTubeItem).filter(Boolean);
}

async function fetchAlbumTracks(collectionId) {
  const params = new URLSearchParams({ id: String(collectionId), entity: "song", country: "US" });
  const data = await fetchItunesJson("lookup", params);
  return data.results.filter((item) => item.kind === "song").map(normalizeITunesTrack).sort((a, b) => (a.trackNumber || 0) - (b.trackNumber || 0));
}

async function fetchAlbumMetadataById(collectionId) {
  const params = new URLSearchParams({ id: String(collectionId), country: "US" });
  const data = await fetchItunesJson("lookup", params);
  const album = data.results.find((item) => item.collectionType === "Album");
  return album ? normalizeITunesAlbum(album) : null;
}

async function fetchArtistAlbums(artistId, limit = 12) {
  const params = new URLSearchParams({ id: String(artistId), entity: "album", limit: String(limit), country: "US" });
  const data = await fetchItunesJson("lookup", params);
  return data.results.filter((item) => item.collectionType === "Album").map(normalizeITunesAlbum);
}

function sessionCache(key, value) {
  const prefix = "auralis-feed-cache:";
  if (value === undefined) {
    try {
      const raw = sessionStorage.getItem(prefix + key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || Date.now() - parsed.t > 15 * 60 * 1000) {
        sessionStorage.removeItem(prefix + key);
        return null;
      }
      return parsed.data;
    } catch {
      return null;
    }
  }
  try {
    sessionStorage.setItem(prefix + key, JSON.stringify({ t: Date.now(), data: value }));
  } catch {
    sessionStorage.removeItem(prefix + key);
  }
}

/* ----------------------------- YouTube search ----------------------------- */
function scheduleSearch() {
  renderSearchResults(["Searching..."]);
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => doSearch(), SEARCH_DEBOUNCE_MS);
}

async function doSearch() {
  const term = els.searchInput.value.trim();
  const requestId = ++searchRequestId;
  const [songs, youtube, albums, artists] = await Promise.all([
    fetchMusicMetadata(term).catch(() => []),
    fetchYouTubeTracks(term).catch(() => []),
    fetchAlbums(term).catch(() => []),
    fetchArtists(term).catch(() => []),
  ]);
  if (requestId !== searchRequestId) return;
  state.searchResults = dedupeBy(songs, (t) => t.id);
  state.searchYoutube = youtube;
  state.searchAlbums = albums;
  state.searchArtists = artists;
  renderSearchResults();
}

/* =========================================================================
   Rendering
   ========================================================================= */
function allPlayableTracks() {
  const merged = new Map();
  [
    ...state.homeResults,
    ...(state.searchResults || []),
    ...(state.searchYoutube || []),
    ...Object.values(state.savedTracks),
    ...state.recentlyPlayed,
    ...(state.currentAlbum?.tracks || []),
    ...(state.currentArtist?.songs || []),
  ]
    .filter((t) => t && t.id)
    .forEach((t) => merged.set(t.id, t));
  return [...merged.values()];
}

function findTrackById(id) {
  return allPlayableTracks().find((t) => t.id === id);
}

function rowActions(track) {
  const liked = state.liked.has(track.id) ? "favorite" : "favorite_border";
  return `
    <div class="row-actions">
      <button class="btn icon" type="button" data-play="${escapeHtml(track.id)}" aria-label="Play ${escapeHtml(track.title)}">${icon("play_arrow")}</button>
      <button class="btn icon" type="button" data-like="${escapeHtml(track.id)}" aria-label="Like">${icon(liked)}</button>
      <button class="btn icon" type="button" data-queue="${escapeHtml(track.id)}" aria-label="Add to queue">${icon("playlist_add")}</button>
    </div>
  `;
}

function trackRow(track, index) {
  const title = escapeHtml(track.title);
  const artist = escapeHtml(track.artist);
  const album = escapeHtml(track.album || "-");
  const duration = track.duration ? formatTime(track.duration) : "";
  return `
    <article class="track-row" data-id="${escapeHtml(track.id)}" tabindex="0" role="button" aria-label="Play ${title} by ${artist}">
      <span class="row-index">${index}</span>
      <img src="${escapeHtml(trackImage(track))}" alt="" loading="lazy" />
      <div class="row-main">
        <div class="row-title">${title}</div>
        <div class="row-artist">${artist}</div>
      </div>
      <div class="row-album">${album}</div>
      <span class="row-duration">${duration}</span>
      ${rowActions(track)}
    </article>
  `;
}

function albumCard(album) {
  return `
    <button class="album-card" type="button" data-album="${escapeHtml(album.collectionId)}">
      <img src="${escapeHtml(album.thumbnail || placeholderCover(album.title, album.artist))}" alt="" loading="lazy" />
      <span class="album-card-body">
        <span class="card-title">${escapeHtml(album.title)}</span>
        <span class="card-artist">${escapeHtml(album.artist)}</span>
        <span class="card-meta">${escapeHtml([releaseYear(album.releaseDate), `${album.trackCount || 0} songs`].filter(Boolean).join(" - "))}</span>
      </span>
    </button>
  `;
}

async function fetchHome() {
  els.heroSub.textContent = "Loading top songs...";
  els.homeBody.innerHTML = '<div class="track-list">' + Array.from({ length: 8 }, () => '<div class="skeleton skeleton-row"></div>').join("") + "</div>";
  const [tracks, albums] = await Promise.all([
    fetchITunesChartFeed("topsongs", HOME_FEED_LIMIT).then((entries) => entries.map(normalizeITunesRssTrack)),
    fetchITunesChartFeed("topalbums", 12).then((entries) => entries.map(normalizeITunesRssAlbum)),
  ]).catch(() => [[], []]);
  state.homeResults = tracks.length ? tracks : state.homeResults;
  els.heroSub.textContent = "Top songs and your library";
  renderHome();
  renderLiked();
  restoreLastPlayed();
}

function renderHome() {
  const songs = state.homeResults;
  els.heroSub.textContent = songs.length ? "Top songs and your library" : "Couldn't load the charts. Try searching instead.";
  let html = "";
  if (songs.length) {
    html += `
      <section class="shelf">
        <div class="shelf-head"><h3>Top songs</h3><span class="count-pill">${songs.length} songs</span></div>
        <div class="track-list">${songs.map((t, i) => trackRow(t, i + 1)).join("")}</div>
      </section>`;
  }
  if (state.searchAlbums && state.searchAlbums.length) {
    html += `
      <section class="shelf">
        <div class="shelf-head"><h3>Albums</h3></div>
        <div class="card-grid">${state.searchAlbums.map(albumCard).join("")}</div>
      </section>`;
  }
  if (!html) html = '<div class="empty-state"><p>Nothing here yet. Use search to find music.</p></div>';
  els.homeBody.innerHTML = html;
}

function renderLiked() {
  const liked = allPlayableTracks().filter((t) => state.liked.has(t.id));
  els.likedCount.textContent = `${liked.length} saved`;
  els.likedList.innerHTML = liked.length
    ? liked.map((t, i) => trackRow(t, i + 1)).join("")
    : '<div class="empty-state"><p>Like songs and they will stay here.</p></div>';
  updateSidebarStats();
}

function updateSidebarStats() {
  const count = state.liked.size;
  els.librarySummary.textContent = `${count} liked song${count === 1 ? "" : "s"}`;
}

function renderQueue() {
  els.queueList.innerHTML = state.queue.length
    ? state.queue.map((t, i) => queueItem(t, i)).join("")
    : '<li class="empty-state"><p>Queue is empty. Add songs to play next.</p></li>';
}

function queueItem(track, index) {
  return `
    <li class="queue-item">
      <img src="${escapeHtml(trackImage(track))}" alt="" loading="lazy" />
      <div style="min-width:0">
        <div class="q-title">${escapeHtml(track.title)}</div>
        <div class="q-artist">${escapeHtml(track.artist)}</div>
      </div>
      <button class="btn icon" type="button" data-qup="${index}" aria-label="Move up">${icon("arrow_upward")}</button>
      <button class="btn icon" type="button" data-qdown="${index}" aria-label="Move down">${icon("arrow_downward")}</button>
      <button class="btn icon" type="button" data-qremove="${index}" aria-label="Remove">${icon("close")}</button>
    </li>
  `;
}

function renderPlaylists() {
  const saved = Object.values(state.savedTracks);
  const autoPlaylists = [...new Set(saved.map((t) => t.album || t.playlist).filter(Boolean))].map((name) => {
    const tracks = saved.filter((t) => (t.album || t.playlist) === name);
    return { name, count: tracks.length, cover: tracks[0], type: "auto" };
  });
  const custom = Object.values(state.customPlaylists);
  const all = [...custom, ...autoPlaylists];
  let html = `
    <button class="playlist-card playlist-create" type="button" id="createPlaylist">
      <span class="playlist-cover">${icon("add")}</span>
      <span class="card-title">Create playlist</span>
    </button>`;
  if (all.length) {
    html += all
      .map((p) => {
        const cover = p.cover?.artwork || p.cover?.thumbnail || "";
        return `
          <button class="playlist-card" type="button" data-playlist="${escapeHtml(p.name)}">
            <span class="playlist-cover">${cover ? `<img src="${escapeHtml(cover)}" alt="" loading="lazy" />` : icon("queue_music")}</span>
            <span class="card-title">${escapeHtml(p.name)}</span>
            <span class="card-meta">${p.count} ${p.count === 1 ? "song" : "songs"}</span>
          </button>`;
      })
      .join("");
  }
  els.playlistGrid.innerHTML = html;
}

/* =========================================================================
   Search results rendering
   ========================================================================= */
function renderSearchResults(placeholder) {
  if (placeholder) {
    els.searchResults.innerHTML = placeholder.map((t) => `<div class="track-row"><span class="row-index"></span><img src="${placeholderCover()}" alt=""/><div class="row-main"><div class="skeleton skeleton-text" style="height:14px;width:60%"></div></div></div>`).join("");
    return;
  }
  const songs = state.searchResults.length ? state.searchResults : state.searchYoutube || [];
  let html = "";
  if (songs.length) {
    html += `<section class="shelf"><div class="shelf-head"><h3>Songs</h3></div><div class="track-list">${songs.map((t, i) => trackRow(t, i + 1)).join("")}</div></section>`;
  }
  if (state.searchAlbums && state.searchAlbums.length) {
    html += `<section class="shelf"><div class="shelf-head"><h3>Albums</h3></div><div class="card-grid">${state.searchAlbums.map(albumCard).join("")}</div></section>`;
  }
  if (state.searchArtists && state.searchArtists.length) {
    html += `<section class="shelf"><div class="shelf-head"><h3>Artists</h3></div><div class="card-grid">${state.searchArtists.map(artistCard).join("")}</div></section>`;
  }
  if (!html) html = '<div class="empty-state"><p>No results. Try a different search.</p></div>';
  els.searchResults.innerHTML = html;
  els.searchCount.textContent = `${(state.searchResults || []).length} songs`;
}

function artistCard(artist) {
  const initials = (artist.name || "A").split(/\s+/).slice(0, 2).map((s) => s[0]).join("").toUpperCase();
  return `
    <button class="album-card" type="button" data-artist="${escapeHtml(artist.artistId)}" data-artist-name="${escapeHtml(artist.name)}">
      <span class="artist-art" style="width:56px;height:56px;font-size:1.1rem">${escapeHtml(initials)}</span>
      <span class="album-card-body">
        <span class="card-title">${escapeHtml(artist.name)}</span>
        <span class="card-artist">${escapeHtml(artist.genre || "Artist")}</span>
      </span>
    </button>
  `;
}

/* =========================================================================
   Detail pages
   ========================================================================= */
async function openAlbum(collectionId) {
  const album = state.searchAlbums?.find((a) => String(a.collectionId) === String(collectionId)) || (await fetchAlbumMetadataById(collectionId).catch(() => null));
  if (!album) return;
  renderAlbumDetail(album);
  switchView("album");
}

function renderAlbumDetail(album) {
  state.currentAlbum = album;
  const tracks = album.tracks || [];
  els.albumDetail.innerHTML = `
    <div class="detail-hero">
      <img src="${escapeHtml(album.thumbnail || placeholderCover(album.title, album.artist))}" alt="" />
      <div>
        <p class="eyebrow">Album</p>
        <h1>${escapeHtml(album.title)}</h1>
        <p class="detail-meta">${escapeHtml(album.artist)} &middot; ${album.trackCount || 0} songs</p>
        <div class="detail-actions">
          <button class="btn primary" type="button" data-play-album="${escapeHtml(album.collectionId)}">${icon("play_arrow")} Play</button>
          <button class="btn" type="button" data-queue-album="${escapeHtml(album.collectionId)}">${icon("playlist_add")} Queue</button>
        </div>
      </div>
    </div>
    <div class="track-list" id="albumTracks">
      ${tracks.length ? tracks.map((t, i) => trackRow(t, i + 1)).join("") : '<div class="skeleton skeleton-row"></div>'}
    </div>
  `;
  if (!tracks.length) {
    fetchAlbumTracks(album.collectionId).then((resolved) => {
      album.tracks = resolved;
      renderAlbumDetail(album);
    });
  }
}

async function openArtist(artistId, name) {
  const albums = await fetchArtistAlbums(artistId).catch(() => []);
  renderArtistDetail(name, albums);
  switchView("artist");
}

function renderArtistDetail(name, albums) {
  state.currentArtist = { name, albums, songs: [] };
  const initials = name.split(/\s+/).slice(0, 2).map((s) => s[0]).join("").toUpperCase();
  els.artistDetail.innerHTML = `
    <div class="detail-hero">
      <div class="artist-art">${escapeHtml(initials)}</div>
      <div>
        <p class="eyebrow">Artist</p>
        <h1>${escapeHtml(name)}</h1>
        <p class="detail-meta">${albums.length} albums</p>
        <div class="detail-actions">
          <button class="btn primary" type="button" data-play-artist="${escapeHtml(name)}">${icon("play_arrow")} Play top songs</button>
        </div>
      </div>
    </div>
    ${albums.length ? `<div class="card-grid">${albums.map(albumCard).join("")}</div>` : '<div class="empty-state"><p>No albums found.</p></div>'}
  `;
}

/* =========================================================================
   View switching
   ========================================================================= */
const VIEW_IDS = ["home", "search", "album", "artist", "liked", "playlists"];

function switchView(view) {
  if (!VIEW_IDS.includes(view)) return;
  state.view = view;
  document.querySelectorAll("[data-panel]").forEach((panel) => {
    panel.classList.toggle("is-hidden", panel.dataset.panel !== view);
  });
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === view);
  });
}

/* =========================================================================
   YouTube IFrame player + playback
   ========================================================================= */
function resolveYouTubeVideoId(track) {
  if (track.youtubeId) return track.youtubeId;
  const query = track.youtubeQuery || `${track.artist} ${track.title}`;
  return fetchYouTubeTracks(query, 1)
    .then((results) => results[0]?.id || "")
    .catch(() => "");
}

function ensureYouTubePlayer(videoId, autoplay) {
  pendingYouTubeRequest = { videoId, autoplay };
  if (player?.loadVideoById) {
    if (autoplay) player.loadVideoById(videoId);
    else player.cueVideoById(videoId);
    pendingYouTubeRequest = null;
    return;
  }
  loadYouTubeApi();
}

let googleScriptAdded = false;
function loadYouTubeApi() {
  if (window.YT?.Player) {
    finishYouTubeInit();
    return;
  }
  if (youtubeApiLoading) return;
  youtubeApiLoading = true;
  if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  }
  const check = () => {
    if (window.YT?.Player) {
      clearInterval(timer);
      finishYouTubeInit();
      return;
    }
    if (pendingYouTubeRequest && Date.now() > pendingYouTubeRequest.deadline) {
      clearInterval(timer);
      showToast("Video player failed to load.", "error");
    }
  };
  const timer = setInterval(check, 250);
}

function finishYouTubeInit() {
  youtubeApiLoading = false;
  const request = pendingYouTubeRequest || { videoId: state.activeTrack?.youtubeId || state.activeTrack?.id || "fJ9rUzIMcZQ", autoplay: false };
  player = new YT.Player("youtubePlayer", {
    host: YOUTUBE_EMBED_HOST,
    videoId: request.videoId,
    playerVars: { controls: 1, rel: 0, modestbranding: 1, enablejsapi: 1, playsinline: 1, origin: window.location.origin },
    events: {
      onReady: () => {
        player.setVolume(Number(els.volumeSlider.value));
        if (state.isMuted) player.mute();
        if (request.autoplay) player.loadVideoById(request.videoId);
        else player.cueVideoById(request.videoId);
        pendingYouTubeRequest = null;
        updateProgress();
      },
      onStateChange: handlePlayerState,
    },
  });
}

async function playTrack(track, autoplay = true) {
  if (!track) return;
  state.activeTrack = track;
  addRecentlyPlayed(track);
  saveLastPlayed();
  renderNowPlaying();
  refreshNowPlayingArt();
  loadLyrics(track);
  const videoId = await resolveYouTubeVideoId(track);
  if (!videoId) {
    showToast(`Couldn't find a playable version of "${track.title}".`, "error");
    return;
  }
  ensureYouTubePlayer(videoId, autoplay);
}

function playFromList(tracks, index) {
  state.activeContextTracks = tracks;
  state.queue = [];
  playTrack(tracks[index]);
}

function togglePlay() {
  if (state.isPlaying) {
    player?.pauseVideo?.();
  } else if (state.activeTrack) {
    if (player?.playVideo) player.playVideo();
    else playTrack(state.activeTrack, true);
  }
}

function playNext() {
  if (state.queue.length) {
    playTrack(state.queue.shift());
    renderQueue();
    return;
  }
  if (state.activeContextTracks.length) {
    const idx = state.activeContextTracks.findIndex((t) => t.id === state.activeTrack?.id);
    const next = state.activeContextTracks[(idx + 1) % state.activeContextTracks.length];
    if (next && next.id !== state.activeTrack?.id) playTrack(next);
    else showToast("Nothing more to play.", "info");
    return;
  }
  showToast("Nothing more to play.", "info");
}

function playPrevious() {
  if (state.activeContextTracks.length) {
    const idx = state.activeContextTracks.findIndex((t) => t.id === state.activeTrack?.id);
    const prev = state.activeContextTracks[(idx - 1 + state.activeContextTracks.length) % state.activeContextTracks.length];
    if (prev && prev.id !== state.activeTrack?.id) playTrack(prev);
  }
}

function addToQueue(id) {
  const track = findTrackById(id);
  if (!track) return;
  state.queue.push(track);
  renderQueue();
  showToast(`Added "${track.title}" to queue`, "success");
}

function toggleLike(id) {
  if (state.liked.has(id)) {
    state.liked.delete(id);
    delete state.savedTracks[id];
    showToast("Removed from library", "info");
  } else {
    const track = findTrackById(id);
    state.liked.add(id);
    if (track) state.savedTracks[id] = track;
    showToast(`Added to library`, "success");
  }
  saveUserData();
  renderHome();
  renderSearchResults();
  renderLiked();
  renderPlaylists();
}

function updateProgress() {
  if (!player?.getCurrentTime || state.isSeeking) return;
  const current = player.getCurrentTime();
  const total = player.getDuration();
  if (state.activeTrack && Number.isFinite(total) && total > 0 && !state.activeTrack.lyricsDurationHydrated) {
    state.activeTrack.duration = Math.round(total);
    state.activeTrack.lyricsDurationHydrated = true;
    loadLyrics(state.activeTrack);
  }
  const pct = total ? String((current / total) * 100) : "0";
  els.currentTime.textContent = formatTime(current);
  els.duration.textContent = formatTime(total);
  els.npCurrent.textContent = formatTime(current);
  els.npTotal.textContent = formatTime(total);
  els.seekBar.value = pct;
  els.npSeekBar.value = pct;
  updateSyncedLyrics(current);
}

function startProgressTimer() {
  clearInterval(progressTimer);
  progressTimer = setInterval(updateProgress, 250);
}

function stopProgressTimer() {
  clearInterval(progressTimer);
}

function handlePlayerState(event) {
  state.isPlaying = event.data === YT.PlayerState.PLAYING;
  if (event.data === YT.PlayerState.ENDED) {
    stopProgressTimer();
    playNext();
    return;
  }
  renderNowPlaying();
  updateProgress();
  if (state.isPlaying) startProgressTimer();
  else stopProgressTimer();
}

function seekPlayerToFraction(fraction) {
  const duration = player?.getDuration?.() || 0;
  player?.seekTo?.(fraction * duration, true);
  state.isSeeking = false;
  updateProgress();
  updateSyncedLyrics(player?.getCurrentTime?.() || fraction * duration, true);
}

function renderNowPlaying() {
  const track = state.activeTrack;
  els.npTitle.textContent = track?.title || "Nothing playing";
  els.npArtist.textContent = track?.artist || "";
  els.playerTitle.textContent = track?.title || "Nothing playing";
  els.playerArtist.textContent = track?.artist || "";
  const iconName = state.isPlaying ? "pause" : "play_arrow";
  els.playButton.innerHTML = icon(iconName);
  els.npPlay.innerHTML = icon(iconName);
}

function refreshNowPlayingArt() {
  const src = state.activeTrack ? trackImage(state.activeTrack) : "";
  els.playerArt.src = src;
  els.npArt.src = src;
}

function toggleMute() {
  state.isMuted = !state.isMuted;
  if (state.isMuted) player?.mute?.();
  else {
    player?.unMute?.();
    player?.setVolume?.(Number(els.volumeSlider.value));
  }
  updateMuteIcon();
}

function updateMuteIcon() {
  const name = state.isMuted ? "volume_off" : "volume_up";
  els.volumeIcon.textContent = name;
  els.npMute.innerHTML = icon(name);
}

/* =========================================================================
   Recently played + last played
   ========================================================================= */
function addRecentlyPlayed(track) {
  state.recentlyPlayed = [track, ...state.recentlyPlayed.filter((t) => t.id !== track.id)].slice(0, RECENTLY_PLAYED_LIMIT);
  localStorage.setItem(RECENTLY_PLAYED_KEY, JSON.stringify(state.recentlyPlayed));
}

function saveLastPlayed() {
  if (state.activeTrack) localStorage.setItem(LAST_PLAYED_KEY, JSON.stringify({ id: state.activeTrack.id }));
}

function restoreLastPlayed() {
  if (state.activeTrack) return;
  try {
    const last = JSON.parse(localStorage.getItem(LAST_PLAYED_KEY));
    if (!last?.id) return;
    const match = findTrackById(last.id);
    if (!match) return;
    state.activeTrack = match;
    renderNowPlaying();
    refreshNowPlayingArt();
    loadLyrics(match);
  } catch {
    /* ignore */
  }
}

/* =========================================================================
   Lyrics (LRCLIB + rendering)
   ========================================================================= */
function parseLrcTimestamp(value) {
  const match = String(value).match(/^(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  return minutes * 60 + seconds;
}

function parseSyncedLyrics(value = "") {
  return value
    .split(/\r?\n/)
    .map((line) => {
      const timestamps = [...line.matchAll(/\[(\d+:\d+(?:\.\d+)?)\]/g)]
        .map((match) => parseLrcTimestamp(match[1]))
        .filter((time) => time !== null);
      const text = line.replace(/\[[^\]]+\]/g, "").trim();
      if (!timestamps.length || !text) return [];
      return timestamps.map((time) => ({ time, text }));
    })
    .flat()
    .sort((a, b) => a.time - b.time);
}

function cleanLyricsTitle(title = "") {
  return (
    title
      .replace(/\s*[-\u2013\u2014]\s*(?:single|ep|radio edit|remaster(?:ed)?|explicit|clean|official audio).*$/i, "")
      .replace(/\s*\((?:feat\.?|featuring|with|from|official|audio|visualizer|lyrics?|remaster(?:ed)?|radio edit|explicit|clean)[^)]+\)/gi, "")
      .replace(/\s*\[[^\]]+\]/g, "")
      .trim() || title
  );
}

function scoreLyricsResult(result, track) {
  const trackTitle = normalizedText(cleanLyricsTitle(track.title));
  const resultTitle = normalizedText(cleanLyricsTitle(result.trackName || result.name || ""));
  const trackArtist = normalizedText(track.artist);
  const resultArtist = normalizedText(result.artistName || result.artist || "");
  let score = 0;
  if (result.syncedLyrics) score += 40;
  if (result.plainLyrics) score += 8;
  if (resultTitle === trackTitle) score += 45;
  else if (resultTitle && trackTitle && (resultTitle.includes(trackTitle) || trackTitle.includes(resultTitle))) score += 22;
  if (resultArtist === trackArtist) score += 32;
  const resultDuration = Number(result.duration);
  if (Number.isFinite(resultDuration) && track.duration) {
    const delta = Math.abs(resultDuration - track.duration);
    if (delta <= 2) score += 24;
    else if (delta <= 5) score += 16;
    else if (delta <= 10) score += 8;
  }
  return score;
}

async function fetchLyricsCandidate(track) {
  const getParams = new URLSearchParams({
    track_name: cleanLyricsTitle(track.title),
    artist_name: track.artist,
    album_name: track.album || "",
    duration: track.duration ? String(Math.round(track.duration)) : "",
  });
  let url = API_PROXY_URL ? proxiedApiUrl("lrclib", "get", getParams) : directApiUrl("lrclib", "get", getParams);
  try {
    const response = await fetch(url);
    if (response.ok) return await response.json();
  } catch {
    /* continue */
  }

  const searchParams = new URLSearchParams({
    track_name: cleanLyricsTitle(track.title),
    artist_name: track.artist,
  });
  try {
    let searchData;
    if (API_PROXY_URL) {
      const res = await fetch(proxiedApiUrl("lrclib", "search", searchParams));
      if (res.ok) searchData = await res.json();
    }
    if (!searchData) {
      const res2 = await fetch(`${LRCLIB_SEARCH_URL}?${searchParams}`);
      if (res2.ok) searchData = await res2.json();
    }
    const list = Array.isArray(searchData) ? searchData : [];
    if (list.length && typeof list[0] === "object") {
      list.sort((a, b) => scoreLyricsResult(b, track) - scoreLyricsResult(a, track));
      if (list[0].syncedLyrics || list[0].plainLyrics) return list[0];
    }
  } catch {
    /* continue */
  }
  return null;
}

function loadLyrics(track) {
  const requestId = ++lyricsRequestId;
  state.lyrics = { trackId: track?.id || "", status: track ? "Finding lyrics..." : "Choose a song", lines: [], plain: "", activeIndex: -1, expanded: state.lyrics.expanded };
  renderLyrics();
  if (!track) return;
  fetchLyricsCandidate(track).then((data) => {
    if (requestId !== lyricsRequestId) return;
    if (!data) {
      state.lyrics = { ...state.lyrics, status: "No lyrics found", lines: [], plain: "" };
      renderLyrics();
      return;
    }
    const lines = parseSyncedLyrics(data.syncedLyrics || "");
    state.lyrics = {
      ...state.lyrics,
      status: lines.length ? "Synced lyrics" : data.plainLyrics ? "Plain lyrics" : "No lyrics found",
      lines,
      plain: lines.length ? "" : data.plainLyrics || "",
      activeIndex: -1,
    };
    renderLyrics();
    if (lines.length && player?.getCurrentTime) {
      updateSyncedLyrics(player.getCurrentTime(), true);
    }
  });
}

function renderLyrics() {
  els.lyricsList.classList.toggle("is-plain", !!state.lyrics.plain && !state.lyrics.lines.length);
  if (state.lyrics.lines.length) {
    els.lyricsList.innerHTML = state.lyrics.lines
      .map((line, index) => {
        const active = index === state.lyrics.activeIndex ? " is-active" : "";
        const past = state.lyrics.activeIndex >= 0 && index < state.lyrics.activeIndex ? " is-past" : "";
        return `<p class="lyric-line${active}${past}" data-lyric-index="${index}">${escapeHtml(line.text)}</p>`;
      })
      .join("");
    return;
  }
  if (state.lyrics.plain) {
    els.lyricsList.innerHTML = state.lyrics.plain.split(/\r?\n/).filter(Boolean).map((l) => `<p>${escapeHtml(l)}</p>`).join("");
    return;
  }
  els.lyricsList.innerHTML = `<p class="lyrics-empty">${escapeHtml(state.lyrics.status)}</p>`;
}

function scrollLyricContainerTo(lineEl, behavior = "auto") {
  const container = els.lyricsList;
  if (!container || !lineEl) return;
  const containerRect = container.getBoundingClientRect();
  const lineRect = lineEl.getBoundingClientRect();
  const delta = lineRect.top + lineRect.height / 2 - containerRect.top - containerRect.height / 2;
  container.scrollTo({ top: Math.max(0, container.scrollTop + delta), behavior });
}

function updateSyncedLyrics(currentTime, force = false) {
  if (!state.lyrics.lines.length) return;
  let nextIndex = state.lyrics.lines.findIndex((line, index) => {
    const next = state.lyrics.lines[index + 1];
    return currentTime >= line.time && (!next || currentTime < next.time);
  });
  if (nextIndex < 0) nextIndex = currentTime < state.lyrics.lines[0].time ? -1 : state.lyrics.lines.length - 1;
  if (!force && nextIndex === state.lyrics.activeIndex) return;
  state.lyrics.activeIndex = nextIndex;
  els.lyricsList.querySelectorAll(".lyric-line").forEach((line) => {
    const index = Number(line.dataset.lyricIndex);
    line.classList.toggle("is-active", index === nextIndex);
    line.classList.toggle("is-past", nextIndex >= 0 && index < nextIndex);
  });
  if (nextIndex >= 0) {
    const active = els.lyricsList.querySelector(`[data-lyric-index="${nextIndex}"]`);
    scrollLyricContainerTo(active, force ? "auto" : "smooth");
  }
}

/* =========================================================================
   Auth (demo + Google optional)
   ========================================================================= */
function renderAuth() {
  const user = state.user;
  els.authLabel.textContent = user ? user.name : "Sign in";
  els.avatar.textContent = (user?.name?.[0] || "G").toUpperCase();
}

function initGoogleButton() {
  if (!GOOGLE_CLIENT_ID || els.googleButton.dataset.loaded) return;
  els.googleButton.dataset.loaded = "1";
  if (!window.google?.accounts?.id) {
    if (!document.querySelector('script[src*="accounts.google.com/gsi/client"]')) {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.defer = true;
      document.head.appendChild(s);
    }
  }
  const tryInit = () => {
    if (window.google?.accounts?.id) {
      window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleCredentialResponse });
      window.google.accounts.id.renderButton(els.googleButton, { theme: state.theme === "dark" ? "filled_black" : "outline", size: "large" });
    } else {
      setTimeout(tryInit, 300);
    }
  };
  tryInit();
}

function handleCredentialResponse(response) {
  try {
    const payload = JSON.parse(decodeURIComponent(escape(atob(response.credential.split(".")[1]))));
    state.user = { name: payload.name || "User", email: payload.email || "" };
  } catch {
    state.user = { name: "User", email: "" };
  }
  saveUserData();
  renderAuth();
  els.authDialog.close();
  showToast("Signed in", "success");
}

/* =========================================================================
   Event wiring
   ========================================================================= */
function onInit() {
  renderAuth();
  renderHome();
  renderLiked();
  renderPlaylists();
  bindCreatePlaylist();

  /* nav */
  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  /* search */
  els.searchInput.addEventListener("input", () => {
    const term = els.searchInput.value.trim();
    els.clearSearch.classList.toggle("is-hidden", !term);
    if (!term) {
      state.searchResults = [];
      state.searchAlbums = [];
      state.searchArtists = [];
      state.searchYoutube = [];
      renderSearchResults();
      return;
    }
    scheduleSearch();
  });
  els.clearSearch.addEventListener("click", () => {
    els.searchInput.value = "";
    els.clearSearch.classList.add("is-hidden");
    state.searchResults = [];
    state.searchAlbums = [];
    state.searchArtists = [];
    state.searchYoutube = [];
    renderSearchResults();
    els.searchInput.focus();
  });

  /* global delegation: track rows, cards, queue, aware */
  document.addEventListener("click", async (event) => {
    const target = event.target.closest("[data-play], [data-like], [data-queue], [data-album], [data-artist], [data-qup], [data-qdown], [data-qremove], [data-play-album], [data-queue-album], [data-playlist], .track-row, .album-card, .playlist-card");
    if (!target) return;
    if (target.dataset.play) {
      const row = target.closest(".track-row");
      const context = row ? peerRows(row) : [];
      const track = findTrackById(target.dataset.play);
      if (track) {
        playFromList(context.length ? context : [track], Math.max(0, context.findIndex((t) => t.id === track.id)));
      }
      return;
    }
    if (target.dataset.like) {
      toggleLike(target.dataset.like);
      return;
    }
    if (target.dataset.queue) {
      addToQueue(target.dataset.queue);
      return;
    }
    if (target.dataset.album) {
      openAlbum(target.dataset.album);
      return;
    }
    if (target.dataset.artist) {
      if (target.dataset.artistName) openArtist(target.dataset.artist, target.dataset.artistName);
      return;
    }
    if (target.dataset.qremove !== undefined) {
      state.queue.splice(Number(target.dataset.qremove), 1);
      renderQueue();
      return;
    }
    if (target.dataset.qup !== undefined) {
      const idx = Number(target.dataset.qup);
      if (idx > 0) {
        [state.queue[idx - 1], state.queue[idx]] = [state.queue[idx], state.queue[idx - 1]];
        renderQueue();
      }
      return;
    }
    if (target.dataset.qdown !== undefined) {
      const idx = Number(target.dataset.qdown);
      if (idx < state.queue.length - 1) {
        [state.queue[idx], state.queue[idx + 1]] = [state.queue[idx + 1], state.queue[idx]];
        renderQueue();
      }
      return;
    }
    if (target.dataset.playAlbum) {
      const album = state.searchAlbums?.find((a) => String(a.collectionId) === String(target.dataset.playAlbum));
      if (album?.tracks?.length) {
        playFromList(album.tracks, 0);
      } else {
        const tracks = await fetchAlbumTracks(target.dataset.playAlbum).catch(() => []);
        if (tracks.length) {
          const found = state.searchAlbums?.find((a) => String(a.collectionId) === String(target.dataset.playAlbum));
          if (found) found.tracks = tracks;
          playFromList(tracks, 0);
        }
      }
      return;
    }
    if (target.dataset.queueAlbum) {
      const album = state.searchAlbums?.find((a) => String(a.collectionId) === String(target.dataset.queueAlbum));
      const tracks = album?.tracks || (await fetchAlbumTracks(target.dataset.queueAlbum).catch(() => []));
      tracks.forEach((t) => state.queue.push(t));
      renderQueue();
      showToast(`Queued ${tracks.length} songs`, "success");
      return;
    }
    if (target.dataset.playlist) {
      const name = target.dataset.playlist;
      const playlist = state.customPlaylists[name];
      if (playlist?.length) playFromList(playlist.slice(), 0);
      else showToast("Playlist is empty", "info");
    }
    if (target.closest(".track-row") && !target.closest("[data-play]")) {
      const id = target.closest(".track-row").dataset.id;
      if (id) {
        const track = findTrackById(id);
        if (track) playFromList(peerRows(target.closest(".track-row")), Math.max(0, peerRows(target.closest(".track-row")).findIndex((t) => t.id === id)));
      }
    }
  });

  function peerRows(row) {
    const container = row?.parentElement;
    if (!container) return [];
    return [...container.querySelectorAll(".track-row")].map((r) => findTrackById(r.dataset.id)).filter(Boolean);
  }

  /* keyboard for track rows */
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const row = event.target.closest(".track-row");
    if (!row) return;
    event.preventDefault();
    const id = row.dataset.id;
    const track = findTrackById(id);
    if (track) {
      const peers = peerRows(row);
      playFromList(peers, Math.max(0, peers.findIndex((t) => t.id === id)));
    }
  });

  /* create playlist */
  const createBtn = els.playlistGrid.querySelector("#createPlaylist");
  if (createBtn) createBtn.addEventListener("click", createPlaylistFromPrompt);

  /* player controls */
  els.playButton.addEventListener("click", togglePlay);
  els.prevButton.addEventListener("click", playPrevious);
  els.nextButton.addEventListener("click", playNext);
  els.npPlay.addEventListener("click", togglePlay);
  els.npPrev.addEventListener("click", playPrevious);
  els.npNext.addEventListener("click", playNext);
  els.npMute.addEventListener("click", toggleMute);
  els.shuffleAll.addEventListener("click", () => {
    const list = allPlayableTracks();
    if (!list.length) return showToast("Nothing to shuffle", "info");
    const shuffled = [...list].sort(() => Math.random() - 0.5);
    playFromList(shuffled, 0);
  });

  els.seekBar.addEventListener("input", () => (state.isSeeking = true));
  els.seekBar.addEventListener("change", () => seekPlayerToFraction(Number(els.seekBar.value) / 100));
  els.npSeekBar.addEventListener("input", () => (state.isSeeking = true));
  els.npSeekBar.addEventListener("change", () => seekPlayerToFraction(Number(els.npSeekBar.value) / 100));

  els.volumeSlider.addEventListener("input", () => {
    player?.setVolume?.(Number(els.volumeSlider.value));
    localStorage.setItem(VOLUME_KEY, els.volumeSlider.value);
  });

  /* queue panel */
  els.queueToggle.addEventListener("click", () => {
    const hidden = els.queuePanel.classList.toggle("is-hidden");
    renderQueue();
    if (!hidden) els.closeQueue.focus();
  });
  els.closeQueue.addEventListener("click", () => els.queuePanel.classList.add("is-hidden"));
  els.clearQueue.addEventListener("click", () => {
    state.queue = [];
    renderQueue();
    showToast("Queue cleared", "info");
  });

  /* now playing */
  els.playerTrack.addEventListener("click", openNowPlaying);
  els.npClose.addEventListener("click", closeNowPlaying);
  els.npVideo.addEventListener("click", () => {
    const frame = els.youtubePlayer;
    if (!frame) return;
    const visible = frame.classList.toggle("is-video-visible");
    els.npVideo.innerHTML = icon(visible ? "videocam" : "picture_in_picture");
  });
  els.npLyrics.addEventListener("click", () => {
    els.lyricsPanel.classList.toggle("is-hidden");
    els.lyricsClose.classList.toggle("is-hidden", els.lyricsPanel.classList.contains("is-hidden"));
    if (!els.lyricsPanel.classList.contains("is-hidden")) {
      state.lyrics.expanded = true;
      loadLyrics(state.activeTrack);
    } else {
      state.lyrics.expanded = false;
    }
  });
  els.lyricsClose.addEventListener("click", () => {
    els.lyricsPanel.classList.add("is-hidden");
    els.lyricsClose.classList.add("is-hidden");
    state.lyrics.expanded = false;
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (!els.npOverlay.classList.contains("is-hidden")) closeNowPlaying();
      if (!els.queuePanel.classList.contains("is-hidden")) els.queuePanel.classList.add("is-hidden");
    }
  });

  /* theme */
  els.themeToggle.addEventListener("click", () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    saveUserData();
    renderTheme();
  });
  renderTheme();

  /* auth */
  els.authButton.addEventListener("click", () => {
    if (state.user) {
      state.user = null;
      saveUserData();
      renderAuth();
      showToast("Signed out", "info");
      return;
    }
    els.authDialog.showModal();
    initGoogleButton();
  });
  els.demoSignIn.addEventListener("click", () => {
    state.user = { name: "Demo User", email: "demo@auralis.local" };
    saveUserData();
    renderAuth();
    els.authDialog.close();
    showToast("Signed in as Demo User", "success");
  });

  /* volume restore */
  const savedVolume = localStorage.getItem(VOLUME_KEY);
  if (savedVolume !== null) els.volumeSlider.value = savedVolume;
  updateMuteIcon();

  fetchHome();
}

function renderTheme() {
  els.root.classList.toggle("light", state.theme === "light");
  els.themeToggle.innerHTML = icon(state.theme === "dark" ? "dark_mode" : "light_mode");
}

function openNowPlaying() {
  if (!state.activeTrack) return;
  els.npOverlay.classList.remove("is-hidden");
  if (!state.lyrics.expanded) refreshNowPlayingArt();
  updateProgress();
}

function closeNowPlaying() {
  els.npOverlay.classList.add("is-hidden");
}

function createPlaylistFromPrompt() {
  const name = window.prompt("Playlist name:");
  if (!name) return;
  state.customPlaylists[name.trim()] = [];
  saveUserData();
  renderPlaylists();
  bindCreatePlaylist();
  showToast(`Created "${name.trim()}"`, "success");
}

function bindCreatePlaylist() {
  const btn = els.playlistGrid.querySelector("#createPlaylist");
  if (btn) btn.onclick = createPlaylistFromPrompt;
}

/* Service worker (optional) */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    if (location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(location.hostname)) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", onInit);
} else {
  onInit();
}
