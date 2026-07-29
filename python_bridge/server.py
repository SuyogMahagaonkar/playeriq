#!/usr/bin/env python3
# ========================================
# PlayerIQ -- MovieBox Python Bridge
# Flask microservice: Node.js -> MovieBox API
# Port: 8789
# ========================================

import asyncio
import logging
import time
from flask import Flask, jsonify, request
from flask_cors import CORS

logging.basicConfig(level=logging.WARNING)
log = logging.getLogger("playeriq-bridge")

app = Flask(__name__)
CORS(app)

from moviebox_api.v3.core import (
    MovieBoxHttpClient,
    Search,
    DownloadableVideoFilesDetail,
    SubjectType,
    CustomResolutionType,
    SUBJECT_GET_PATH,
    SEASON_INFO_PATH,
    RESOURCE_PATH,
    Homepage,
    DownloadableCaptionFileDetails
)
from moviebox_api.v3.urls import MAIN_PAGE_PATH, PLAY_INFO_PATH
import threading

def _parse_sign_cookie(cookie_str):
    if not cookie_str:
        return "", "", ""
    params = {}
    for part in str(cookie_str).split(";"):
        part = part.strip()
        if "=" in part:
            k, v = part.split("=", 1)
            params[k.strip()] = v.strip()
    return (
        params.get("CloudFront-Policy", ""),
        params.get("CloudFront-Signature", ""),
        params.get("CloudFront-Key-Pair-Id", "")
    )

class SimpleTTLCache:
    def __init__(self, ttl_seconds):
        self.ttl = ttl_seconds
        self.cache = {}
        self.lock = threading.Lock()

    def get(self, key):
        with self.lock:
            if key in self.cache:
                val, expiry = self.cache[key]
                if time.time() < expiry:
                    return val
                else:
                    del self.cache[key]
            return None

    def set(self, key, val):
        with self.lock:
            self.cache[key] = (val, time.time() + self.ttl)

search_cache = SimpleTTLCache(ttl_seconds=14400) # 4 hours
home_cache = SimpleTTLCache(ttl_seconds=86400)   # 24 hours

# Monkey-patch MovieBoxHttpClient.__aenter__ to automatically pre-warm the guest token
_orig_aenter = MovieBoxHttpClient.__aenter__

async def _patched_aenter(self):
    await _orig_aenter(self)
    try:
        await self.get(MAIN_PAGE_PATH)
    except Exception as e:
        log.warning("Failed to auto-authenticate MovieBox client: %s", e)
    return self

MovieBoxHttpClient.__aenter__ = _patched_aenter


