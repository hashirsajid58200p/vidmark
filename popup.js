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

// Modal Elements
const modal = document.getElementById("bookmark-modal");
const modalTitle = document.getElementById("modal-title");
const modalInput = document.getElementById("bookmark-note-input");
const modalCancel = document.getElementById("modal-cancel");
const modalSave = document.getElementById("modal-save");

let modalResolve = null;
let currentTabId = null;

// Initialize the extension popup
async function initPopup() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      showEmptyState();
      return;
    }
    
    currentTabId = tab.id;

    // Check if the URL is valid for injection (exclude chrome://, edge://, etc.)
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
      // Handle extension runtime disconnect or lack of response
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

  const storageKey = `vidmark_bm_${videoState.url}`;

  // Load and render existing bookmarks
  loadBookmarks(storageKey);

  // Hook up the Add Bookmark button
  // Remove existing listener to prevent duplicate attachment if refreshed
  saveBtn.replaceWith(saveBtn.cloneNode(true));
  const newSaveBtn = document.getElementById("save-timestamp");
  
  newSaveBtn.addEventListener("click", () => {
    // Get the exact current timestamp at point of click
    chrome.tabs.sendMessage(currentTabId, { action: "GET_VIDEO_STATE" }, async (latestState) => {
      if (chrome.runtime.lastError || !latestState || !latestState.found) {
        alert("Failed to grab video playtime. Has the video container changed?");
        return;
      }
      
      const currentTime = latestState.currentTime;
      const defaultNote = `Bookmark @ ${formatTime(currentTime)}`;
      
      const note = await openNoteModal("Add Bookmark", defaultNote);
      if (note !== null) {
        saveBookmark(storageKey, currentTime, note || defaultNote);
      }
    });
  });

  // Sync checkpoints on YouTube player immediately on popup open
  notifyContentScriptUpdate();
}

// Load and render bookmarks for the current video from chrome.storage.local
function loadBookmarks(storageKey) {
  chrome.storage.local.get([storageKey], (result) => {
    const bookmarks = result[storageKey] || [];
    renderBookmarks(bookmarks, storageKey);
  });
}

// Save a bookmark and sort by timestamp ascending
function saveBookmark(storageKey, time, note) {
  chrome.storage.local.get([storageKey], (result) => {
    const bookmarks = result[storageKey] || [];
    
    // Check if bookmark at the exact second already exists, update it if so, otherwise push
    const existingIndex = bookmarks.findIndex(bm => Math.floor(bm.time) === Math.floor(time));
    if (existingIndex !== -1) {
      bookmarks[existingIndex].note = note;
    } else {
      bookmarks.push({ time, note });
    }

    // Sort by playtime ascending
    bookmarks.sort((a, b) => a.time - b.time);

    chrome.storage.local.set({ [storageKey]: bookmarks }, () => {
      renderBookmarks(bookmarks, storageKey);
      notifyContentScriptUpdate();
    });
  });
}

// Edit an existing bookmark's note
async function editBookmark(time, currentNote, storageKey) {
  const newNote = await openNoteModal("Edit Bookmark Note", currentNote);
  if (newNote !== null) {
    chrome.storage.local.get([storageKey], (result) => {
      const bookmarks = result[storageKey] || [];
      const index = bookmarks.findIndex(bm => bm.time === time);
      if (index !== -1) {
        bookmarks[index].note = newNote || `Bookmark @ ${formatTime(time)}`;
        chrome.storage.local.set({ [storageKey]: bookmarks }, () => {
          renderBookmarks(bookmarks, storageKey);
          notifyContentScriptUpdate();
        });
      }
    });
  }
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
      // Catch runtime disconnect errors silently
      if (chrome.runtime.lastError) {
        // do nothing
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
        // Active visual styles (cyan font tint, bold, filled icon representation)
        btn.className = "flex flex-col items-center justify-center text-primary font-bold active:scale-90 hover:text-primary-fixed-dim transition-all w-[64px] h-[48px] gap-1";
        
        // Handle variations (e.g. empty-state structure uses a different wrapping div class)
        if (state === 'empty') {
          btn.className = "flex flex-col items-center justify-center text-primary font-bold active:scale-90 w-16 group";
          const iconDiv = btn.querySelector("div");
          if (iconDiv) iconDiv.className = "p-xs rounded-full mb-xs bg-primary/10 transition-colors";
        }
        
        const icon = btn.querySelector('.material-symbols-outlined');
        if (icon) icon.style.fontVariationSettings = "'FILL' 1";
      } else {
        // Muted styles
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
    entry.className = "flex items-start justify-between py-sm border-b border-white/5 group z-10";

    entry.innerHTML = `
      <div class="flex flex-col gap-xs flex-1 pr-gutter min-w-0">
        <button class="play-chip inline-flex items-center bg-primary/10 text-primary hover:bg-primary/20 rounded px-2 py-1 font-label-sm text-label-sm w-max transition-colors">
          ${formatTime(bm.time)}
        </button>
        <p class="font-body-md text-body-md text-on-surface mt-1 break-words leading-snug">${escapeHTML(bm.note)}</p>
      </div>
      <div class="flex items-center gap-2 text-on-surface-variant opacity-70 group-hover:opacity-100 transition-opacity mt-1 shrink-0">
        <button aria-label="Play" class="play-btn hover:text-primary transition-colors flex items-center justify-center">
          <span class="material-symbols-outlined text-[18px]">play_arrow</span>
        </button>
        <button aria-label="Edit" class="edit-btn hover:text-primary transition-colors flex items-center justify-center">
          <span class="material-symbols-outlined text-[18px]">edit</span>
        </button>
        <button aria-label="Delete" class="delete-btn hover:text-error transition-colors flex items-center justify-center">
          <span class="material-symbols-outlined text-[18px]">delete</span>
        </button>
      </div>
    `;

    // Direct event listener binding to handle secure executions and parameters
    entry.querySelectorAll(".play-chip, .play-btn").forEach(btn => {
      btn.addEventListener("click", () => seekVideo(bm.time));
    });
    entry.querySelector(".edit-btn").addEventListener("click", () => editBookmark(bm.time, bm.note, storageKey));
    entry.querySelector(".delete-btn").addEventListener("click", () => deleteBookmark(bm.time, storageKey));

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

// Custom Glassmorphism Note Dialog Modal controls
function openNoteModal(title, defaultValue = "") {
  modalTitle.textContent = title;
  modalInput.value = defaultValue;
  modal.style.display = "flex";
  
  // Smooth fade-in
  setTimeout(() => {
    modal.style.opacity = "1";
    modalInput.focus();
    modalInput.select();
  }, 30);

  return new Promise((resolve) => {
    modalResolve = resolve;
  });
}

// Close Note Dialog Modal
function closeNoteModal() {
  modal.style.opacity = "0";
  setTimeout(() => {
    modal.style.display = "none";
  }, 200);
}

modalCancel.addEventListener("click", () => {
  closeNoteModal();
  if (modalResolve) modalResolve(null);
});

modalSave.addEventListener("click", () => {
  const note = modalInput.value.trim();
  closeNoteModal();
  if (modalResolve) modalResolve(note);
});

modalInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    modalSave.click();
  } else if (e.key === "Escape") {
    modalCancel.click();
  }
});
