// runner.js — what each runner's phone runs. Tap once, then it stays locked
// onto the DJ hands-free.
import { createTransport } from "./transport.js";
import { SyncedPlayer, expectedSec } from "./sync.js";

const room = new URLSearchParams(location.search).get("room") || "main";
const transport = createTransport(room);
const audio = document.getElementById("runner-audio");
const player = new SyncedPlayer(audio, transport, { isDJ: false, onChange: render });

const $ = (id) => document.getElementById(id);
const fmt = (s) => {
  if (!Number.isFinite(s)) return "0:00";
  s = Math.max(0, Math.floor(s));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
};

// A stable-ish id for presence counting on the DJ side.
const myId = Math.random().toString(36).slice(2);
let joined = false;

// Announce presence so the DJ sees the runner count.
setInterval(() => {
  if (joined) transport.publish({ type: "presence", id: myId });
}, 3000);

// Browsers require a tap before audio can start. The join button is that tap.
$("join").onclick = async () => {
  await transport.ready;
  joined = true;
  // Unlock audio within the user gesture.
  try { await audio.play(); audio.pause(); } catch {}
  transport.publish({ type: "presence", id: myId });
  $("lobby").hidden = true;
  $("player").hidden = false;
};

// Volume control (their own device level within the app).
$("vol").oninput = (e) => { audio.volume = Number(e.target.value); };

// "Re-sync" — if a runner ever feels off, snap them back hard.
$("resync").onclick = () => {
  const s = player.state;
  if (s.index >= 0) audio.currentTime = expectedSec(s, () => transport.clockNow());
};

function render(s) {
  const cur = s.index >= 0 ? s.queue[s.index] : null;
  if (!cur) {
    $("track").textContent = "Waiting for the DJ…";
    $("kind").textContent = "STANDING BY";
    return;
  }
  $("track").textContent = cur.title;
  $("kind").textContent = cur.kind === "shoutout" ? "📣 SHOUT-OUT" : "NOW PLAYING";
  $("kind").className = cur.kind === "shoutout" ? "kind shout" : "kind";
}

// Progress bar + sync indicator.
setInterval(() => {
  const s = player.state;
  if (s.index < 0) return;
  const dur = s.queue[s.index]?.duration || audio.duration || 0;
  const pos = expectedSec(s, () => transport.clockNow());
  $("bar").style.width = dur ? Math.min(100, (pos / dur) * 100) + "%" : "0%";
  $("time").textContent = `${fmt(pos)} / ${fmt(dur)}`;

  // equalizer reflects play/pause
  $("eq")?.classList.toggle("paused", !s.isPlaying);

  // cyan when tightly aligned, amber while it's catching up
  const drift = Math.abs((audio.currentTime || 0) - pos);
  const dot = $("sync-dot");
  if (!s.isPlaying) { dot.className = "dot paused"; $("sync-text").textContent = "PAUSED BY DJ"; }
  else if (drift < 0.15) { dot.className = "dot ok"; $("sync-text").textContent = "LOCKED IN"; }
  else { dot.className = "dot warn"; $("sync-text").textContent = "CATCHING UP…"; }
}, 250);

render(player.state);
