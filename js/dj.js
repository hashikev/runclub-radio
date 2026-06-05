// dj.js — the DJ console. You build a queue, control playback, and drop shout-outs.
import { createTransport } from "./transport.js";
import { SyncedPlayer, expectedSec } from "./sync.js";
import { loadCatalog, uploadFiles, deleteTrack, isCloud } from "./catalog.js";

const room = new URLSearchParams(location.search).get("room") || "main";
const transport = createTransport(room);
const audio = document.getElementById("dj-audio");
const player = new SyncedPlayer(audio, transport, { isDJ: true, onChange: render });

// Browsers won't let audio start outside a user gesture, and our play() happens
// in the sync loop. Unlock the DJ's own audio on their first click anywhere.
document.addEventListener("click", function unlock() {
  audio.play().then(() => { if (!player.state.isPlaying) audio.pause(); }).catch(() => {});
}, { once: true });

const $ = (id) => document.getElementById(id);
const fmt = (s) => {
  if (!Number.isFinite(s)) return "0:00";
  s = Math.max(0, Math.floor(s));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
};

// The available catalog (bundled demos + uploaded tracks), loaded async below.
let CATALOG = [];

// ---------- presence: count connected runners ----------
const seen = new Map(); // id -> last-seen clock ms
transport.onMessage((m) => {
  if (m.type === "presence") seen.set(m.id, transport.clockNow());
});
setInterval(() => {
  const cutoff = transport.clockNow() - 8000;
  for (const [id, t] of seen) if (t < cutoff) seen.delete(id);
  $("runner-count").textContent = seen.size;
}, 1000);

// ---------- runner share link ----------
const runnerUrl = new URL("runner.html", location.href);
runnerUrl.searchParams.set("room", room);
$("share-link").value = runnerUrl.toString();
$("copy-link").onclick = async () => {
  try {
    await navigator.clipboard.writeText(runnerUrl.toString());
    $("copy-link").textContent = "Copied!";
    setTimeout(() => ($("copy-link").textContent = "Copy link"), 1500);
  } catch {
    $("share-link").select();
  }
};

// ---------- transport mode banner ----------
$("mode").textContent = transport.constructor.name === "SupabaseTransport"
  ? "Online — real phones can join"
  : "Local mode — syncs tabs on this computer (see README to go live)";

// ---------- build the library pickers ----------
function trackRow(t, actionLabel, onAction) {
  const li = document.createElement("li");
  const span = document.createElement("span");
  span.className = "q-title";
  span.textContent = (t.kind === "shoutout" ? "📣 " : "") + t.title; // textContent = no injection
  const actions = document.createElement("span");
  actions.className = "q-actions";
  const act = document.createElement("button");
  act.textContent = actionLabel;
  act.onclick = () => onAction(t);
  actions.appendChild(act);
  if (t.uploaded) {
    const del = document.createElement("button");
    del.textContent = "✕";
    del.title = "Delete this upload for everyone";
    del.onclick = async () => {
      if (!confirm(`Delete "${t.title}" for everyone?`)) return;
      del.disabled = true;
      await deleteTrack(t);
      await refreshCatalog();
    };
    actions.appendChild(del);
  }
  li.appendChild(span);
  li.appendChild(actions);
  return li;
}

function renderLibrary() {
  const songs = CATALOG.filter((t) => t.kind === "track");
  const shouts = CATALOG.filter((t) => t.kind === "shoutout");
  const sl = $("song-list");
  sl.innerHTML = "";
  if (!songs.length) sl.innerHTML = '<li class="muted">No songs yet — upload some above.</li>';
  for (const t of songs) sl.appendChild(trackRow(t, "Add", addToQueue));
  const hl = $("shout-list");
  hl.innerHTML = "";
  if (!shouts.length) hl.innerHTML = '<li class="muted">No shout-outs yet — upload one above.</li>';
  for (const t of shouts) hl.appendChild(trackRow(t, "Now", dropShoutoutNow));
}

// ---------- DJ actions ----------
function addToQueue(item) {
  player.commit((s) => {
    s.queue.push({ ...item });
    if (s.index < 0) { s.index = 0; startCurrent(s); } // first track -> auto start
  });
}

function startCurrent(s) {
  s.isPlaying = true;
  s.startedAtClockMs = transport.clockNow() - (s.pausedAtSec || 0) * 1000;
  s.pausedAtSec = 0;
}

function playPause() {
  player.commit((s) => {
    if (s.index < 0 && s.queue.length) s.index = 0;
    if (s.index < 0) return;
    if (s.isPlaying) {
      s.pausedAtSec = expectedSec(s, () => transport.clockNow());
      s.isPlaying = false;
    } else {
      startCurrent(s);
    }
  });
}

