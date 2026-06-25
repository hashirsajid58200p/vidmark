// VidMark - Popup Logic

document.addEventListener("DOMContentLoaded", () => {
  initPopup();
  wireTabListeners();
});

// UI Elements mapping
const activeState = document.getElementById("active-state");
const emptyState = document.getElementById("empty-state");
const videoTitle = document.getElementById("video-title");
const videoThumbnail = document.getElementById("video-thumbnail");
const videoTime = document.getElementById("video-time");
const saveBtn = document.getElementById("save-timestamp");
const bookmarksList = document.getElementById("bookmarks-list");

let currentTabId = null;

// Helper to normalize the URL by stripping seek query parameters
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

// Initialize the extension popup
async function initPopup() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      showEmptyState();
      return;
    }
    
    currentTabId = tab.id;

    if (!tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("edge://") || tab.url.startsWith("about:")) {
      showEmptyState();
      return;
    }

    // Programmatically inject content script to make sure it is loaded
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });

    // Request video state from content script
    chrome.tabs.sendMessage(tab.id, { action: "GET_VIDEO_STATE" }, (response) => {
      if (chrome.runtime.lastError || !response || !response.found) {
        showEmptyState();
      } else {
        showActiveState(response);
      }
    });

  } catch (err) {
    console.error("VidMark Initialization Error:", err);
    showEmptyState();
  }
}

// Show the Empty state UI
function showEmptyState() {
  activeState.style.display = "none";
  emptyState.style.display = "flex";
  switchTab("bookmarks", "empty");
}

// Show the Active state UI with video bookmarking features
function showActiveState(videoState) {
  emptyState.style.display = "none";
  activeState.style.display = "flex";
  switchTab("bookmarks", "active");

  // Populate Video Card Info
  videoTitle.textContent = videoState.title || "Active Video";
  videoTime.textContent = formatTime(videoState.duration);
  if (videoState.thumbnail) {
    videoThumbnail.src = videoState.thumbnail;
    videoThumbnail.alt = videoState.title;
  }

  const normalizedUrl = getNormalizedUrl(videoState.url);
  const storageKey = `vidmark_bm_${normalizedUrl}`;

  // Load and render existing bookmarks
  loadBookmarks(storageKey);

  // Hook up the Add Bookmark button
  saveBtn.replaceWith(saveBtn.cloneNode(true));
  const newSaveBtn = document.getElementById("save-timestamp");
  
  newSaveBtn.addEventListener("click", () => {
    // Send QUICK_MARK to content script to perform screenshot and capture
    chrome.tabs.sendMessage(currentTabId, { action: "QUICK_MARK" }, (response) => {
      if (chrome.runtime.lastError || !response || !response.success) {
        alert("Failed to save bookmark. Is there a video playing on the active tab?");
        return;
      }
      
      // Reload the updated bookmarks list
      loadBookmarks(storageKey);
    });
  });

  notifyContentScriptUpdate();
}

// Load and render bookmarks for the current video from chrome.storage.local
function loadBookmarks(storageKey) {
  chrome.storage.local.get([storageKey], (result) => {
    const bookmarks = result[storageKey] || [];
    renderBookmarks(bookmarks, storageKey);
  });
}

// Save a bookmark inline update (used after inline editing finishes)
function saveInlineEdit(time, newNote, storageKey) {
  chrome.storage.local.get([storageKey], (result) => {
    const bookmarks = result[storageKey] || [];
    const index = bookmarks.findIndex(bm => bm.time === time);
    
    if (index !== -1) {
      bookmarks[index].note = newNote.trim() || `Bookmark @ ${formatTime(time)}`;
      chrome.storage.local.set({ [storageKey]: bookmarks }, () => {
        renderBookmarks(bookmarks, storageKey);
        notifyContentScriptUpdate();
      });
    }
  });
}

// Delete a saved bookmark
function deleteBookmark(time, storageKey) {
  chrome.storage.local.get([storageKey], (result) => {
    let bookmarks = result[storageKey] || [];
    bookmarks = bookmarks.filter(bm => bm.time !== time);
    chrome.storage.local.set({ [storageKey]: bookmarks }, () => {
      renderBookmarks(bookmarks, storageKey);
      notifyContentScriptUpdate();
    });
  });
}

