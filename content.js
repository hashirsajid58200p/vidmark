// VidMark - Content Script

// Guard against redeclaration errors due to multiple frame injections or SPA routing transitions
if (window.vidMarkLoaded) {
  // Re-register frame immediately to recover state mappings if service worker restarted
  chrome.runtime.sendMessage({ action: "REGISTER_VIDEO_FRAME" }, () => {
    if (chrome.runtime.lastError) { /* ignore runtime disconnect */ }
  });
  
  // Refresh checkpoints
  initTimelineCheckpoints();
} else {
  window.vidMarkLoaded = true;
  initVidMarkContentScript();
}

function initVidMarkContentScript() {
  // Helper to format seconds into HH:MM:SS or MM:SS
  function formatTime(secs) {
    const s = Math.floor(secs);
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const seconds = s % 60;

    const pad = (n) => String(n).padStart(2, "0");

    if (hours > 0) {
      return `${hours}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  }

  // Helper to extract YouTube video ID from URL
  function getYoutubeVideoId(url) {
    try {
      const urlObj = new URL(url);
      if (urlObj.hostname.includes('youtube.com')) {
        return urlObj.searchParams.get('v');
      } else if (urlObj.hostname.includes('youtu.be')) {
        return urlObj.pathname.substring(1);
      }
    } catch (e) {
      console.error("Error parsing URL for YouTube ID:", e);
    }
    return null;
  }

  // Helper to normalize the URL by stripping session / seek query parameters
  function getNormalizedUrl(rawUrl) {
    try {
      const url = new URL(rawUrl);
      url.searchParams.delete('t');
      url.searchParams.delete('time_continue');
      url.searchParams.delete('start');
      if (url.hash && url.hash.startsWith('#t=')) {
        url.hash = '';
      }
      return url.toString();
    } catch (e) {
      return rawUrl;
    }
  }

  // Smarter title extractor: extracts YouTube watch title or cleans tab document titles
  function getCleanTitle() {
    let title = "";
    
    // Check if on YouTube and try targeting watch metadata title header
    if (window.location.hostname.includes("youtube.com")) {
      const ytTitleEl = document.querySelector('h1.ytd-video-primary-info-renderer, ytd-watch-metadata h1');
      if (ytTitleEl) {
        title = ytTitleEl.textContent.trim();
      }
    }
    
    // Fallback to tab document title
    if (!title) {
      title = document.title || "Video";
    }
    
    // Clean tab title: strip notification brackets (e.g. "(35) Video Title" or "[12] Video Title")
    title = title.replace(/^\([\d+]+\)\s*/, "").replace(/^\[[\d+]+\]\s*/, "");
    
    // Truncate to first 3-4 words
    const words = title.split(/\s+/);
    if (words.length > 4) {
      return words.slice(0, 4).join(" ") + "...";
    }
    return title;
  }

  // Function to find the most appropriate video element on the page
  function findVideo() {
    const videos = Array.from(document.querySelectorAll('video'));
    if (videos.length === 0) return null;

    // 1. If any video is currently playing, prioritize it
    const playingVideos = videos.filter(v => !v.paused && !v.ended);
    if (playingVideos.length > 0) {
      return playingVideos.sort((a, b) => {
        const aSize = a.offsetWidth * a.offsetHeight;
        const bSize = b.offsetWidth * b.offsetHeight;
        return bSize - aSize;
      })[0];
    }

    // 2. Otherwise, return the largest video element present in the DOM
    return videos.sort((a, b) => {
      const aSize = a.offsetWidth * a.offsetHeight;
      const bSize = b.offsetWidth * b.offsetHeight;
      return bSize - aSize;
    })[0];
  }

  // Helper to clear custom universal overlay progress timelines
  function clearUniversalTimeline() {
    const el = document.querySelector('.vidmark-universal-timeline');
    if (el) el.remove();
  }

  // Get YouTube progress bar OR create a custom absolute-positioned universal timeline
  function getOrCreateUniversalTimeline(video) {
    const ytProgress = document.querySelector('.ytp-progress-list');
    if (ytProgress) {
      return ytProgress;
    }

    let universalTimeline = document.querySelector('.vidmark-universal-timeline');
    if (!universalTimeline && video && video.parentElement) {
      universalTimeline = document.createElement('div');
      universalTimeline.className = 'vidmark-universal-timeline';
      
      universalTimeline.style.position = 'absolute';
      universalTimeline.style.bottom = '12px';
      universalTimeline.style.left = '16px';
      universalTimeline.style.right = '16px';
      universalTimeline.style.height = '4px';
      universalTimeline.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
      universalTimeline.style.borderRadius = '2px';
      universalTimeline.style.zIndex = '2147483645'; 
      universalTimeline.style.pointerEvents = 'none';

      // Enforce relative position on parent to position absolute children correctly
      const parent = video.parentElement;
      if (window.getComputedStyle(parent).position === 'static') {
        parent.style.position = 'relative';
      }
      parent.appendChild(universalTimeline);
    }
    return universalTimeline;
  }

  // Render visual markers ("Blue Dots") on the player timeline
  function renderTimelineCheckpoints() {
    try {
      const video = findVideo();
      if (!video || !video.duration) {
        return;
      }

      document.querySelectorAll('.vidmark-checkpoint').forEach(el => el.remove());

      const url = getNormalizedUrl(window.location.href);
      const storageKey = `vidmark_bm_${url}`;

      chrome.storage.local.get([storageKey], (result) => {
        const bookmarks = result[storageKey] || [];
        if (bookmarks.length === 0) {
          clearUniversalTimeline();
          return;
        }

        const progressContainer = getOrCreateUniversalTimeline(video);
        if (!progressContainer) return;

        bookmarks.forEach(bm => {
          const pct = (bm.time / video.duration) * 100;
          if (isNaN(pct) || pct < 0 || pct > 100) return;

          const dot = document.createElement('div');
          dot.className = 'vidmark-checkpoint';
          
          dot.style.position = 'absolute';
          dot.style.left = `${pct}%`;
          dot.style.top = '50%';
          dot.style.width = '8px';
          dot.style.height = '8px';
          dot.style.backgroundColor = '#00d1ff';
          dot.style.borderRadius = '50%';
          dot.style.transform = 'translate(-50%, -50%)';
          dot.style.boxShadow = '0 0 8px #00d1ff, 0 0 2px rgba(255,255,255,0.8)';
          dot.style.zIndex = '2147483646'; 
          dot.style.pointerEvents = 'none';

          progressContainer.appendChild(dot);
        });
      });
    } catch (err) {
      console.error("VidMark: Timeline dot rendering error:", err);
    }
  }

  // Capture current video frame using Canvas API (CORS handled)
  function captureVideoFrame(video) {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 320;
      canvas.height = video.videoHeight || 180;
      
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      return canvas.toDataURL('image/jpeg', 0.5);
    } catch (e) {
      console.warn("VidMark: Media frame capture bypassed due to CORS origin constraints or frame load parameters.", e.message);
      return null;
    }
  }

  // Register frame details with service worker background page
  function registerVideoFrame() {
    chrome.runtime.sendMessage({ action: "REGISTER_VIDEO_FRAME" }, () => {
      if (chrome.runtime.lastError) { /* ignore runtime disconnect */ }
    });
  }

  // Hook up video metadata/duration listeners to re-render dots
  function initTimelineCheckpoints() {
    const video = findVideo();
    if (video) {
      video.removeEventListener('durationchange', renderTimelineCheckpoints);
      video.removeEventListener('loadedmetadata', renderTimelineCheckpoints);
      
      video.addEventListener('durationchange', renderTimelineCheckpoints);
      video.addEventListener('loadedmetadata', renderTimelineCheckpoints);
    }
    renderTimelineCheckpoints();
  }

  // Listen for messages from the popup UI or background service worker
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "GET_VIDEO_STATE") {
      const video = findVideo();
      if (!video) {
        sendResponse({ found: false });
        return true; 
      }

      const url = getNormalizedUrl(window.location.href);
      const ytId = getYoutubeVideoId(url);
      
      // Fallback: If not YouTube, immediately grab canvas screen capture to use as header main thumbnail
      const thumbnail = ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : captureVideoFrame(video);
      const cleanTitle = getCleanTitle();

      sendResponse({
        found: true,
        title: cleanTitle,
        url: url,
        currentTime: video.currentTime,
        duration: video.duration || 0,
        thumbnail: thumbnail
      });
    } 
    
    else if (request.action === "SEEK_VIDEO") {
      const video = findVideo();
      if (video) {
        video.currentTime = request.time;
        video.play()
          .then(() => sendResponse({ success: true }))
          .catch(err => {
            console.warn("VidMark: Playback resume was blocked by browser autoplay rules.", err);
            sendResponse({ success: true, playBlocked: true });
          });
      } else {
        sendResponse({ success: false, error: "No active video found on page." });
      }
      return true; 
    }
    
    else if (request.action === "UPDATE_CHECKPOINTS") {
      renderTimelineCheckpoints();
      sendResponse({ success: true });
    }

    else if (request.action === "QUICK_MARK") {
      const video = findVideo();
      if (video) {
        const time = video.currentTime;
        const url = getNormalizedUrl(window.location.href);
        const storageKey = `vidmark_bm_${url}`;
        
        chrome.storage.local.get([storageKey], (result) => {
          const bookmarks = result[storageKey] || [];
          const existingIndex = bookmarks.findIndex(bm => Math.floor(bm.time) === Math.floor(time));
          
          if (existingIndex === -1) {
            const defaultNote = getCleanTitle();
            const thumbnail = captureVideoFrame(video);
            
            bookmarks.push({ time, note: defaultNote, thumbnail });
            bookmarks.sort((a, b) => a.time - b.time);
            
            chrome.storage.local.set({ [storageKey]: bookmarks }, () => {
              renderTimelineCheckpoints();
              sendResponse({ success: true, time });
            });
          } else {
            sendResponse({ success: false, error: "Bookmark already exists at this timestamp." });
          }
        });
        return true; 
      } else {
        sendResponse({ success: false, error: "No active video element found to bookmark." });
      }
      return true;
    }
    
    return true; 
  });

  // Initial injection polling loop
  let lastUrl = getNormalizedUrl(window.location.href);
  let initAttempts = 0;

  const initInterval = setInterval(() => {
    initAttempts++;
    const video = findVideo();

    if (video) {
      registerVideoFrame();
      initTimelineCheckpoints();
      clearInterval(initInterval);
    } else if (initAttempts > 20) {
      clearInterval(initInterval);
    }
  }, 1000);

  // Detect SPA router page navigations via URL check
  setInterval(() => {
    const currentNormalizedUrl = getNormalizedUrl(window.location.href);
    if (currentNormalizedUrl !== lastUrl) {
      lastUrl = currentNormalizedUrl;
      setTimeout(() => {
        registerVideoFrame();
        initTimelineCheckpoints();
      }, 1000);
    }
  }, 1000);

  // Detect YouTube SPA navigation finish events
  document.addEventListener('yt-navigate-finish', () => {
    setTimeout(() => {
      registerVideoFrame();
      initTimelineCheckpoints();
    }, 1000);
    
    setTimeout(() => {
      registerVideoFrame();
      initTimelineCheckpoints();
    }, 3000); 
  });
}

// Global timeline dot checkpoints refresh helper
function initTimelineCheckpoints() {
  const ytProgress = document.querySelector('.ytp-progress-list');
  const universalTimeline = document.querySelector('.vidmark-universal-timeline');
  const checkpoints = document.querySelectorAll('.vidmark-checkpoint');
  
  // If checkpoints list is already rendered, skip redrawing
  if (checkpoints.length > 0 && (ytProgress || universalTimeline)) {
    return;
  }
  
  // Find video element
  const video = Array.from(document.querySelectorAll('video')).sort((a, b) => {
    const aSize = a.offsetWidth * a.offsetHeight;
    const bSize = b.offsetWidth * b.offsetHeight;
    return bSize - aSize;
  })[0];
  
  if (!video || !video.duration) return;

  const getNormalizedUrl = (rawUrl) => {
    try {
      const url = new URL(rawUrl);
      url.searchParams.delete('t');
      url.searchParams.delete('time_continue');
      url.searchParams.delete('start');
      if (url.hash && url.hash.startsWith('#t=')) {
        url.hash = '';
      }
      return url.toString();
    } catch (e) {
      return rawUrl;
    }
  };

  const url = getNormalizedUrl(window.location.href);
  const storageKey = `vidmark_bm_${url}`;

  chrome.storage.local.get([storageKey], (result) => {
    const bookmarks = result[storageKey] || [];
    if (bookmarks.length === 0) return;

    let progressContainer = ytProgress;
    if (!progressContainer) {
      if (!universalTimeline && video.parentElement) {
        progressContainer = document.createElement('div');
        progressContainer.className = 'vidmark-universal-timeline';
        progressContainer.style.position = 'absolute';
        progressContainer.style.bottom = '12px';
        progressContainer.style.left = '16px';
        progressContainer.style.right = '16px';
        progressContainer.style.height = '4px';
        progressContainer.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
        progressContainer.style.borderRadius = '2px';
        progressContainer.style.zIndex = '2147483645';
        progressContainer.style.pointerEvents = 'none';

        const parent = video.parentElement;
        if (window.getComputedStyle(parent).position === 'static') {
          parent.style.position = 'relative';
        }
        parent.appendChild(progressContainer);
      } else {
        progressContainer = universalTimeline;
      }
    }

    if (!progressContainer) return;
    
    // Clear old checkpoints
    document.querySelectorAll('.vidmark-checkpoint').forEach(el => el.remove());

    bookmarks.forEach(bm => {
      const pct = (bm.time / video.duration) * 100;
      if (isNaN(pct) || pct < 0 || pct > 100) return;

      const dot = document.createElement('div');
      dot.className = 'vidmark-checkpoint';
      dot.style.position = 'absolute';
      dot.style.left = `${pct}%`;
      dot.style.top = '50%';
      dot.style.width = '8px';
      dot.style.height = '8px';
      dot.style.backgroundColor = '#00d1ff';
      dot.style.borderRadius = '50%';
      dot.style.transform = 'translate(-50%, -50%)';
      dot.style.boxShadow = '0 0 8px #00d1ff, 0 0 2px rgba(255,255,255,0.8)';
      dot.style.zIndex = '2147483646';
      dot.style.pointerEvents = 'none';

      progressContainer.appendChild(dot);
    });
  });
}
