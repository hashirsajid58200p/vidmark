// VidMark - Content Script

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

// Render visual markers ("Blue Dots") on the YouTube player's timeline
function renderTimelineCheckpoints() {
  try {
    const video = findVideo();
    if (!video || !video.duration) {
      return;
    }

    // Clear any existing VidMark checkpoints
    document.querySelectorAll('.vidmark-checkpoint').forEach(el => el.remove());

    const url = window.location.href;
    const storageKey = `vidmark_bm_${url}`;

    chrome.storage.local.get([storageKey], (result) => {
      const bookmarks = result[storageKey] || [];
      if (bookmarks.length === 0) return;

      // Target the progress list container on the YouTube player
      const progressContainer = document.querySelector('.ytp-progress-list');
      if (!progressContainer) {
        return; // Skip if progress bar is not in DOM (non-YouTube or player not loaded)
      }

      bookmarks.forEach(bm => {
        const pct = (bm.time / video.duration) * 100;
        if (isNaN(pct) || pct < 0 || pct > 100) return;

        // Create the blue dot marker element
        const dot = document.createElement('div');
        dot.className = 'vidmark-checkpoint';
        
        // Inline styles to match technical minimalism specs without needing page stylesheets
        dot.style.position = 'absolute';
        dot.style.left = `${pct}%`;
        dot.style.top = '50%';
        dot.style.width = '8px';
        dot.style.height = '8px';
        dot.style.backgroundColor = '#00d1ff';
        dot.style.borderRadius = '50%';
        dot.style.transform = 'translate(-50%, -50%)';
        dot.style.boxShadow = '0 0 8px #00d1ff, 0 0 2px rgba(255,255,255,0.8)';
        dot.style.zIndex = '35'; // Draw above play progress but below scrubbing thumbnail popups
        dot.style.pointerEvents = 'none'; // Click-through to progress bar is preserved

        progressContainer.appendChild(dot);
      });
    });
  } catch (err) {
    console.error("VidMark: Timeline dot rendering error:", err);
  }
}

// Hook up video metadata/duration listeners to re-render dots when player state changes
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

// Listen for messages from the popup UI
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "GET_VIDEO_STATE") {
    const video = findVideo();
    if (!video) {
      sendResponse({ found: false });
      return true; 
    }

    const url = window.location.href;
    const ytId = getYoutubeVideoId(url);
    const thumbnail = ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : null;

    sendResponse({
      found: true,
      title: document.title,
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
    return true; // Keep channel open for async response
  }
  
  else if (request.action === "UPDATE_CHECKPOINTS") {
    renderTimelineCheckpoints();
    sendResponse({ success: true });
  }
  
  return true; // Keep channel open for async response
});

// SPA checking & Initial injection polling loop
let lastUrl = window.location.href;
let initAttempts = 0;

const initInterval = setInterval(() => {
  initAttempts++;
  const progressContainer = document.querySelector('.ytp-progress-list');
  const video = findVideo();

  if (progressContainer && video) {
    initTimelineCheckpoints();
    clearInterval(initInterval);
  } else if (initAttempts > 20 || (!video && initAttempts > 10)) {
    // Stop polling if player is not found after 20 tries, or if no video element is present at all after 10
    clearInterval(initInterval);
  }
}, 1000);

// Detect YouTube SPA client-side router page navigations
setInterval(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    // Delay slightly to allow the video player player DOM elements to update
    setTimeout(() => {
      initTimelineCheckpoints();
    }, 1000);
  }
}, 1000);
