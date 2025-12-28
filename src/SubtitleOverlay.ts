import { PlatformDetector } from './PlatformDetector';
import type { Subtitle, StreamingPlatformInstance } from './types';

export class SubtitleOverlay {
  private overlay: HTMLDivElement | null = null;
  private currentSubtitles: Subtitle[] = [];
  private platform: StreamingPlatformInstance | null = null;
  private timeOffset: number = 0; // Time offset in seconds

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
    // Parse time in format HH:MM:SS,mmm
    const [time, milliseconds] = timeStr.split(',');
    const [hours, minutes, seconds] = time.split(':').map(Number);
    return hours * 3600 + minutes * 60 + seconds + Number(milliseconds) / 1000;
  }

  private parseSubtitles(subtitleText: string): Subtitle[] {
    const subtitles: Subtitle[] = [];
    const blocks = subtitleText.split('\n\n');

    for (const block of blocks) {
      const lines = block.split('\n');
      if (lines.length < 3) continue;

      const index = parseInt(lines[0]);
      const timeParts = lines[1].split(' --> ');
      if (timeParts.length !== 2) continue;
      
      const [startTime, endTime] = timeParts.map((t) => t.trim());
      const text = lines.slice(2).join('\n');

      subtitles.push({
        index,
        startTime: this.parseTime(startTime),
        endTime: this.parseTime(endTime),
        text: text,
      });
    }

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
      ${currentSubtitle ? `<div class="subtitle-text">${currentSubtitle.text}</div>` : ''}
    `;
  }

  private formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    const milliseconds = Math.floor((seconds % 1) * 1000);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds
        .toString()
        .padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
    } else {
      return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}.${milliseconds
        .toString()
        .padStart(3, '0')}`;
    }
  }

  loadSubtitles(subtitleText: string): void {
    this.currentSubtitles = this.parseSubtitles(subtitleText);
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

