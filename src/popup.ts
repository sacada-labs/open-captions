/**
 * Open Captions - Popup Controller
 * Handles file upload, offset controls, and connection status
 */

// DOM Elements
let connectionStatus: HTMLDivElement;
let dropzone: HTMLDivElement;
let fileInput: HTMLInputElement;
let fileLoaded: HTMLDivElement;
let fileName: HTMLSpanElement;
let subtitleCount: HTMLSpanElement;
let clearFileBtn: HTMLButtonElement;
let offsetValue: HTMLSpanElement;
let offsetHint: HTMLParagraphElement;
let resetOffsetBtn: HTMLButtonElement;

// State
let currentOffset = 0;
let isConnected = false;

// Storage keys
const STORAGE_KEY_SUBTITLE = 'loadedSubtitle';

// Subtitle data interface
interface SubtitleData {
  fileName: string;
  count: number;
  content: string;
}

/**
 * Initialize the popup
 */
document.addEventListener('DOMContentLoaded', () => {
  initializeElements();
  setupEventListeners();
  checkConnection();
  getCurrentOffset();
  loadSavedSubtitle();
});

/**
 * Get all DOM elements
 */
function initializeElements(): void {
  connectionStatus = document.getElementById('connectionStatus') as HTMLDivElement;
  dropzone = document.getElementById('dropzone') as HTMLDivElement;
  fileInput = document.getElementById('fileInput') as HTMLInputElement;
  fileLoaded = document.getElementById('fileLoaded') as HTMLDivElement;
  fileName = document.getElementById('fileName') as HTMLSpanElement;
  subtitleCount = document.getElementById('subtitleCount') as HTMLSpanElement;
  clearFileBtn = document.getElementById('clearFile') as HTMLButtonElement;
  offsetValue = document.getElementById('offsetValue') as HTMLSpanElement;
  offsetHint = document.getElementById('offsetHint') as HTMLParagraphElement;
  resetOffsetBtn = document.getElementById('resetOffset') as HTMLButtonElement;
}

/**
 * Setup all event listeners
 */
function setupEventListeners(): void {
  // Dropzone events
  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover', handleDragOver);
  dropzone.addEventListener('dragleave', handleDragLeave);
  dropzone.addEventListener('drop', handleDrop);
  fileInput.addEventListener('change', handleFileSelect);
  
  // Clear file button
  clearFileBtn.addEventListener('click', clearSubtitles);
  
  // Offset buttons
  const offsetButtons = document.querySelectorAll<HTMLButtonElement>('.offset-btn');
  offsetButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const offset = parseFloat(btn.dataset.offset || '0');
      adjustOffset(offset);
    });
  });
  
  // Reset button
  resetOffsetBtn.addEventListener('click', resetOffset);
  
  // Listen for offset updates from content script
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'offsetUpdated') {
      updateOffsetDisplay(message.offset);
    }
  });
}

/**
 * Check connection to content script
 */
function checkConnection(): void {
  const statusText = connectionStatus.querySelector('.status-text') as HTMLSpanElement;
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (chrome.runtime.lastError) {
      setDisconnected(statusText, 'No active tab');
      return;
    }

    const tab = tabs[0];
    if (!tab?.id) {
      setDisconnected(statusText, 'No tab found');
      return;
    }

    // Check if we're on a supported site
    const url = tab.url || '';
    const isNetflix = url.includes('netflix.com');
    
    if (!isNetflix) {
      setDisconnected(statusText, 'Go to Netflix');
      return;
    }

    // Try to ping the content script
    chrome.tabs.sendMessage(tab.id, { action: 'getOffset' }, (response) => {
      if (chrome.runtime.lastError) {
        setDisconnected(statusText, 'Refresh page');
        return;
      }

      if (response !== undefined) {
        setConnected(statusText, 'Connected');
        isConnected = true;
      } else {
        setDisconnected(statusText, 'Not ready');
      }
    });
  });
}

function setConnected(statusText: HTMLSpanElement, text: string): void {
  connectionStatus.classList.remove('disconnected');
  connectionStatus.classList.add('connected');
  statusText.textContent = text;
}

