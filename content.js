(function() {
  if (window.vidMarkLoaded) {
    try {
      if (chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: "REGISTER_VIDEO_FRAME" }, () => {
          if (chrome.runtime.lastError) { /* ignore runtime disconnect */ }
        });
      }
    } catch (e) {
      // Ignore context invalidation errors
    }
    if (typeof window.initTimelineCheckpoints === 'function') {
      window.initTimelineCheckpoints();
    }
    return;
  }
  window.vidMarkLoaded = true;

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
    if (window.location.hostname.includes("youtube.com")) {
      const ytTitleEl = document.querySelector('h1.ytd-video-primary-info-renderer, ytd-watch-metadata h1');
      if (ytTitleEl) {
        title = ytTitleEl.textContent.trim();
      }
    }
    if (!title) {
      title = document.title || "Video";
    }
    title = title.replace(/^\([\d+]+\)\s*/, "").replace(/^\[[\d+]+\]\s*/, "");
    const words = title.split(/\s+/);
    if (words.length > 4) {
      return words.slice(0, 4).join(" ") + "...";
    }
    return title;
  }

  // Function to find the most appropriate video element on the page using a robust scoring system
  function findVideo() {
    const videos = Array.from(document.querySelectorAll('video'));
    if (videos.length === 0) return null;

    const scoredVideos = videos.map(v => {
      const isPlaying = !v.paused && !v.ended;
      const width = v.offsetWidth || v.videoWidth || 0;
      const height = v.offsetHeight || v.videoHeight || 0;
      const size = width * height;
      const duration = (v.duration && !isNaN(v.duration)) ? v.duration : 0;
      const currentTime = (v.currentTime && !isNaN(v.currentTime)) ? v.currentTime : 0;
      
      let score = 0;
      
      // If the video is extremely small (like tracking pixels or hidden elements), penalize it heavily
      if (width < 10 || height < 10) {
        score -= 10000000;
      }
      
      // Duration is the primary indicator of content vs ads/loops
      if (duration > 45) {
        score += 2000000; // Big bonus for real content
      }
      
      score += duration * 100; // Longer videos get higher score
      
      if (isPlaying) {
        score += 500000; // Bonus if currently playing
      }
      
      score += size; // Larger layout gets higher score
      
      if (currentTime > 0) {
        score += 50000; // Bonus if user has interacted/played it
      }
      
      return { video: v, score };
    });

    scoredVideos.sort((a, b) => b.score - a.score);
    return scoredVideos[0].video;
  }

  // Check if a video element is likely the main content video on the page
  function isMainVideo(video) {
    if (!video) return false;
    
    const width = video.offsetWidth || video.videoWidth || 0;
    const height = video.offsetHeight || video.videoHeight || 0;
    const duration = video.duration;
    
    // If duration is loaded and <= 45 seconds, it is likely an ad/preview, do not register!
    if (duration && !isNaN(duration) && duration <= 45) {
      return false;
    }
    
    // If it's too small (width < 200 or height < 100), do not register!
    if (width > 0 && height > 0 && (width < 200 || height < 100)) {
      return false;
    }
    
    return true;
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
    try {
      if (chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: "REGISTER_VIDEO_FRAME" }, () => {
          if (chrome.runtime.lastError) { /* ignore runtime disconnect */ }
        });
      }
    } catch (e) {
      // Ignore context invalidation errors
    }
  }

  // Search for common player progress bar elements (in both specific and generic containers, ignoring hidden state checks for initial matching)
  function findNativeTimeline() {
    const specificSelectors = [
      '.ytp-progress-list',             // YouTube
      '.vjs-progress-holder',           // Video.js
      '.vjs-progress-control',
      '.plyr__progress',                // Plyr
      '.plyr__progress__container',
      '.jw-slider-time',                // JW Player
      '.jw-progress',
      '.dplayer-bar-wrap',              // DPlayer
      '.art-control-progress',          // ArtPlayer
      '.bar-container',                 // Clappr
      '.wmp-progress-bar'               // Generic styles
    ];

    for (const selector of specificSelectors) {
      const el = document.querySelector(selector);
      if (el) return el;
    }

    const genericSelectors = [
      '[class*="progress-bar"]',
      '[class*="progress-control"]',
      '[class*="progress-holder"]',
      '[class*="progress"]',
      '[class*="slider"]',
      '[class*="scrub"]',
      '[class*="seek"]',
      '[class*="timeline"]'
    ];

    for (const selector of genericSelectors) {
      const elements = Array.from(document.querySelectorAll(selector));
      for (const el of elements) {
        const className = (el.className || "").toString().toLowerCase();
        // Exclude volume bars, tooltips, buffers, loaders, etc.
        if (
          className.includes('volume') ||
          className.includes('tooltip') ||
          className.includes('buffer') ||
          className.includes('load') ||
          className.includes('preview') ||
          className.includes('marker') ||
          className.includes('checkpoint')
        ) {
          continue;
        }
        
        if (el.tagName === 'DIV' || el.tagName === 'SPAN' || el.tagName === 'INPUT') {
          return el;
        }
      }
    }
    return null;
  }

  // Extract page metadata images (og:image / twitter:image) to use as high-quality video covers
  function getMetaThumbnail() {
    try {
      const selectors = [
        'meta[property="og:image"]',
        'meta[name="twitter:image"]',
        'meta[property="twitter:image"]',
        'link[rel="image_src"]',
        'link[rel="icon"]',
        'meta[name="thumbnail"]'
      ];
      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el) {
          const content = el.getAttribute('content') || el.getAttribute('href');
          if (content && content.startsWith('http')) {
            return content;
          }
        }
      }
    } catch (e) {
      console.warn("VidMark: Metadata thumbnail parse failed.", e.message);
    }
    return null;
  }

  // Helper to clear custom universal overlay progress timelines
  function clearUniversalTimeline() {
    const el = document.querySelector('.vidmark-universal-timeline');
    if (el) el.remove();
  }

  // Get native progress bar OR create a custom invisible timeline container
  function getOrCreateUniversalTimeline(video) {
    let nativeTimeline = findNativeTimeline();
    if (nativeTimeline) {
      // If the matched progress bar is an INPUT tag (e.g. Plyr <input type="range">),
      // we must use its parent container because inputs cannot have child elements in HTML.
      if (nativeTimeline.tagName === 'INPUT') {
        nativeTimeline = nativeTimeline.parentElement;
      }
      clearUniversalTimeline();
      return nativeTimeline;
    }

    let universalTimeline = document.querySelector('.vidmark-universal-timeline');
    if (!universalTimeline && video && video.parentElement) {
      universalTimeline = document.createElement('div');
      universalTimeline.className = 'vidmark-universal-timeline';
      
      // Absolute positioning at the bottom, but transparent and height-less so it doesn't draw a second line
      universalTimeline.style.position = 'absolute';
      universalTimeline.style.bottom = '8px';
      universalTimeline.style.left = '12px';
      universalTimeline.style.right = '12px';
      universalTimeline.style.height = '0px';
      universalTimeline.style.backgroundColor = 'transparent';
      universalTimeline.style.zIndex = '2147483645'; 
      universalTimeline.style.pointerEvents = 'none';

      // Enforce relative positioning on the parent container
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

  // Hook up video metadata/duration/play/pause listeners to re-render dots and re-register frames
  function initTimelineCheckpoints() {
    const video = findVideo();
    if (video) {
      video.removeEventListener('durationchange', renderTimelineCheckpoints);
      video.removeEventListener('loadedmetadata', renderTimelineCheckpoints);
      video.removeEventListener('play', handleVideoStateChange);
      video.removeEventListener('pause', handleVideoStateChange);
      
      video.addEventListener('durationchange', renderTimelineCheckpoints);
      video.addEventListener('loadedmetadata', renderTimelineCheckpoints);
      video.addEventListener('play', handleVideoStateChange);
      video.addEventListener('pause', handleVideoStateChange);
    }
    renderTimelineCheckpoints();
  }

  function handleVideoStateChange() {
    const video = findVideo();
    if (video && isMainVideo(video)) {
      registerVideoFrame();
    }
    renderTimelineCheckpoints();
  }

  // Expose function for reinjections
  window.initTimelineCheckpoints = initTimelineCheckpoints;

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
      
      // If not YouTube, prioritize meta tag cover images and video.poster before falling back to canvas screenshot capture
      const thumbnail = ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : (getMetaThumbnail() || video.poster || captureVideoFrame(video));
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

    if (video && isMainVideo(video)) {
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
        const video = findVideo();
        if (video && isMainVideo(video)) {
          registerVideoFrame();
        }
        initTimelineCheckpoints();
      }, 1000);
    }
  }, 1000);

  // Detect YouTube SPA navigation finish events
  document.addEventListener('yt-navigate-finish', () => {
    setTimeout(() => {
      const video = findVideo();
      if (video && isMainVideo(video)) {
        registerVideoFrame();
      }
      initTimelineCheckpoints();
    }, 1000);
    
    setTimeout(() => {
      const video = findVideo();
      if (video && isMainVideo(video)) {
        registerVideoFrame();
      }
      initTimelineCheckpoints();
    }, 3000); 
  });
})();
