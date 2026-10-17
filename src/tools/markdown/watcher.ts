/**
 * Polls a file in the background and reports when its contents differ from
 * the last version we know about (the one rendered or the one we saved).
 *
 * Browsers have no file-change events, so we stat the file cheaply
 * (lastModified + size) every second and only read its text when the stat
 * moves. For plain `File` objects (no File System Access API) the stat never
 * changes, so we re-read and compare the text itself.
 */
export type WatchEvent =
  | { type: 'change'; text: string }
  | { type: 'missing' }
  | { type: 'restored' }
  | { type: 'unreadable'; error: unknown }

export interface WatchSource {
  getFile(): Promise<File>
  /** Re-read text every tick instead of trusting lastModified/size. */
  compareText?: boolean
}

export class FileWatcher {
  private known = { text: '', modified: -1, size: -1 }
  private timer: number | undefined
  private inFlight = false
  private missing = false
  private stopped = true
  private suspended = 0
  private failures = 0

  constructor(
    private source: WatchSource,
    private onEvent: (e: WatchEvent) => void,
    private interval = { visible: 1000, hidden: 4000 },
  ) {}

  /** Record the version on disk we consider current (after a load or a save). */
  async acknowledge(text: string, file?: File) {
    this.known.text = text
    try {
      const f = file ?? (await this.source.getFile())
      this.known.modified = f.lastModified
      this.known.size = f.size
    } catch {
      this.known.modified = -1
    }
  }

  get knownText() {
    return this.known.text
  }

  start() {
    if (!this.stopped) return
    this.stopped = false
    document.addEventListener('visibilitychange', this.onWake)
    window.addEventListener('focus', this.onWake)
    this.schedule()
  }

  stop() {
    this.stopped = true
    clearTimeout(this.timer)
    document.removeEventListener('visibilitychange', this.onWake)
    window.removeEventListener('focus', this.onWake)
  }

  /** Hold polling while we write, so our own save isn't seen as an external change. */
  async whileSuspended<T>(fn: () => Promise<T>): Promise<T> {
    this.suspended++
    try {
      return await fn()
    } finally {
      this.suspended--
    }
  }

  checkNow = () => this.tick()

  private onWake = () => {
    if (document.visibilityState === 'visible') this.tick()
  }

  private schedule() {
    if (this.stopped) return
    clearTimeout(this.timer)
    const base = document.visibilityState === 'visible' ? this.interval.visible : this.interval.hidden
    const backoff = Math.min(this.failures, 5) * 1000
    this.timer = window.setTimeout(() => this.tick(), base + backoff)
  }

  private async tick() {
    if (this.stopped || this.inFlight) return
    if (this.suspended) return this.schedule()
    this.inFlight = true
    try {
      const file = await this.source.getFile()
      this.failures = 0
      if (this.missing) {
        this.missing = false
        this.onEvent({ type: 'restored' })
      }
      const statChanged = file.lastModified !== this.known.modified || file.size !== this.known.size
      if (statChanged || this.source.compareText) {
        const text = await file.text()
        if (this.suspended) return
        this.known.modified = file.lastModified
        this.known.size = file.size
        if (text !== this.known.text) {
          this.known.text = text
          this.onEvent({ type: 'change', text })
        }
      }
    } catch (error) {
      const name = error instanceof DOMException ? error.name : ''
      this.failures++
      if (name === 'NotFoundError') {
        if (!this.missing) {
          this.missing = true
          this.onEvent({ type: 'missing' })
        }
      } else if (this.failures === 3) {
        this.onEvent({ type: 'unreadable', error })
      }
    } finally {
      this.inFlight = false
      this.schedule()
    }
  }
}
