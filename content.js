(function() {
  if (window.vidMarkLoaded) {
    try {
      if (chrome.runtime && chrome.runtime.sendMessage) {
        const video = findVideo();
        const score = video ? calculateVideoScore(video) : 0;
        chrome.runtime.sendMessage({ action: "REGISTER_VIDEO_FRAME", score }, () => {
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

  if (window.top === window) {
    try {
      if (chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: "RESET_VIDEO_FRAME" }, () => {
          if (chrome.runtime.lastError) { /* ignore runtime disconnect */ }
        });
      }
    } catch (e) {}
  }

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

  // Safely find all videos including inside shadow roots
  function getAllVideos() {
    const videos = [];
    const queue = [document];
    const seen = new Set();

    while (queue.length > 0 && seen.size < 50) {
      const node = queue.shift();
      if (!node || seen.has(node)) continue;
      seen.add(node);

      try {
        const found = node.querySelectorAll('video');
        for (const v of found) {
          videos.push(v);
        }
      } catch (e) {}

      try {
        const all = node.querySelectorAll('*');
        for (const el of all) {
          if (el.shadowRoot && !seen.has(el.shadowRoot)) {
            queue.push(el.shadowRoot);
          }
        }
      } catch (e) {}
    }

    return Array.from(new Set(videos));
  }

  // Calculate video suitability score
  function calculateVideoScore(v) {
    if (!v) return 0;
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
    
    return score;
  }

  let cachedVideo = null;

  // Function to find the most appropriate video element on the page using a robust scoring system
  function findVideo() {
    if (cachedVideo && cachedVideo.isConnected) {
      return cachedVideo;
    }

    const videos = getAllVideos();
    if (videos.length === 0) {
      cachedVideo = null;
      return null;
    }

    const scoredVideos = videos.map(v => {
      return { video: v, score: calculateVideoScore(v) };
    });

    scoredVideos.sort((a, b) => b.score - a.score);
    cachedVideo = scoredVideos[0].video;
    return cachedVideo;
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
        const video = findVideo();
        const score = video ? calculateVideoScore(video) : 0;
        chrome.runtime.sendMessage({ action: "REGISTER_VIDEO_FRAME", score }, () => {
          if (chrome.runtime.lastError) { /* ignore runtime disconnect */ }
        });
      }
    } catch (e) {
      // Ignore context invalidation errors
    }
  }

  // Helper to query all elements matching a selector, including traversing shadow roots of video ancestors
  function findAllElementsInPlayer(selector, video) {
    const results = [];
    
    // 1. Search in the light DOM of the document
    try {
      const docMatches = document.querySelectorAll(selector);
      for (const m of docMatches) {
        results.push(m);
      }
    } catch (e) {}
    
    // 2. Search in shadow roots of the video element's ancestors
    if (video) {
      let current = video.parentNode || video.host;
      while (current) {
        if (current instanceof ShadowRoot || current.host !== undefined) {
          const rootToQuery = current instanceof ShadowRoot ? current : current.shadowRoot;
          if (rootToQuery) {
            try {
              const shadowMatches = rootToQuery.querySelectorAll(selector);
              for (const m of shadowMatches) {
                results.push(m);
              }
            } catch (e) {}
          }
        }
        // Walk up to next parent or host
        if (current.parentNode) {
          current = current.parentNode;
        } else if (current.host) {
          current = current.host;
        } else {
          current = null;
        }
      }
    }
    
    return Array.from(new Set(results));
  }

  function findElementInPlayer(selector, video) {
    const matches = findAllElementsInPlayer(selector, video);
    return matches.length > 0 ? matches[0] : null;
  }

  // Search for common player progress bar elements (in both specific and generic containers, ignoring hidden state checks for initial matching)
  function findNativeTimeline(video) {
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
      const el = findElementInPlayer(selector, video);
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
      '[class*="timeline"]',
      '[class*="rail"]',
      '[class*="track"]',
      'input[type="range"]',
      '[role="slider"]',
      '[aria-label*="seek" i]',
      '[aria-label*="progress" i]'
    ];

    let candidates = [];
    for (const selector of genericSelectors) {
      try {
        const elements = findAllElementsInPlayer(selector, video);
        candidates.push(...elements);
      } catch (e) {
        // ignore selector errors
      }
    }

    candidates = Array.from(new Set(candidates));

    const filtered = candidates.filter(el => {
      // 1. A timeline should not contain standard interactive control buttons
      if (el.querySelector('button') || el.querySelector('[role="button"]')) {
        return false;
      }

      const className = (el.className || "").toString().toLowerCase();
      const id = (el.id || "").toString().toLowerCase();
      const name = className + " " + id;

      // 2. Exclude handles, thumbs, playheads, tooltips, buffers, loaders, volume, sound, etc.
      if (
        name.includes('handle') ||
        name.includes('thumb') ||
        name.includes('knob') ||
        name.includes('playhead') ||
        name.includes('tooltip') ||
        name.includes('marker') ||
        name.includes('buffer') ||
        name.includes('load') ||
        name.includes('time') ||
        name.includes('volume') ||
        name.includes('mute') ||
        name.includes('sound')
      ) {
        return false;
      }

      // 3. Avoid parent controllers/containers with high height (controls bars are usually > 28px)
      const rect = el.getBoundingClientRect();
      if (rect.height > 28) {
        return false;
      }
      // Narrow elements are playheads or tooltips; timeline should be relatively wide
      if (rect.width > 0 && rect.width < 80) {
        return false;
      }

      return true;
    });

    if (filtered.length === 0) return null;

    // Find the deepest matching element (prefer the child element over its matching parent)
    let best = filtered[0];
    for (const el of filtered) {
      if (best !== el && best.contains(el)) {
        best = el;
      }
    }

    return best;
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
    let nativeTimeline = findNativeTimeline(video);
    if (nativeTimeline) {
      // If the matched progress bar is an INPUT tag (e.g. Plyr <input type="range">),
      // we must use its parent container because inputs cannot have child elements in HTML.
      if (nativeTimeline.tagName === 'INPUT') {
        const parent = nativeTimeline.parentElement;
        if (parent && window.getComputedStyle(parent).position === 'static') {
          parent.style.position = 'relative';
        }
        clearUniversalTimeline();
        return parent;
      }
      // Enforce relative/absolute position so checkpoints align precisely
      if (window.getComputedStyle(nativeTimeline).position === 'static') {
        nativeTimeline.style.position = 'relative';
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

      const themeColors = {
        cyan: '#00d1ff',
        red: '#ff5449',
        orange: '#ff9f0a',
        green: '#30d158',
        purple: '#bf5af2'
      };

      chrome.storage.local.get([storageKey, "active_theme"], (result) => {
        const bookmarks = result[storageKey] || [];
        const theme = result.active_theme || "cyan";
        const themeColor = themeColors[theme] || '#00d1ff';

        if (bookmarks.length === 0) {
          clearUniversalTimeline();
          return;
        }

        const nativeTimeline = findNativeTimeline(video);
        const progressContainer = getOrCreateUniversalTimeline(video);
        if (!progressContainer) return;

        let leftPercent = 0;
        let widthPercent = 100;
        let isRangeInput = false;

        if (nativeTimeline && nativeTimeline.tagName === 'INPUT') {
          isRangeInput = true;
          const containerRect = progressContainer.getBoundingClientRect();
          const timelineRect = nativeTimeline.getBoundingClientRect();
          if (containerRect.width > 0) {
            const leftOffset = timelineRect.left - containerRect.left;
            leftPercent = (leftOffset / containerRect.width) * 100;
            widthPercent = (timelineRect.width / containerRect.width) * 100;
          }
        }

        // Retrieve container padding styles to calculate exact progress track start/end bounds
        const containerStyle = window.getComputedStyle(progressContainer);
        const paddingLeft = parseFloat(containerStyle.paddingLeft) || 0;
        const paddingRight = parseFloat(containerStyle.paddingRight) || 0;
        const totalPadding = paddingLeft + paddingRight;

        bookmarks.forEach(bm => {
          const pct = (bm.time / video.duration) * 100;
          if (isNaN(pct) || pct < 0 || pct > 100) return;

          const dot = document.createElement('div');
          dot.className = 'vidmark-checkpoint';
          
          // Math calculation using CSS calc() to offset parent container paddings dynamically
          let leftValue;
          if (isRangeInput) {
            leftValue = `calc(${leftPercent}% + (${pct / 100} * ${widthPercent}%))`;
          } else {
            leftValue = totalPadding > 0 
              ? `calc(${paddingLeft}px + ${pct / 100} * (100% - ${totalPadding}px))`
              : `${pct}%`;
          }

          dot.style.setProperty('position', 'absolute', 'important');
          dot.style.setProperty('left', leftValue, 'important');
          dot.style.setProperty('top', '50%', 'important');
          dot.style.setProperty('width', '8px', 'important');
          dot.style.setProperty('height', '8px', 'important');
          dot.style.setProperty('background-color', themeColor, 'important');
          dot.style.setProperty('border-radius', '50%', 'important');
          dot.style.setProperty('transform', 'translate(-50%, -50%)', 'important');
          dot.style.setProperty('box-shadow', `0 0 8px ${themeColor}, 0 0 2px rgba(255,255,255,0.8)`, 'important');
          dot.style.setProperty('z-index', '2147483646', 'important');
          dot.style.setProperty('pointer-events', 'none', 'important');
          dot.style.setProperty('margin', '0', 'important');
          dot.style.setProperty('padding', '0', 'important');
          dot.style.setProperty('display', 'block', 'important');

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
      if (video.dataset.vidmarkInitialized !== "true") {
        video.dataset.vidmarkInitialized = "true";
        video.addEventListener('durationchange', renderTimelineCheckpoints);
        video.addEventListener('loadedmetadata', renderTimelineCheckpoints);
        video.addEventListener('play', handleVideoStateChange);
        video.addEventListener('pause', handleVideoStateChange);
      }
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
        thumbnail: thumbnail,
        paused: video.paused
      });
    } 
    
    else if (request.action === "TOGGLE_PLAYBACK") {
      const video = findVideo();
      if (video) {
        if (video.paused) {
          video.play()
            .then(() => sendResponse({ success: true, paused: false }))
            .catch(err => {
              console.warn("VidMark: Playback play was blocked by browser rules.", err);
              sendResponse({ success: true, paused: true, blocked: true });
            });
        } else {
          video.pause();
          sendResponse({ success: true, paused: true });
        }
      } else {
        sendResponse({ success: false, error: "No active video found on page." });
      }
      return true;
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

  // Document-level capturing listeners to catch play events on dynamically added video elements immediately
  document.addEventListener('play', (event) => {
    if (event.target && event.target.tagName === 'VIDEO') {
      const video = event.target;
      if (isMainVideo(video)) {
        registerVideoFrame();
        initTimelineCheckpoints();
      }
    }
  }, true);

  document.addEventListener('loadedmetadata', (event) => {
    if (event.target && event.target.tagName === 'VIDEO') {
      const video = event.target;
      if (isMainVideo(video)) {
        registerVideoFrame();
        initTimelineCheckpoints();
      }
    }
  }, true);

  // Initial light-weight continuous polling loop as backup for SPAs
  let lastUrl = getNormalizedUrl(window.location.href);
  
  setInterval(() => {
    const video = findVideo();
    if (video && isMainVideo(video)) {
      registerVideoFrame();
      initTimelineCheckpoints();
    }
  }, 3000);

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

  // Direct keydown event listener as failsafe/backup for keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const isModifier = isMac ? e.metaKey : e.ctrlKey;
    
    if (isModifier && e.shiftKey && e.key.toUpperCase() === 'K') {
      const video = findVideo();
      if (video && isMainVideo(video)) {
        e.preventDefault();
        
        // Trigger quick mark logic directly
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
            });
          }
        });
      }
    }
  });

  // Responsive checkpoint positioning during page resizing
  window.addEventListener('resize', () => {
    try {
      renderTimelineCheckpoints();
    } catch (e) {}
  });

  // Run immediate detection check
  try {
    const initVideo = findVideo();
    if (initVideo && isMainVideo(initVideo)) {
      registerVideoFrame();
      initTimelineCheckpoints();
    }
  } catch (e) {}
})();