function setDisconnected(statusText: HTMLSpanElement, text: string): void {
  connectionStatus.classList.remove('connected');
  connectionStatus.classList.add('disconnected');
  statusText.textContent = text;
}

/**
 * Get current offset from content script
 */
function getCurrentOffset(): void {
  sendMessage({ action: 'getOffset' }, (response) => {
    if (response?.offset !== undefined) {
      updateOffsetDisplay(response.offset as number);
    }
  });
}

/**
 * Update offset display
 */
function updateOffsetDisplay(offset: number): void {
  currentOffset = offset;
  
  // Format the offset value
  const sign = offset > 0 ? '+' : '';
  offsetValue.textContent = `${sign}${offset.toFixed(1)}`;
  
  // Update styling based on value
  offsetValue.classList.remove('positive', 'negative');
  if (offset > 0) {
    offsetValue.classList.add('positive');
  } else if (offset < 0) {
    offsetValue.classList.add('negative');
  }
  
  // Update hint text
  updateOffsetHint(offset);
}

/**
 * Update the hint text based on offset
 */
function updateOffsetHint(offset: number): void {
  if (offset === 0) {
    offsetHint.innerHTML = '<span class="hint-neutral">Subtitles are in sync</span>';
  } else if (offset > 0) {
    offsetHint.innerHTML = `<span class="hint-delay">Subtitles appear ${offset.toFixed(1)}s later</span>`;
  } else {
    offsetHint.innerHTML = `<span class="hint-advance">Subtitles appear ${Math.abs(offset).toFixed(1)}s earlier</span>`;
  }
}

/**
 * Adjust offset by a delta value
 */
function adjustOffset(delta: number): void {
  const newOffset = currentOffset + delta;
  
  // Round to avoid floating point issues
  const roundedOffset = Math.round(newOffset * 10) / 10;
  
  sendMessage({ action: 'setOffset', offset: roundedOffset }, (response) => {
    if (response?.success || response?.offset !== undefined) {
      updateOffsetDisplay((response.offset as number) ?? roundedOffset);
      showFeedback(delta > 0 ? 'Delayed' : 'Advanced');
    }
  });
}

/**
 * Reset offset to zero
 */
function resetOffset(): void {
  sendMessage({ action: 'resetOffset' }, (response) => {
    if (response?.success || response?.offset !== undefined) {
      updateOffsetDisplay(0);
      showFeedback('Reset');
    }
  });
}

/**
 * Handle drag over event
 */
function handleDragOver(e: DragEvent): void {
  e.preventDefault();
  e.stopPropagation();
  dropzone.classList.add('dragover');
}

/**
 * Handle drag leave event
 */
function handleDragLeave(e: DragEvent): void {
  e.preventDefault();
  e.stopPropagation();
  dropzone.classList.remove('dragover');
}

/**
 * Handle drop event
 */
function handleDrop(e: DragEvent): void {
  e.preventDefault();
  e.stopPropagation();
  dropzone.classList.remove('dragover');
  
  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    processFile(files[0]);
  }
}

/**
 * Handle file input change
 */
function handleFileSelect(e: Event): void {
  const input = e.target as HTMLInputElement;
  if (input.files && input.files.length > 0) {
    processFile(input.files[0]);
  }
}

/**
 * Process the selected subtitle file
 */
function processFile(file: File): void {
  const validExtensions = ['.srt', '.vtt', '.sub', '.ass'];
  const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
  
  if (!validExtensions.includes(fileExt)) {
    showToast('Unsupported file format', 'error');
    return;
  }
  
  const reader = new FileReader();
  
  reader.onload = (e) => {
    const content = e.target?.result as string;
    if (!content) {
      showToast('Failed to read file', 'error');
      return;
    }
    
    // Count subtitles (roughly)
    const count = countSubtitles(content, fileExt);
    
    // Send to content script
    sendMessage({ action: 'loadSubtitles', subtitles: content }, (response) => {
      if (response?.success) {
        showFileLoaded(file.name, count);
        // Save to storage for persistence
        saveSubtitle({
          fileName: file.name,
          count: count,
          content: content
        });
        showToast('Subtitles loaded!', 'success');
      } else {
        showToast('Failed to load subtitles', 'error');
      }
    });
  };
  
  reader.onerror = () => {
    showToast('Error reading file', 'error');
  };
  
  reader.readAsText(file);
}

