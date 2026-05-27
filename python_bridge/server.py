#!/usr/bin/env python3
# ========================================
# PlayerIQ -- MovieBox Python Bridge
# Flask microservice: Node.js -> MovieBox API
# Port: 8789
# ========================================

import asyncio
import logging
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


async def _get_episode_streams(client, subject_id: str, season: int, episode: int):
    """Fetch streams for a specific TV episode by paginating until the right S/E is found."""
    # MovieBox ignores se/ep filter params — it returns all episodes paginated sequentially.
    # We must paginate through pages until we find the episode with the matching se+ep.
    MAX_PAGES = 20  # Hard cap to avoid infinite loops

    for page in range(1, MAX_PAGES + 1):
        try:
            params = {
                "subjectId": subject_id,
                "resolution": 1080,
                "page": page,
                "perPage": 20,
            }
            raw = await client.get_from_api(RESOURCE_PATH, params=params)
            items = raw.get("list") or raw.get("mediaFiles") or raw.get("streams") or []

            if not items:
                break  # No more pages

            # Find the specific episode
            match = next((f for f in items if f.get("se") == season and f.get("ep") == episode), None)
            if match:
                return raw, [match]

            # Optimization: if all episodes on this page are past our target season,
            # we've overshot — stop searching.
            max_season_on_page = max((f.get("se") or 0) for f in items)
            if max_season_on_page > season:
                break

        except Exception as e:
            log.warning("Failed to fetch page %d for episode streams: %s", page, e)
            break

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
        return jsonify({"results": results, "query": q, "type": media_type})
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
                        
                return raw, files, captions

        raw, files, captions = run_async(fetch())

        if not files:
            return jsonify({"error": "No stream files found"}), 404

        best = pick_best(files)
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
                        
                return raw, files, captions

        raw, files, captions = run_async(fetch())

        if not files:
            return jsonify({"error": "No stream files found"}), 404

        best = pick_best(files)
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
        return jsonify({"error": str(e)}), 500

@app.route("/api/moviebox/home")
def get_moviebox_home():
    """Fetch native MovieBox homepage (curated rows and banners)."""
    try:
        async def fetch():
            async with MovieBoxHttpClient() as client:
                home = Homepage(client)
                return await home.get_content()
                
        raw = run_async(fetch())
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
