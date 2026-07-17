// Shared helpers for both the comparison page (index.html/app.js) and the
// multi-tile load-test page (grid.html/grid.js).

/** Base URL for this tool (works at / on :8090 or under /camera-finder/ via nginx). */
function toolBase() {
  // .../camera-finder/ or .../camera-finder/index.html → .../camera-finder/
  const path = location.pathname.replace(/\/[^/]*$/, '/');
  return path.endsWith('/') ? path : path + '/';
}

export async function fetchStreams() {
  try {
    const res = await fetch(new URL('api/streams', location.href));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('Failed to load stream list from go2rtc /api/streams', err);
    return {};
  }
}

/**
 * All the URL formats other applications could use to consume a given
 * go2rtc stream, independent of which delivery method is currently selected
 * in this test page's UI.
 */
export function buildStreamUrls(streamName) {
  const httpOrigin = location.origin;
  const wsOrigin = httpOrigin.replace(/^http/, 'ws');
  const encoded = encodeURIComponent(streamName);
  const base = toolBase();
  // Prefer the nginx /go2rtc/ proxy for embed URLs (same-host, Tailscale-safe).
  // Fall back to this tool's /api/ proxy when opened directly on :8090.
  const go2rtcHttp = `${httpOrigin}/go2rtc`;
  const go2rtcWs = `${wsOrigin}/go2rtc`;
  const localApi = `${httpOrigin}${base}api`;
  const localWs = `${wsOrigin}${base}api`;
  const viaNginx = location.port === '' || location.port === '80' || location.port === '443';
  const apiHttp = viaNginx ? go2rtcHttp : localApi;
  const apiWs = viaNginx ? go2rtcWs : localWs;
  return {
    // WebRTC/MSE signaling (what go2rtc's own video-rtc.js-based players use).
    ws: `${apiWs}/ws?src=${encoded}`,
    hls: `${apiHttp}/stream.m3u8?src=${encoded}`,
    mp4: `${apiHttp}/stream.mp4?src=${encoded}`,
    mjpeg: `${apiHttp}/stream.mjpeg?src=${encoded}`,
    // Path form for pasting into PxD room.json camera-view wsUrl:
    embedPath: `/go2rtc/api/ws?src=${encoded}`,
    // RTSP restream isn't proxied through nginx - go2rtc exposes it on :8554.
    rtsp: `rtsp://${location.hostname}:8554/${streamName}`,
  };
}

/** Pick the most directly-usable URL for the given delivery mode. */
export function urlForMode(streamName, mode) {
  const urls = buildStreamUrls(streamName);
  if (mode === 'hls') return urls.hls;
  if (mode === 'mjpeg') return urls.mjpeg;
  if (mode === 'mp4') return urls.mp4;
  // webrtc, webrtc/tcp, mse, or multi-mode "auto" all negotiate over the
  // go2rtc websocket API - that's the URL a video-rtc.js-based embed needs.
  return urls.ws;
}

/** Copy text to the clipboard, falling back to a hidden textarea + execCommand
 * for non-secure contexts (plain http:// on a LAN, no clipboard API). */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

/** Wire up the CPU/Mem/Net readout in the header. Returns the interval ID. */
export function startResourcePolling({ cpuEl, memEl, netEl, errEl }, intervalMs = 2000) {
  async function poll() {
    try {
      const res = await fetch(new URL('monitor/stats', location.href));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      cpuEl.textContent = data.CPUPerc ?? '–';
      memEl.textContent = data.MemUsage ?? '–';
      netEl.textContent = data.NetIO ?? '–';
      errEl.textContent = '';
    } catch (err) {
      errEl.textContent = `monitor unavailable: ${err.message}`;
    }
  }
  poll();
  return setInterval(poll, intervalMs);
}

/**
 * Mount (or unmount, if streamName is falsy) a <video-stream> element inside
 * `holder`. Never sets `background`, so removing/replacing the element always
 * cleanly disconnects the underlying WebSocket/RTSP/ffmpeg pipeline - do not
 * add `video.background = true` here, it breaks cleanup on unmount.
 */
export function mountVideo(holder, streamName, mode, dimsEl) {
  holder.innerHTML = '';
  if (dimsEl) dimsEl.textContent = '';
  if (!streamName) return null;

  const video = document.createElement('video-stream');
  video.mode = mode;
  holder.appendChild(video);
  // Must be set after the element is in the DOM; triggers the websocket connect.
  // Prefer nginx /go2rtc/ when served on :80 so MSE works over Tailscale too.
  const viaNginx = location.port === '' || location.port === '80' || location.port === '443';
  video.src = viaNginx
    ? `${location.origin}/go2rtc/api/ws?src=${encodeURIComponent(streamName)}`
    : new URL(`api/ws?src=${encodeURIComponent(streamName)}`, location.href).href;

  if (dimsEl) {
    const vid = video.querySelector('video');
    vid?.addEventListener('loadedmetadata', () => {
      dimsEl.textContent = `${vid.videoWidth}x${vid.videoHeight}`;
    });
  }
  return video;
}
