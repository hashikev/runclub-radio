# 🏃 Run Club Radio

Everyone in your run club hears the **same song at the same second**, on their own
earbuds — a silent-disco run. You're the DJ; runners tap a link and stay synced
hands-free. Drop **shout-outs** (your own voice clips / ads) and they play on every
phone in sync, then roll into the next song.

No accounts. No app store. No Spotify needed (and on purpose — Spotify's rules ban
this kind of synced group broadcast; using your own audio means *you* control
everything, including the shout-outs).

---

## Run it (on your computer)

You need a tiny local web server (browsers block the app from `file://`). Any one of:

```bash
cd run-club-radio        # this folder
python3 -m http.server 8000
```

Then open **http://localhost:8000** in your browser.

- Click **I'm the DJ** → add songs, hit Play, drop a shout-out.
- In another tab/window, click **I'm running** → **Tap in**. It locks onto the DJ.
- Open several runner tabs — they all stay in sync. (That proves the engine.)

> Local mode syncs browser tabs **on this one computer**. To sync **real phones over
> the internet**, do Phase 2 below.

---

## Use your own music

1. Drop audio files into the **`tracks/`** folder (`.mp3`, `.m4a`, `.wav`, …).
2. Name any ad/announcement clip starting with **`shoutout`** (e.g.
   `shoutout-sponsor.mp3`) so it shows up under *Drop a shout-out*.
3. Rebuild the playlist list:
   ```bash
   node scan-tracks.js
   ```

Use music you have the right to play (your own files, or a royalty-free library like
Uppbeat / Epidemic Sound). The included demo tones + spoken clip are royalty-free
placeholders — delete them once you add your own.

---

## Phase 2 — make it work on real phones 📱

Two small steps: a realtime backend (so phones can talk) and putting the files online.

### A. Turn on realtime sync (free)
1. Create a free project at <https://supabase.com>.
2. **Project Settings → API** → copy the **Project URL** and the **anon public** key.
3. Paste both into **`js/config.js`**. Done — it switches from Local to Online mode
   automatically (it only uses realtime broadcast; no database or login).

### B. Put the app online
Host this folder anywhere that serves static files + your audio over HTTPS — e.g.
**Netlify** or **Vercel** (drag-and-drop the folder), or GitHub Pages. You'll get a
URL like `https://your-run-club.netlify.app`. Share `…/runner.html` with your runners.

That's it: you open `…/dj.html`, share the runner link, everyone taps in on their
phones and runs in sync.

---

## Tips for a real run
- Tell runners to **Add to Home Screen** (it launches fullscreen like an app and keeps
  audio playing with the screen off).
- Earbuds in, volume up, then pocket the phone — it's hands-free after **Tap in**.
- The DJ phone is the brain. Keep it awake (or on Phase-2 hosting, any device with the
  DJ page open drives the room).

## How it works (1 paragraph)
The DJ broadcasts a tiny "what's playing and where" message. Every phone computes where
the song *should* be from a shared clock and nudges its own playback to match a few
times a second — small drift = a gentle speed nudge, big drift = a snap. At track
boundaries each phone advances on its own using known song lengths, so there's no gap.
Shout-outs are just queue items, so they sync the exact same way.

## File map
```
index.html / dj.html / runner.html   the three screens
js/sync.js          the sync engine (shared clock + correction loop)
js/transport.js     messaging: Local (tabs) or Supabase (real phones)
js/config.js        paste Supabase keys here for Phase 2
js/library.js       auto-generated playlist (run scan-tracks.js)
js/dj.js / runner.js page logic
tracks/             your audio (+ demo placeholders)
scan-tracks.js      rebuilds js/library.js from tracks/
```