// Send a message to content script to seek video to specific timestamp
function seekVideo(time) {
  chrome.tabs.sendMessage(currentTabId, { action: "SEEK_VIDEO", time }, (response) => {
    if (chrome.runtime.lastError || !response || !response.success) {
      console.warn("Seeking failed:", chrome.runtime.lastError || response?.error);
    }
  });
}

// Send a message to content script to refresh timeline checkpoints
function notifyContentScriptUpdate() {
  if (currentTabId) {
    chrome.tabs.sendMessage(currentTabId, { action: "UPDATE_CHECKPOINTS" }, () => {
      if (chrome.runtime.lastError) {
        // ignore errors silently
      }
    });
  }
}

// Tab Switching logic
function switchTab(viewName, state = 'active') {
  const views = ['bookmarks', 'tags', 'history', 'settings', 'help'];
  
  views.forEach(v => {
    const el = document.getElementById(`${state}-${v}-view`);
    if (el) {
      el.style.display = (v === viewName) ? 'flex' : 'none';
    }
  });

  // Adjust bottom navigation buttons' active colors & fonts
  const tabs = ['bookmarks', 'tags', 'history'];
  tabs.forEach(t => {
    const btn = document.getElementById(`${state}-${t}-tab`);
    if (btn) {
      if (t === viewName) {
        btn.className = "flex flex-col items-center justify-center text-primary font-bold active:scale-90 hover:text-primary-fixed-dim transition-all w-[64px] h-[48px] gap-1";
        
        if (state === 'empty') {
          btn.className = "flex flex-col items-center justify-center text-primary font-bold active:scale-90 w-16 group";
          const iconDiv = btn.querySelector("div");
          if (iconDiv) iconDiv.className = "p-xs rounded-full mb-xs bg-primary/10 transition-colors";
        }
        
        const icon = btn.querySelector('.material-symbols-outlined');
        if (icon) icon.style.fontVariationSettings = "'FILL' 1";
      } else {
        btn.className = "flex flex-col items-center justify-center text-on-surface-variant active:scale-90 hover:text-primary-fixed-dim transition-all w-[64px] h-[48px] gap-1";
        
        if (state === 'empty') {
          btn.className = "flex flex-col items-center justify-center text-on-surface-variant hover:text-primary-fixed-dim transition-all active:scale-90 w-16 group";
          const iconDiv = btn.querySelector("div");
          if (iconDiv) iconDiv.className = "p-xs rounded-full mb-xs group-hover:bg-surface-variant transition-colors";
        }

        const icon = btn.querySelector('.material-symbols-outlined');
        if (icon) icon.style.fontVariationSettings = "'FILL' 0";
      }
    }
  });

  // Adjust active header buttons coloring
  const settingsBtn = document.getElementById(`${state}-settings-btn`);
  if (settingsBtn) {
    if (viewName === 'settings') {
      settingsBtn.classList.remove('text-on-surface-variant');
      settingsBtn.classList.add('text-primary');
    } else {
      settingsBtn.classList.remove('text-primary');
      settingsBtn.classList.add('text-on-surface-variant');
    }
  }

  const helpBtn = document.getElementById(`${state}-help-btn`);
  if (helpBtn) {
    if (viewName === 'help') {
      helpBtn.classList.remove('text-on-surface-variant');
      helpBtn.classList.add('text-primary');
    } else {
      helpBtn.classList.remove('text-primary');
      helpBtn.classList.add('text-on-surface-variant');
    }
  }
}

// Wire up event listeners to bottom nav and top header buttons
function wireTabListeners() {
  const states = ['active', 'empty'];
  
  states.forEach(state => {
    // Bottom tabs: Bookmarks, Tags, History
    ['bookmarks', 'tags', 'history'].forEach(tabName => {
      const btn = document.getElementById(`${state}-${tabName}-tab`);
      if (btn) {
        btn.addEventListener('click', () => {
          switchTab(tabName, state);
        });
      }
    });

    // Top Header Buttons: Settings, Help
    const settingsBtn = document.getElementById(`${state}-settings-btn`);
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        switchTab('settings', state);
      });
    }

    const helpBtn = document.getElementById(`${state}-help-btn`);
    if (helpBtn) {
      helpBtn.addEventListener('click', () => {
        switchTab('help', state);
      });
    }
  });
}

