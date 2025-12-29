import { PlatformDetector } from './PlatformDetector';
import type { Subtitle, StreamingPlatformInstance } from './types';

export class SubtitleOverlay {
  private overlay: HTMLDivElement | null = null;
  private currentSubtitles: Subtitle[] = [];
  private platform: StreamingPlatformInstance | null = null;
  private timeOffset: number = 0; // Time offset in seconds
  private fontSize: number = 28; // Font size in pixels
  private fontColor: string = '#FFFFFF'; // Font color

  constructor() {
    this.initialize();
    this.setupMessageListener();
  }

  private initialize(): void {
    // Detect the platform
    this.platform = PlatformDetector.detect();
    if (!this.platform) {
      console.error('No supported platform detected');
      return;
    }

    console.log('Detected platform:', this.platform.constructor.name);

    // Create the subtitle overlay element
    this.overlay = document.createElement('div');
    this.overlay.className = 'subtitle-overlay';
    document.body.appendChild(this.overlay);

    // Show initial placeholder content
    this.overlay.innerHTML = `
      <div class="time-display">
        <span class="time">--:--</span>
        <span class="separator">/</span>
        <span class="time">--:--</span>
      </div>
    `;

    // Start the update loop immediately, even before video player is found
    // This ensures the timer updates as soon as the video player is detected
    this.platform.setupVideoListeners(() => {
      this.updateDisplay();
    });

    // Start observing for video player
    this.platform.observeVideoPlayer(() => {
      if (this.platform?.videoPlayer && !this.platform.videoPlayerFound) {
        this.platform.videoPlayerFound = true;
        this.setupVideoListeners();
      }
    });
  }

  private setupVideoListeners(): void {
    if (!this.platform?.videoPlayer) return;

    this.platform.setupVideoListeners(() => {
      this.updateDisplay();
    });

    // Initial display update
    this.updateDisplay();

    console.log('Video player found:', this.platform.videoPlayer);
  }

  private parseTime(timeStr: string): number {
    // Parse time in format HH:MM:SS,mmm or HH:MM:SS.mmm
    // Also handle position metadata that may follow (e.g., "00:01:23,456 X1:100")
    const cleanTime = timeStr.split(' ')[0]; // Remove any position metadata
    
    // Handle both comma and period as millisecond separator
    const [time, milliseconds] = cleanTime.includes(',') 
      ? cleanTime.split(',') 
      : cleanTime.split('.');
    
    const timeParts = time.split(':').map(Number);
    
    // Handle both HH:MM:SS and MM:SS formats
    let hours = 0, minutes = 0, seconds = 0;
    if (timeParts.length === 3) {
      [hours, minutes, seconds] = timeParts;
    } else if (timeParts.length === 2) {
      [minutes, seconds] = timeParts;
    }
    
    const ms = milliseconds ? Number(milliseconds) : 0;
    return hours * 3600 + minutes * 60 + seconds + ms / 1000;
  }

  private parseSubtitles(subtitleText: string): Subtitle[] {
    const subtitles: Subtitle[] = [];
    
    // Normalize line endings (handle Windows \r\n and old Mac \r)
    const normalizedText = subtitleText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // Split by double newlines (empty lines between subtitle blocks)
    const blocks = normalizedText.split(/\n\n+/);

    for (const block of blocks) {
      const lines = block.trim().split('\n');
      if (lines.length < 2) continue;

      // Find the line with the timestamp (contains ' --> ')
      let timeLineIndex = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(' --> ')) {
          timeLineIndex = i;
          break;
        }
      }
      
      if (timeLineIndex === -1) continue;
      
      const timeParts = lines[timeLineIndex].split(' --> ');
      if (timeParts.length !== 2) continue;
      
      // Parse index (line before timestamp, if it exists and is a number)
      let index = 0;
      if (timeLineIndex > 0) {
        const possibleIndex = parseInt(lines[timeLineIndex - 1].trim());
        if (!isNaN(possibleIndex)) {
          index = possibleIndex;
        }
      }
      
      const [startTime, endTime] = timeParts.map((t) => t.trim());
      // Text is everything after the timestamp line
      const text = lines.slice(timeLineIndex + 1).join('\n').trim();
      
      if (!text) continue; // Skip entries with no text

