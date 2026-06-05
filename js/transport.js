// transport.js — moves messages between the DJ and the runners.
//
// Two interchangeable backends behind one tiny interface:
//   - LocalTransport:    BroadcastChannel — instant, no signup, but only syncs
//                        tabs/windows in the SAME browser on the SAME computer.
//                        Perfect for trying it out and proving the sync engine.
//   - SupabaseTransport: real-time over the internet so actual phones sync.
//                        Turned on by filling in js/config.js (see README, Phase 2).
//
// The rest of the app never cares which one is active.

import { CONFIG } from "./config.js";

// A transport exposes:
//   publish(msg)            -> send a message to everyone in the room
//   onMessage(cb)           -> cb(msg) for every incoming message
//   clockNow()              -> shared timeline in ms (see clock-sync note below)
//   ready                   -> Promise that resolves once connected

class LocalTransport {
  constructor(room) {
    this.room = room;
    this.key = "runclub:" + room + ":snapshot";
    this.bc = new BroadcastChannel("runclub:" + room);
    this.handlers = [];
    this.bc.onmessage = (e) => this._emit(e.data);
    this.ready = Promise.resolve();
  }
  _emit(msg) {
    for (const h of this.handlers) h(msg);
  }
  onMessage(cb) {
    this.handlers.push(cb);
    // Replay the last known state so a tab opened mid-run catches up instantly.
    const snap = localStorage.getItem(this.key);
    if (snap) {
      try { cb(JSON.parse(snap)); } catch {}
    }
  }
  publish(msg) {
    this.bc.postMessage(msg);
    if (msg.type === "state") localStorage.setItem(this.key, JSON.stringify(msg));
  }
  // Same machine => everyone already shares Date.now(); no offset needed.
  clockNow() { return Date.now(); }
}

class SupabaseTransport {
  constructor(room, url, anonKey) {
    this.room = room;
    this.handlers = [];
    this.offset = 0; // estimated (serverClock - localClock) in ms
    this.ready = this._init(url, anonKey);
  }
  async _init(url, anonKey) {
    // Loaded from CDN in the HTML; see <script type="importmap"> in the pages.
    const { createClient } = await import(
      "https://esm.sh/@supabase/supabase-js@2"
    );
    this.client = createClient(url, anonKey, { realtime: { params: { eventsPerSecond: 20 } } });
    this.channel = this.client.channel("room:" + this.room, {
      config: { broadcast: { self: true } },
    });
    this.channel.on("broadcast", { event: "msg" }, ({ payload }) => this._emit(payload));
    await new Promise((res) => this.channel.subscribe((s) => s === "SUBSCRIBED" && res()));
  }
  _emit(msg) { for (const h of this.handlers) h(msg); }
  onMessage(cb) { this.handlers.push(cb); }
  async publish(msg) {
    await this.ready;
    this.channel.send({ type: "broadcast", event: "msg", payload: msg });
  }
  // For internet sync we align everyone to the DJ's clock via timestamps in the
  // heartbeat (see sync.js). offset is refined there; start at 0.
  clockNow() { return Date.now() + this.offset; }
}

export function createTransport(room) {
  if (CONFIG.supabaseUrl && CONFIG.supabaseAnonKey) {
    return new SupabaseTransport(room, CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);
  }
  return new LocalTransport(room);
}