def run_async(coro):
    """Run an async coroutine in a new event loop (thread-safe for Flask)."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


async def _search_title(client, query: str, subject_type: SubjectType):
    """Search MovieBox and return (subject_id, title, release_date)."""
    searcher = Search(client, query, subject_type=subject_type)
    raw = await searcher.get_content()
    items = raw.get("items", [])
    if not items:
        raise ValueError(f"No results found for '{query}' on MovieBox")
    item = items[0]
    subject_id = item.get("subjectId")
    if not subject_id:
        raise ValueError("Could not determine subject ID from search result")
    title = item.get("title", query)
    release_date = item.get("releaseDate", "")
    return subject_id, title, release_date


async def _get_streams(client, subject_id: str, release_date: str = None):
    """Fetch downloadable stream files for a given subjectId (movies)."""
    downloader = DownloadableVideoFilesDetail(
        client, resolution=CustomResolutionType.BEST
    )
    raw = await downloader.get_content(subject_id, release_date)
    # The response contains 'list' with video file metadata
    files = raw.get("list") or raw.get("mediaFiles") or raw.get("streams") or []
    return raw, files


# In-memory cache for TV episode listings: subject_id -> {"metadata": dict, "episodes": dict, "fetched_pages": set}
tv_listings_cache = {}

async def _get_episode_streams(client, subject_id: str, season: int, episode: int):
    """Fetch streams for a specific TV episode, utilizing cache to avoid redundant API queries."""
    now = time.time()
    episode_key = (season, episode)
    print(f"[DEBUG] _get_episode_streams: subject_id={subject_id}, season={season}, episode={episode}")

    # Cache expiration logic:
    # 1. More than 10 minutes old (600s)
    # 2. OR the target episode is missing and the cache entry is more than 60 seconds old
    cache_entry = tv_listings_cache.get(subject_id)
    if cache_entry:
        is_expired = False
        if now - cache_entry.get("last_fetched", 0) > 600:
            is_expired = True
        elif episode_key not in cache_entry.get("episodes", {}) and now - cache_entry.get("last_fetched", 0) > 60:
            is_expired = True
            
        if is_expired:
            print(f"[DEBUG] Expiring stale cache entry for subject_id={subject_id}")
            log.warning("[Cache Invalidation] Expiring TV listings cache for subject %s S%dE%d", subject_id, season, episode)
            tv_listings_cache.pop(subject_id, None)
            cache_entry = None

    if not cache_entry:
        cache_entry = tv_listings_cache.setdefault(subject_id, {
            "metadata": {},
            "episodes": {},
            "fetched_pages": set(),
            "last_fetched": now
        })
    
    # Check if we already cached this episode
    if episode_key in cache_entry["episodes"]:
        print(f"[DEBUG] Cache Hit! Serving S{season}E{episode}")
        log.warning("[Cache Hit] Serving TV stream for subject %s S%dE%d from memory", subject_id, season, episode)
        return cache_entry["metadata"], [cache_entry["episodes"][episode_key]]

    # If we overshot earlier (i.e. we fetched past this season), we know it doesn't exist
    if cache_entry["fetched_pages"]:
        max_cached_season = max((se for se, ep in cache_entry["episodes"].keys()), default=0)
        if season < max_cached_season:
            print(f"[DEBUG] Overshot earlier: season {season} < max_cached_season {max_cached_season}. Episode does not exist.")
            return {}, []

    MAX_PAGES = 20
    for page in range(1, MAX_PAGES + 1):
        if page in cache_entry["fetched_pages"]:
            continue  # Already fetched this page

        try:
            params = {
                "subjectId": subject_id,
                "resolution": 1080,
                "page": page,
                "perPage": 20,
            }
            print(f"[DEBUG] Fetching page {page} for subject_id={subject_id}")
            raw = await client.get_from_api(RESOURCE_PATH, params=params)
            items = raw.get("list") or raw.get("mediaFiles") or raw.get("streams") or []
            print(f"[DEBUG] Page {page} fetched. Items count: {len(items)}")

            if not items:
                break  # No more pages

            # Mark this page as fetched
            cache_entry["fetched_pages"].add(page)
            
            # Store metadata
            metadata_keys = ["pager", "subjectId", "subjectType", "cover", "subjectTitle", "totalSize", "totalEpisode", "position", "resolution", "collectionResolutions", "description", "genre", "tags", "favInfo", "releaseDate", "countryName", "durationSeconds", "title"]
            for k in metadata_keys:
                if k in raw:
                    cache_entry["metadata"][k] = raw[k]

            # Cache all episodes on this page
            for f in items:
                se = f.get("se")
                ep = f.get("ep")
                if se is not None and ep is not None:
                    cache_entry["episodes"][(se, ep)] = f

            # Check if our target episode is now in the cache
            if episode_key in cache_entry["episodes"]:
                print(f"[DEBUG] Target episode found on page {page}!")
                return cache_entry["metadata"], [cache_entry["episodes"][episode_key]]

            # Optimization: if all episodes on this page are past our target season, stop
            max_season_on_page = max((f.get("se") or 0) for f in items)
            if max_season_on_page > season:
                print(f"[DEBUG] max_season_on_page {max_season_on_page} > target season {season}. Stopping page fetch.")
                break

        except Exception as e:
            print(f"[DEBUG] Error fetching page {page}: {e}")
            log.warning("Failed to fetch page %d for episode streams: %s", page, e)
            break

    print(f"[DEBUG] Stream not found after checking pages. Returning empty list.")
    return {}, []




def pick_best(files: list) -> dict | None:
    """Pick the highest-resolution file from the list."""
    if not files:
        return None

    def res_val(f):
        try:
            r = f.get("resolution") or f.get("resolutions") or "0"
            return int(str(r).replace("p", ""))
        except (ValueError, TypeError):
            return 0

    return max(files, key=res_val)


def format_file(f: dict) -> dict:
    return {
        "url": f.get("resourceLink") or f.get("url") or f.get("downloadUrl"),
        "resolution": f.get("resolution") or f.get("resolutions"),
        "format": f.get("format", "MP4"),
        "size": f.get("size"),
        "codec": f.get("codecName"),
        "title": f.get("title"),
        "duration": f.get("duration"),  # duration in seconds (per-file)
    }


# ---- Health ----
@app.route("/api/health")
def health():
    return jsonify({"status": "ok", "service": "PlayerIQ Python Bridge", "port": 8789})


# ---- MovieBox Search ----
@app.route("/api/moviebox/search")
def search_moviebox():
    """
    Search MovieBox and return rich result list.
    Query params:
      q     - search query (required)
      type  - 'movie' | 'tv' | 'all'  (default: 'all')
      page  - page number (default: 1)
    """
    q = request.args.get("q", "").strip()
    media_type = request.args.get("type", "all").lower()

    if not q:
        return jsonify({"error": "Missing query parameter 'q'"}), 400

    cache_key = f"search-{media_type}-{q}"
    cached_res = search_cache.get(cache_key)
    if cached_res is not None:
        return jsonify(cached_res)

    async def fetch():
        results = []
        async with MovieBoxHttpClient() as client:
            # Determine which types to search
            types_to_search = []
            if media_type in ("movie", "all"):
                types_to_search.append(("movie", SubjectType.MOVIES))
            if media_type in ("tv", "all"):
                types_to_search.append(("tv", SubjectType.TV_SERIES))

            for kind, subject_type in types_to_search:
                try:
                    searcher = Search(client, q, subject_type=subject_type)
                    raw = await searcher.get_content()
                    items = raw.get("items", [])
                    for item in items:
                        cover = item.get("cover") or {}
                        # Correct MovieBox's misclassifications using the native subjectType field
                        # subjectType: 1 = Movie, 2 = TV Series
                        real_type = "tv" if item.get("subjectType") == 2 else "movie"
                        
                        results.append({
                            "subject_id":   item.get("subjectId"),
                            "title":        item.get("title", ""),
                            "type":         real_type,
                            "cover_url":    cover.get("url") or item.get("coverUrl") or item.get("poster"),
                            "genre":        item.get("genre", ""),
                            "release_date": item.get("releaseDate", ""),
                            "year":         (item.get("releaseDate") or "")[:4],
                            "duration_sec": item.get("durationSeconds"),
                            "rating":       item.get("score"),
                        })
                except Exception as e:
                    log.warning("MovieBox search error for type %s: %s", kind, e)

        return results

    try:
        results = run_async(fetch())
        res_data = {"results": results, "query": q, "type": media_type}
        search_cache.set(cache_key, res_data)
        return jsonify(res_data)
    except Exception as e:
        log.error("Search failed: %s", e, exc_info=True)
        return jsonify({"error": str(e)}), 500


# ---- Movie Stream ----
@app.route("/api/moviebox/movie/<path:title>")
def get_movie_stream(title: str):
    try:
        async def fetch():
            async with MovieBoxHttpClient() as client:
                subject_id, item_title, release_date = await _search_title(
                    client, title, SubjectType.MOVIES
                )
                raw, files = await _get_streams(client, subject_id, release_date)
                
                best = pick_best(files)
                captions = []
                if best and best.get("resourceId"):
                    try:
                        captions_downloader = DownloadableCaptionFileDetails(client)
                        captions_raw = await captions_downloader.get_content(subject_id, best.get("resourceId"))
                        captions = captions_raw.get("extCaptions") or []
                    except Exception as e:
                        log.warning("Failed to fetch captions: %s", e)
                        
                return subject_id, item_title, raw, files, captions

        subject_id, item_title, raw, files, captions = run_async(fetch())

        if not files:
            # Log raw response for debugging
            log.warning("No files found. Raw keys: %s", list(raw.keys()))
            return jsonify({
                "error": "No stream files found for this movie",
                "raw_keys": list(raw.keys())
            }), 404

        best = pick_best(files)
        best_fmt = format_file(best)
        # durationSeconds comes from the raw API response (total movie length)
        duration_secs = raw.get("durationSeconds") or best.get("duration") or None
        return jsonify({
            "provider": "MovieBox",
            "title": item_title,
            "subject_id": subject_id,
            "url": best_fmt["url"],
            "resolution": best_fmt["resolution"],
            "format": best_fmt["format"],
            "codec": best_fmt["codec"],
            "duration": duration_secs,
            "all_streams": [format_file(f) for f in files],
            "subtitles": [
                {
                    "id": c.get("id"),
                    "lan": c.get("lan"),
                    "label": c.get("lanName"),
                    "url": c.get("url")
                } for c in captions
            ]
        })

    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        log.error("Movie fetch error: %s", e, exc_info=True)
        return jsonify({"error": str(e)}), 500


# ---- TV Episode Stream ----
@app.route("/api/moviebox/tv/<path:title>/<int:season>/<int:episode>")
def get_tv_stream(title: str, season: int, episode: int):
    try:
        async def fetch():
            async with MovieBoxHttpClient() as client:
                subject_id, item_title, release_date = await _search_title(
                    client, title, SubjectType.TV_SERIES
                )
                raw, files = await _get_episode_streams(client, subject_id, season, episode)
                
                best = pick_best(files)
                captions = []
                if best and best.get("resourceId"):
                    try:
                        captions_downloader = DownloadableCaptionFileDetails(client)
                        captions_raw = await captions_downloader.get_content(subject_id, best.get("resourceId"))
                        captions = captions_raw.get("extCaptions") or []
                    except Exception as e:
                        log.warning("Failed to fetch captions: %s", e)
                        
                return subject_id, item_title, raw, files, captions

        subject_id, item_title, raw, files, captions = run_async(fetch())

        if not files:
            log.warning("No files found. Raw keys: %s", list(raw.keys()))
            return jsonify({
                "error": "No stream files found for this episode",
                "raw_keys": list(raw.keys())
            }), 404

        best = pick_best(files)
        best_fmt = format_file(best)
        # For TV episodes: use the per-file duration from the FORMATTED item.
        # best.get("duration") is the RAW API field which holds the SEASON total.
        # best_fmt["duration"] is the mapped per-file duration (e.g. 2492s ≈ 41min).
        duration_secs = best_fmt.get("duration") or None
        return jsonify({
            "provider": "MovieBox",
            "title": item_title,
            "season": season,
            "episode": episode,
            "subject_id": subject_id,
            "url": best_fmt["url"],
            "resolution": best_fmt["resolution"],
            "format": best_fmt["format"],
            "codec": best_fmt["codec"],
            "duration": duration_secs,
            "all_streams": [format_file(f) for f in files],
            "subtitles": [
                {
                    "id": c.get("id"),
                    "lan": c.get("lan"),
                    "label": c.get("lanName"),
                    "url": c.get("url")
                } for c in captions
            ]
        })

    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        log.error("TV fetch error: %s", e, exc_info=True)
        return jsonify({"error": str(e)}), 500


# ---- Movie Stream (By Subject ID) ----
@app.route("/api/moviebox/stream/movie/<subject_id>")
def get_movie_stream_by_id(subject_id: str):
    try:
        async def fetch():
            async with MovieBoxHttpClient() as client:
                # 1. Try dynamic DASH play-info endpoint first
                try:
                    params = {"subjectId": str(subject_id)}
                    raw_play = await client.get_from_api(PLAY_INFO_PATH, params=params)
                    streams = raw_play.get("streams") or []
                    if streams and streams[0].get("url"):
                        st = streams[0]
                        st_id = st.get("id")
                        captions = []
                        if st_id:
                            try:
                                captions_downloader = DownloadableCaptionFileDetails(client)
                                captions_raw = await captions_downloader.get_content(str(subject_id), st_id)
                                captions = captions_raw.get("extCaptions") or []
                            except Exception as e:
                                log.warning("Failed to fetch captions via play-info: %s", e)
                        return "dash", raw_play, st, captions
                except Exception as e:
                    log.warning("Movie play-info failed, trying legacy resource path: %s", e)

                # 2. Fall back to legacy resource path
                raw, files = await _get_streams(client, subject_id, None)
                best = pick_best(files)
                captions = []
                if best and best.get("resourceId"):
                    try:
                        captions_downloader = DownloadableCaptionFileDetails(client)
                        captions_raw = await captions_downloader.get_content(subject_id, best.get("resourceId"))
                        captions = captions_raw.get("extCaptions") or []
                    except Exception as e:
                        log.warning("Failed to fetch captions: %s", e)
                return "legacy", raw, (best, files), captions

        mode, raw, stream_data, captions = run_async(fetch())

        if mode == "dash":
            policy, signature, key_pair_id = _parse_sign_cookie(stream_data.get("signCookie", ""))
            dash_url = stream_data.get("url")
            if policy and signature and key_pair_id:
                sep = "&" if "?" in dash_url else "?"
                dash_url = f"{dash_url}{sep}Policy={policy}&Signature={signature}&Key-Pair-Id={key_pair_id}"
            return jsonify({
                "provider": "MovieBox",
                "title": raw.get("title") or stream_data.get("title", ""),
                "subject_id": subject_id,
                "type": "dash",
                "url": dash_url,
                "policy": policy,
                "signature": signature,
                "keyPairId": key_pair_id,
                "resolution": 1080,
                "format": "DASH",
                "codec": stream_data.get("codecName") or "hevc",
                "duration": stream_data.get("duration"),
                "all_streams": [
                    {
                        "url": dash_url,
                        "resolution": 1080,
                        "format": "DASH",
                        "codec": stream_data.get("codecName") or "hevc",
                        "policy": policy,
                        "signature": signature,
                        "keyPairId": key_pair_id
                    }
                ],
                "subtitles": [
                    {
                        "id": c.get("id"),
                        "lan": c.get("lan"),
                        "label": c.get("lanName"),
                        "url": c.get("url")
                    } for c in captions
                ]
            })

        # Legacy fallback
        best, files = stream_data
        if not files or not best:
            return jsonify({"error": "No stream files found"}), 404

        best_fmt = format_file(best)
        duration_secs = raw.get("durationSeconds") or best.get("duration") or None
        return jsonify({
            "provider": "MovieBox",
            "title": raw.get("title") or raw.get("subjectTitle", ""),
            "subject_id": subject_id,
            "url": best_fmt["url"],
            "resolution": best_fmt["resolution"],
            "format": best_fmt["format"],
            "codec": best_fmt["codec"],
            "duration": duration_secs,
            "all_streams": [format_file(f) for f in files],
            "subtitles": [
                {
                    "id": c.get("id"),
                    "lan": c.get("lan"),
                    "label": c.get("lanName"),
                    "url": c.get("url")
                } for c in captions
            ]
        })
    except Exception as e:
        log.error("Movie fetch by ID error: %s", e, exc_info=True)
        return jsonify({"error": str(e)}), 500


# ---- TV Stream (By Subject ID) ----
@app.route("/api/moviebox/stream/tv/<subject_id>/<int:season>/<int:episode>")
def get_tv_stream_by_id(subject_id: str, season: int, episode: int):
    try:
        async def fetch():
            async with MovieBoxHttpClient() as client:
                # 1. Try dynamic DASH play-info endpoint first
                try:
                    params = {"subjectId": str(subject_id), "se": season, "ep": episode}
                    raw_play = await client.get_from_api(PLAY_INFO_PATH, params=params)
                    streams = raw_play.get("streams") or []
                    if streams and streams[0].get("url"):
                        st = streams[0]
                        st_id = st.get("id")
                        captions = []
                        if st_id:
                            try:
                                captions_downloader = DownloadableCaptionFileDetails(client)
                                captions_raw = await captions_downloader.get_content(str(subject_id), st_id)
                                captions = captions_raw.get("extCaptions") or []
                            except Exception as e:
                                log.warning("Failed to fetch captions via play-info: %s", e)
                        return "dash", raw_play, st, captions
                except Exception as e:
                    log.warning("TV play-info failed, trying legacy resource path: %s", e)

                # 2. Fall back to legacy resource path
                raw, files = await _get_episode_streams(client, subject_id, season, episode)
                best = pick_best(files)
                captions = []
                if best and best.get("resourceId"):
                    try:
                        captions_downloader = DownloadableCaptionFileDetails(client)
                        captions_raw = await captions_downloader.get_content(subject_id, best.get("resourceId"))
                        captions = captions_raw.get("extCaptions") or []
                    except Exception as e:
                        log.warning("Failed to fetch captions: %s", e)
                return "legacy", raw, (best, files), captions

        mode, raw, stream_data, captions = run_async(fetch())

        if mode == "dash":
            policy, signature, key_pair_id = _parse_sign_cookie(stream_data.get("signCookie", ""))
            dash_url = stream_data.get("url")
            if policy and signature and key_pair_id:
                sep = "&" if "?" in dash_url else "?"
                dash_url = f"{dash_url}{sep}Policy={policy}&Signature={signature}&Key-Pair-Id={key_pair_id}"
            return jsonify({
                "provider": "MovieBox",
                "title": raw.get("title") or stream_data.get("title", ""),
                "season": season,
                "episode": episode,
                "subject_id": subject_id,
                "type": "dash",
                "url": dash_url,
                "policy": policy,
                "signature": signature,
                "keyPairId": key_pair_id,
                "resolution": 1080,
                "format": "DASH",
                "codec": stream_data.get("codecName") or "hevc",
                "duration": stream_data.get("duration"),
                "all_streams": [
                    {
                        "url": dash_url,
                        "resolution": 1080,
                        "format": "DASH",
                        "codec": stream_data.get("codecName") or "hevc",
                        "policy": policy,
                        "signature": signature,
                        "keyPairId": key_pair_id
                    }
                ],
                "subtitles": [
                    {
                        "id": c.get("id"),
                        "lan": c.get("lan"),
                        "label": c.get("lanName"),
                        "url": c.get("url")
                    } for c in captions
                ]
            })

        # Legacy fallback
        best, files = stream_data
        if not files or not best:
            return jsonify({"error": "No stream files found"}), 404

        best_fmt = format_file(best)
        duration_secs = best_fmt.get("duration") or None
        return jsonify({
            "provider": "MovieBox",
            "title": raw.get("title") or raw.get("subjectTitle", ""),
            "season": season,
            "episode": episode,
            "subject_id": subject_id,
            "url": best_fmt["url"],
            "resolution": best_fmt["resolution"],
            "format": best_fmt["format"],
            "codec": best_fmt["codec"],
            "duration": duration_secs,
            "all_streams": [format_file(f) for f in files],
            "subtitles": [
                {
                    "id": c.get("id"),
                    "lan": c.get("lan"),
                    "label": c.get("lanName"),
                    "url": c.get("url")
                } for c in captions
            ]
        })
    except Exception as e:
        log.error("TV fetch by ID error: %s", e, exc_info=True)
        return jsonify({"error": str(e)}), 500

@app.route("/api/moviebox/home")
def get_moviebox_home():
    """Fetch native MovieBox homepage (curated rows and banners)."""
    cache_key = "home_data"
    cached_res = home_cache.get(cache_key)
    if cached_res is not None:
        return jsonify(cached_res)

    try:
        async def fetch():
            async with MovieBoxHttpClient() as client:
                home = Homepage(client)
                return await home.get_content()
                
        raw = run_async(fetch())
        home_cache.set(cache_key, raw)
        return jsonify(raw)
    except Exception as e:
        log.error("Home fetch error: %s", e, exc_info=True)
        return jsonify({"error": str(e)}), 500


# ---- MovieBox Info & Seasons APIs (Native metadata) ----
@app.route("/api/moviebox/info/<subject_id>")
def get_moviebox_info(subject_id: str):
    """Fetch native MovieBox metadata for a subject."""
    try:
        async def fetch():
            async with MovieBoxHttpClient() as client:
                return await client.get_from_api(SUBJECT_GET_PATH, params={"subjectId": subject_id})
                
        raw = run_async(fetch())
        return jsonify(raw)
    except Exception as e:
        log.error("Info fetch error: %s", e, exc_info=True)
        return jsonify({"error": str(e)}), 500

@app.route("/api/moviebox/seasons/<subject_id>")
def get_moviebox_seasons(subject_id: str):
    """Fetch native MovieBox season/episode listing for a subject."""
    try:
        async def fetch():
            async with MovieBoxHttpClient() as client:
                return await client.get_from_api(SEASON_INFO_PATH, params={"subjectId": subject_id})
                
        raw = run_async(fetch())
        return jsonify(raw)
    except Exception as e:
        log.error("Seasons fetch error: %s", e, exc_info=True)
        return jsonify({"error": str(e)}), 500


# ---- Debug: Raw response ----
@app.route("/api/moviebox/debug/<path:title>")
def debug_movie(title: str):
    """Returns the raw API response for debugging."""
    try:
        async def fetch():
            async with MovieBoxHttpClient() as client:
                subject_id, item_title, release_date = await _search_title(
                    client, title, SubjectType.MOVIES
                )
                raw, files = await _get_streams(client, subject_id, release_date)
                return subject_id, item_title, raw, files

        subject_id, item_title, raw, files = run_async(fetch())
        return jsonify({"subject_id": subject_id, "title": item_title, "raw": raw})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    print("\n  [*] PlayerIQ Python Bridge running at http://localhost:8789")
    print("  [*] Health: http://localhost:8789/api/health")
    print("  [*] Movie:  http://localhost:8789/api/moviebox/movie/Avengers")
    print("  [*] TV:     http://localhost:8789/api/moviebox/tv/The+Boys/1/1")
    print("  [*] Debug:  http://localhost:8789/api/moviebox/debug/Avengers\n")
    app.run(host="0.0.0.0", port=8789, debug=False, use_reloader=False)
