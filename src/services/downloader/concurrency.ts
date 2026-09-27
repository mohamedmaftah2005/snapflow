/** Simple semaphore for yt-dlp concurrency. Phase 3 replaces with BullMQ. */
class Semaphore {
  private active = 0;
  constructor(private readonly max: number) {}

  tryAcquire(): boolean {
    if (this.active >= this.max) return false;
    this.active += 1;
    return true;
  }

  release(): void {
    this.active = Math.max(0, this.active - 1);
  }

  get inFlight(): number {
    return this.active;
  }
}

let shared: Semaphore | null = null;

export function getSemaphore(max: number): Semaphore {
  if (!shared) shared = new Semaphore(max);
  return shared;
}

/** Test-only isolated semaphore. */
export function createSemaphore(max: number): Semaphore {
  return new Semaphore(max);
}
