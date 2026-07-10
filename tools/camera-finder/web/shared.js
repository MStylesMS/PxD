// Shared helpers for both the comparison page (index.html/app.js) and the
// multi-tile load-test page (grid.html/grid.js).

export async function fetchStreams() {
  try {
    const res = await fetch('/api/streams');
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
  return {
    // WebRTC/MSE signaling (what go2rtc's own video-rtc.js-based players use).
    ws: `${wsOrigin}/api/ws?src=${encoded}`,
    hls: `${httpOrigin}/api/stream.m3u8?src=${encoded}`,
    mp4: `${httpOrigin}/api/stream.mp4?src=${encoded}`,
    mjpeg: `${httpOrigin}/api/stream.mjpeg?src=${encoded}`,
    // RTSP restream isn't proxied through nginx - go2rtc's host networking
    // exposes it directly on the Pi's own address, port 8554.
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
      const res = await fetch('/monitor/stats');
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
  video.src = new URL(`api/ws?src=${encodeURIComponent(streamName)}`, location.href);

  if (dimsEl) {
    const vid = video.querySelector('video');
    vid?.addEventListener('loadedmetadata', () => {
      dimsEl.textContent = `${vid.videoWidth}x${vid.videoHeight}`;
    });
  }
  return video;
}