// Render the bookmark list into the UI container
function renderBookmarks(bookmarks, storageKey) {
  bookmarksList.innerHTML = "";

  if (bookmarks.length === 0) {
    bookmarksList.innerHTML = `
      <div class="flex-1 flex flex-col items-center justify-center text-center p-md text-on-surface-variant min-h-[140px] z-10">
        <span class="material-symbols-outlined text-[36px] opacity-40 mb-xs">bookmark_border</span>
        <p class="font-body-md text-body-md">No bookmarks saved yet.</p>
      </div>
    `;
    return;
  }

  bookmarks.forEach((bm) => {
    const entry = document.createElement("div");
    entry.className = "flex items-center justify-between py-sm border-b border-white/5 group z-10 bookmark-item-row";

    // Set fallback icon if screenshot is not found (CORS exception)
    const thumbUrl = bm.thumbnail || 'icons/icon48.png';

    entry.innerHTML = `
      <!-- Thumbnail frame canvas snapshot -->
      <div class="relative w-[56px] h-[36px] bg-surface-container-low rounded overflow-hidden shrink-0 mr-sm flex items-center justify-center border border-white/5">
        <img class="w-full h-full object-cover" src="${thumbUrl}" alt="Cap"/>
        <div class="play-overlay absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
          <span class="material-symbols-outlined text-white text-[16px] play-trigger" style="font-variation-settings: 'FILL' 1;">play_arrow</span>
        </div>
      </div>
      
      <!-- Bookmark metadata content -->
      <div class="flex-1 min-w-0 pr-sm flex flex-col">
        <span class="text-primary font-bold font-label-sm text-label-sm play-trigger cursor-pointer">[${formatTime(bm.time)}]</span>
        <p class="note-text font-body-md text-body-md text-on-surface truncate-text leading-tight" title="${escapeHTML(bm.note)}">${escapeHTML(bm.note)}</p>
      </div>
      
      <!-- Action buttons -->
      <div class="flex items-center gap-1 text-on-surface-variant opacity-70 group-hover:opacity-100 transition-opacity shrink-0">
        <button aria-label="Play" class="play-trigger hover:text-primary transition-colors flex items-center justify-center p-1 rounded-full">
          <span class="material-symbols-outlined text-[18px]">play_arrow</span>
        </button>
        <button aria-label="Edit" class="edit-btn hover:text-primary transition-colors flex items-center justify-center p-1 rounded-full">
          <span class="material-symbols-outlined text-[18px]">edit</span>
        </button>
        <button aria-label="Delete" class="delete-btn hover:text-error transition-colors flex items-center justify-center p-1 rounded-full">
          <span class="material-symbols-outlined text-[18px]">delete</span>
        </button>
      </div>
    `;

    // Direct event listener binding to handle seeks securely
    entry.querySelectorAll(".play-trigger").forEach(btn => {
      btn.addEventListener("click", () => seekVideo(bm.time));
    });

    entry.querySelector(".delete-btn").addEventListener("click", () => deleteBookmark(bm.time, storageKey));

    // Inline note editing implementation
    const noteText = entry.querySelector(".note-text");
    const editBtn = entry.querySelector(".edit-btn");
    const editIcon = editBtn.querySelector(".material-symbols-outlined");

    editBtn.addEventListener("click", () => {
      const isEditing = entry.classList.contains("is-editing");

      if (!isEditing) {
        entry.classList.add("is-editing");
        editIcon.textContent = "done"; // Toggle to checkmark icon
        editBtn.classList.remove("hover:text-primary");
        editBtn.classList.add("text-primary");

        // Swap paragraph display text with editable input
        const input = document.createElement("input");
        input.type = "text";
        input.className = "bg-surface-container-low border-b-2 border-primary text-on-surface rounded px-1 py-xs w-full outline-none font-body-md text-body-md";
        input.value = bm.note;

        noteText.replaceWith(input);
        input.focus();
        input.select();

        // Save inline note state on Enter or reload original list on Escape
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            saveInlineEdit(bm.time, input.value, storageKey);
          } else if (e.key === "Escape") {
            loadBookmarks(storageKey);
          }
        });
      } else {
        const input = entry.querySelector("input");
        saveInlineEdit(bm.time, input.value, storageKey);
      }
    });

    bookmarksList.appendChild(entry);
  });
}

// Format seconds into a visual time duration string (HH:MM:SS or MM:SS)
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

// Escape strings to prevent HTML/XSS injection vulnerabilities
function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}