function jumpTo(index) {
  player.commit((s) => {
    if (index < 0 || index >= s.queue.length) return;
    s.index = index;
    s.pausedAtSec = 0;
    startCurrent(s);
  });
}

function next() { jumpTo(player.state.index + 1); }
function prev() { jumpTo(player.state.index - 1); }

function removeAt(index) {
  player.commit((s) => {
    if (index > s.index) { s.queue.splice(index, 1); return; }
    if (index < s.index) { s.queue.splice(index, 1); s.index -= 1; return; }
    // removing the current item -> drop it and play whatever shifts into its place
    s.queue.splice(index, 1);
    if (s.index >= s.queue.length) s.index = s.queue.length - 1;
    if (s.index < 0) { s.isPlaying = false; return; }
    startCurrent(s);
  });
}

function move(index, dir) {
  const j = index + dir;
  player.commit((s) => {
    if (j < 0 || j >= s.queue.length) return;
    [s.queue[index], s.queue[j]] = [s.queue[j], s.queue[index]];
    if (s.index === index) s.index = j;
    else if (s.index === j) s.index = index;
  });
}

// Drop a shout-out in immediately: insert right after current and jump to it.
function dropShoutoutNow(item) {
  player.commit((s) => {
    const at = Math.max(0, s.index) + 1;
    s.queue.splice(at, 0, { ...item });
    s.index = at;
    s.pausedAtSec = 0;
    startCurrent(s);
  });
}

$("play-pause").onclick = playPause;
$("next").onclick = next;
$("prev").onclick = prev;

// ---------- render the queue + now-playing ----------
function render(s) {
  // now playing
  const cur = s.index >= 0 ? s.queue[s.index] : null;
  $("now-title").textContent = cur ? (cur.kind === "shoutout" ? "📣 " + cur.title : cur.title) : "Nothing queued";
  $("play-pause").textContent = s.isPlaying ? "⏸ Pause" : "▶︎ Play";
  $("eq")?.classList.toggle("paused", !s.isPlaying);

  // queue list
  const ul = $("queue");
  ul.innerHTML = "";
  s.queue.forEach((item, i) => {
    const li = document.createElement("li");
    li.className = i === s.index ? "current" : "";
    const label = (item.kind === "shoutout" ? "📣 " : "") + item.title;
    li.innerHTML = `
      <span class="q-title">${label}</span>
      <span class="q-actions">
        <button data-a="play">▶︎</button>
        <button data-a="up">↑</button>
        <button data-a="down">↓</button>
        <button data-a="rm">✕</button>
      </span>`;
    li.querySelector('[data-a="play"]').onclick = () => jumpTo(i);
    li.querySelector('[data-a="up"]').onclick = () => move(i, -1);
    li.querySelector('[data-a="down"]').onclick = () => move(i, 1);
    li.querySelector('[data-a="rm"]').onclick = () => removeAt(i);
    ul.appendChild(li);
  });
}

// progress readout for the DJ
setInterval(() => {
  const s = player.state;
  if (s.index < 0) { $("now-time").textContent = ""; return; }
  const pos = expectedSec(s, () => transport.clockNow());
  const dur = s.queue[s.index]?.duration || audio.duration || 0;
  $("now-time").textContent = `${fmt(pos)} / ${fmt(dur)}`;
}, 250);

// ---------- catalog load + upload wiring ----------
async function refreshCatalog() {
  CATALOG = await loadCatalog();
  renderLibrary();
}
const setUpStatus = (msg) => ($("upload-status").textContent = msg);
$("refresh-catalog").onclick = refreshCatalog;

$("upload-btn").onclick = async () => {
  const input = $("file-input");
  if (!input.files || !input.files.length) return setUpStatus("Pick some audio files first.");
  if (!isCloud()) return setUpStatus("Uploads need the online backend — you're in Local mode.");
  const asShout = $("as-shout").checked;
  $("upload-btn").disabled = true;
  try {
    const res = await uploadFiles(input.files, asShout, (i, n, name) =>
      setUpStatus(`Uploading ${i}/${n}: ${name}…`)
    );
    const ok = res.filter((r) => r.ok).length;
    const failed = res.filter((r) => !r.ok);
    setUpStatus(`✓ Uploaded ${ok} file${ok === 1 ? "" : "s"}` +
      (failed.length ? ` · ${failed.length} failed (${failed[0].error || "error"})` : ""));
    input.value = "";
    await refreshCatalog();
  } catch (e) {
    setUpStatus("Upload error: " + (e?.message || e));
  } finally {
    $("upload-btn").disabled = false;
  }
};

// Re-broadcast state every 3s so late-joining runners sync up quickly.
setInterval(() => player.heartbeat(), 3000);

render(player.state);
refreshCatalog();