/**
 * Count subtitles in the file content
 */
function countSubtitles(content: string, extension: string): number {
  if (extension === '.srt') {
    // Count numbered entries
    const matches = content.match(/^\d+$/gm);
    return matches ? matches.length : 0;
  } else if (extension === '.vtt') {
    // Count WEBVTT cues
    const matches = content.match(/\d{2}:\d{2}:\d{2}\.\d{3}/g);
    return matches ? Math.floor(matches.length / 2) : 0;
  }
  // For other formats, estimate
  const lines = content.split('\n').filter(l => l.trim()).length;
  return Math.floor(lines / 4);
}

/**
 * Show the file loaded state
 */
function showFileLoaded(name: string, count: number): void {
  dropzone.classList.add('hidden');
  fileLoaded.classList.add('visible');
  fileName.textContent = name;
  subtitleCount.textContent = `${count} subtitle${count !== 1 ? 's' : ''}`;
}

/**
 * Save subtitle data to Chrome storage
 */
function saveSubtitle(data: SubtitleData): void {
  chrome.storage.local.set({ [STORAGE_KEY_SUBTITLE]: data });
}

/**
 * Load saved subtitle from Chrome storage
 */
function loadSavedSubtitle(): void {
  chrome.storage.local.get([STORAGE_KEY_SUBTITLE], (result) => {
    const data = result[STORAGE_KEY_SUBTITLE] as SubtitleData | undefined;
    if (data && data.content) {
      // Show the loaded file UI
      showFileLoaded(data.fileName, data.count);
      
      // Re-send subtitles to content script (in case page was refreshed)
      sendMessage({ action: 'loadSubtitles', subtitles: data.content });
    }
  });
}

/**
 * Clear saved subtitle from Chrome storage
 */
function clearSavedSubtitle(): void {
  chrome.storage.local.remove(STORAGE_KEY_SUBTITLE);
}

/**
 * Clear loaded subtitles
 */
function clearSubtitles(): void {
  fileLoaded.classList.remove('visible');
  dropzone.classList.remove('hidden');
  fileInput.value = '';
  
  // Clear from storage
  clearSavedSubtitle();
  
  // Clear subtitles in content script
  sendMessage({ action: 'loadSubtitles', subtitles: '' }, () => {
    showToast('Subtitles cleared', 'success');
  });
}

/**
 * Show a visual feedback animation
 */
function showFeedback(action: string): void {
  // Add a subtle pulse to the offset value
  offsetValue.style.transform = 'scale(1.1)';
  setTimeout(() => {
    offsetValue.style.transform = 'scale(1)';
  }, 150);
}

/**
 * Show a toast notification
 */
function showToast(message: string, type: 'success' | 'error'): void {
  // Remove existing toast
  const existingToast = document.querySelector('.toast');
  if (existingToast) {
    existingToast.remove();
  }
  
  // Create new toast
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  // Animate in
  requestAnimationFrame(() => {
    toast.classList.add('visible');
  });
  
  // Remove after delay
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 400);
  }, 2500);
}

/**
 * Send a message to the content script
 */
function sendMessage(
  message: Record<string, unknown>,
  callback?: (response: Record<string, unknown> | undefined) => void
): void {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (chrome.runtime.lastError) {
      console.error('Error querying tabs:', chrome.runtime.lastError);
      callback?.(undefined);
      return;
    }

    const tabId = tabs[0]?.id;
    if (tabId === undefined) {
      callback?.(undefined);
      return;
    }

    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        console.log('Content script not ready:', chrome.runtime.lastError.message);
        callback?.(undefined);
        return;
      }
      callback?.(response);
    });
  });
}
