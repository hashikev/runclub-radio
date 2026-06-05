// sync.js — keeps one <audio> element locked onto the shared session timeline.
// Used by BOTH the DJ and the runners. The DJ additionally has authority to
// change the state (skip, pause, drop a shout-out); runners only follow.

// How close is "in sync". Tuned for people running with earbuds, not studio work.
const SNAP_SEC = 0.4;   // drift bigger than this -> hard jump to the right spot
const NUDGE_SEC = 0.06; // smaller drift -> gently speed up / slow down to glide back
const TICK_MS = 250;    // how often we check alignment

// Build the very first (empty) session state.
export function emptyState() {
  return {
    type: "state",
    rev: 0,
    queue: [],        // [{id,title,url,kind,duration}]
    index: -1,        // which queue item is current (-1 = nothing loaded)
    isPlaying: false,
    startedAtClockMs: 0, // transport clock value at which the current item hit 0:00
    pausedAtSec: 0,      // playback position while paused
  };
}

// Where *should* the current item be right now, per the shared clock?
export function expectedSec(state, clockNow) {
  if (state.index < 0) return 0;
  return state.isPlaying ? (clockNow() - state.startedAtClockMs) / 1000 : state.pausedAtSec;
}

export class SyncedPlayer {
  constructor(audioEl, transport, { onChange, isDJ = false } = {}) {
    this.audio = audioEl;
    this.transport = transport;
    this.onChange = onChange || (() => {});
    this.isDJ = isDJ;
    this.state = emptyState();
    this.loadedUrl = null;

    this.audio.preservesPitch = true; // small speed nudges shouldn't change pitch

    transport.onMessage((msg) => this._onMessage(msg));
    this._timer = setInterval(() => this.tick(), TICK_MS);
  }

  // ---- incoming ----
  _onMessage(msg) {
    if (msg.type === "state") {
      // Let the transport learn the DJ's clock for cross-device offset correction.
      if (typeof msg.sentAtMs === "number") this.transport.noteRemoteClock?.(msg.sentAtMs);
      // A higher rev is an authoritative DJ action — always take it. At the same
      // rev (a heartbeat, or our own self-advance echoed back) only move forward,
      // so a heartbeat can never yank us back across a track boundary.
      const forward = msg.rev > this.state.rev ||
        (msg.rev === this.state.rev && msg.index >= this.state.index);
      if (forward) {
        this.state = { ...msg };
        this.onChange(this.state);
      }
    }
  }

  // ---- the correction loop ----
  tick() {
    const s = this.state;
    if (s.index < 0 || !s.queue[s.index]) return;
    const item = s.queue[s.index];

    // Load the right file if it changed.
    if (this.loadedUrl !== item.url) {
      this.loadedUrl = item.url;
      this.audio.src = item.url;
      this.audio.load();
      this._setMediaSession(item);
    }

    let want = expectedSec(s, () => this.transport.clockNow());

    // Self-advance at the boundary so playback is gapless even before the DJ's
    // "next" message lands. The DJ's authoritative message will confirm it.
    const dur = item.duration || this.audio.duration || Infinity;
    if (s.isPlaying && want >= dur - 0.02) {
      if (s.index + 1 < s.queue.length) {
        s.index += 1;
        s.startedAtClockMs += dur * 1000; // continue the same timeline seamlessly
        this.onChange(s);
        return; // re-evaluate next tick with the new item loaded
      } else {
        // End of the playlist — hold here.
        s.isPlaying = false;
        s.pausedAtSec = dur;
        this.onChange(s);
        return;
      }
    }

    // Match play/pause.
    if (s.isPlaying && this.audio.paused) this.audio.play().catch(() => {});
    if (!s.isPlaying && !this.audio.paused) this.audio.pause();
    if (!s.isPlaying) {
      if (Math.abs(this.audio.currentTime - want) > SNAP_SEC) this.audio.currentTime = want;
      return;
    }

    // Correct position while playing.
    if (!this.audio.duration || Number.isNaN(this.audio.duration)) return; // not loaded yet
    const drift = this.audio.currentTime - want; // +ve = we're ahead
    if (Math.abs(drift) > SNAP_SEC) {
      this.audio.currentTime = want;           // too far off — jump
      this.audio.playbackRate = 1;
    } else if (Math.abs(drift) > NUDGE_SEC) {
      this.audio.playbackRate = Math.max(0.96, Math.min(1.04, 1 - drift * 0.5)); // glide back
    } else {
      this.audio.playbackRate = 1;             // close enough
    }
  }

  _setMediaSession(item) {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: item.kind === "shoutout" ? "📣 " + item.title : item.title,
      artist: "Run Club Radio",
      album: "Live Run",
    });
  }

  // ---- DJ authority: publish a new state to everyone ----
  commit(mutator) {
    if (!this.isDJ) return;
    const next = { ...this.state, queue: [...this.state.queue] };
    mutator(next);
    next.rev = this.state.rev + 1;
    next.type = "state";
    next.sentAtMs = this.transport.clockNow();
    this.state = next;
    this.transport.publish(next);
    this.onChange(this.state);
  }

  // DJ re-broadcasts current state periodically so anyone who joined mid-run (or
  // missed a message) catches up. Keeps the same rev — it's not a new action.
  heartbeat() {
    if (!this.isDJ) return;
    this.transport.publish({ ...this.state, type: "state", sentAtMs: this.transport.clockNow() });
  }

  destroy() { clearInterval(this._timer); }
}