      subtitles.push({
        index,
        startTime: this.parseTime(startTime),
        endTime: this.parseTime(endTime),
        text: text,
      });
    }

    console.log(`Parsed ${subtitles.length} subtitles`);
    return subtitles;
  }

  private updateDisplay(): void {
    if (!this.platform || !this.overlay) return;

    const currentTime = this.platform.getCurrentTime();
    const duration = this.platform.getDuration();

    // Always show the timer if we have a valid time, even without subtitles
    if (currentTime === null) {
      // If we can't get time yet, show a placeholder or hide the overlay
      this.overlay.innerHTML = `
        <div class="time-display">
          <span class="time">--:--</span>
          <span class="separator">/</span>
          <span class="time">--:--</span>
        </div>
      `;
      return;
    }

    const formattedTime = this.formatTime(currentTime);
    const formattedDuration = duration ? this.formatTime(duration) : '--:--';

    // Find the current subtitle, applying the offset to the subtitle times
    // Positive offset delays subtitles (appear later), negative offset advances them (appear earlier)
    let currentSubtitle: Subtitle | undefined;
    if (this.currentSubtitles.length > 0) {
      currentSubtitle = this.currentSubtitles.find(
        (sub) =>
          currentTime >= sub.startTime + this.timeOffset &&
          currentTime < sub.endTime + this.timeOffset
      );
      
      // Debug: Log every 5 seconds to show subtitle matching status
      if (Math.floor(currentTime) % 5 === 0 && Math.floor(currentTime * 10) % 10 === 0) {
        console.log(`[OpenCaptions] Time: ${currentTime.toFixed(2)}s, Subtitles loaded: ${this.currentSubtitles.length}, Current subtitle: ${currentSubtitle ? 'YES' : 'NO'}`);
        if (this.currentSubtitles.length > 0 && this.currentSubtitles.length <= 5) {
          console.log('[OpenCaptions] First few subtitles:', this.currentSubtitles.slice(0, 3));
        }
      }
    }

    this.overlay.innerHTML = `
      <div class="time-display">
        <span class="time">${formattedTime}</span>
        <span class="separator">/</span>
        <span class="time">${formattedDuration}</span>
        ${
          this.timeOffset !== 0
            ? `<span class="offset">(${this.timeOffset > 0 ? '+' : ''}${this.timeOffset}s)</span>`
            : ''
        }
      </div>
      ${currentSubtitle ? `<div class="subtitle-text" style="font-size: ${this.fontSize}px; color: ${this.fontColor};">${currentSubtitle.text}</div>` : ''}
    `;
  }

  private formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    const milliseconds = Math.floor((seconds % 1) * 1000);

    // Always show HH:MM:SS.mmm format
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds
      .toString()
      .padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
  }

  loadSubtitles(subtitleText: string): void {
    console.log('[OpenCaptions] Loading subtitles, text length:', subtitleText.length);
    this.currentSubtitles = this.parseSubtitles(subtitleText);

    console.log('[OpenCaptions] Parsed subtitles count:', this.currentSubtitles.length);
    if (this.currentSubtitles.length > 0) {
      console.log('[OpenCaptions] First subtitle:', this.currentSubtitles[0]);
      console.log('[OpenCaptions] Last subtitle:', this.currentSubtitles[this.currentSubtitles.length - 1]);
    }
    // Update display after loading subtitles
    this.updateDisplay();
  }

  cleanup(): void {
    if (this.platform) {
      this.platform.cleanup();
    }

    if (this.overlay?.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
      this.overlay = null;
    }
  }

  increaseOffset(): void {
    this.timeOffset += 1;
    this.updateDisplay();
  }

  decreaseOffset(): void {
    this.timeOffset -= 1;
    this.updateDisplay();
  }

  resetOffset(): void {
    this.timeOffset = 0;
    this.updateDisplay();
  }

  setOffset(offset: number): void {
    this.timeOffset = offset;
    this.updateDisplay();
  }

  getOffset(): number {
    return this.timeOffset;
  }

  setAppearance(fontSize: number, fontColor: string): void {
    console.log('[OpenCaptions] setAppearance called:', { fontSize, fontColor });
    this.fontSize = fontSize;
    this.fontColor = fontColor;
    this.applyAppearance();
    this.updateDisplay();
    console.log('[OpenCaptions] Appearance updated:', { fontSize: this.fontSize, fontColor: this.fontColor });
  }

  private applyAppearance(): void {
    if (!this.overlay) return;
    
    // Apply font color to the overlay
    this.overlay.style.setProperty('--subtitle-font-size', `${this.fontSize}px`);
    this.overlay.style.setProperty('--subtitle-font-color', this.fontColor);
  }

  private setupMessageListener(): void {
    chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
      switch (request.action) {
        case 'getOffset':
          sendResponse({ offset: this.timeOffset });
          return false; // Response sent synchronously
        case 'setOffset':
          this.setOffset(request.offset);
          sendResponse({ success: true, offset: this.timeOffset });
          return false; // Response sent synchronously
        case 'increaseOffset':
          this.increaseOffset();
          sendResponse({ success: true, offset: this.timeOffset });
          return false; // Response sent synchronously
        case 'decreaseOffset':
          this.decreaseOffset();
          sendResponse({ success: true, offset: this.timeOffset });
          return false; // Response sent synchronously
        case 'resetOffset':
          this.resetOffset();
          sendResponse({ success: true, offset: this.timeOffset });
          return false; // Response sent synchronously
      }
      return false; // Not handled by this listener
    });
  }
}

