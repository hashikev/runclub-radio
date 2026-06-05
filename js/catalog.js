// catalog.js — the DJ's available tracks. In online mode this is the bundled
// demos PLUS whatever has been uploaded to Supabase Storage (so the DJ can add
// real music from any device, no redeploy). Runners never call this — they get
// playable URLs through the synced queue.
import { CONFIG } from "./config.js";
import { LIBRARY } from "./library.js";

const BUCKET = "tracks";
let _client = null;
async function client() {
  if (_client) return _client;
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  _client = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);
  return _client;
}

export function isCloud() { return !!(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey); }

// Turn a stored object name back into a clean display title. Stored names look
// like "Eye_of_the_Tiger__a1b2c3.mp3" (we add "__<id>" to keep names unique).
function titleFromName(name) {
  const base = name
    .replace(/__[a-z0-9]+(\.[^.]+)?$/i, "") // drop our uniqueness suffix (+ext)
    .replace(/\.[^.]+$/, "");               // or just the extension
  return (
    base
      .replace(/^shoutout[-_ ]?/i, "")
      .replace(/^\d+[\s._-]+/, "")
      .replace(/[-_]+/g, " ")
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase()) || name
  );
}

export async function loadCatalog() {
  const items = LIBRARY.map((t) => ({ ...t })); // bundled demos always available
  if (!isCloud()) return items;
  try {
    const c = await client();
    const { data, error } = await c.storage
      .from(BUCKET)
      .list("", { limit: 1000, sortBy: { column: "created_at", order: "asc" } });
    if (error) throw error;
    for (const obj of data || []) {
      if (!obj.name || obj.name === ".emptyFolderPlaceholder") continue;
      const isShout = /^shoutout/i.test(obj.name);
      const { data: pub } = c.storage.from(BUCKET).getPublicUrl(obj.name);
      items.push({
        id: "up-" + obj.name,
        title: titleFromName(obj.name),
        url: pub.publicUrl,
        kind: isShout ? "shoutout" : "track",
        duration: null,          // learned at play time via audio.duration
        uploaded: true,
        storageName: obj.name,
      });
    }
  } catch (e) {
    console.warn("catalog: could not list uploads —", e?.message || e);
  }
  return items;
}

const rand = () => Math.random().toString(36).slice(2, 8);

export async function uploadFiles(fileList, asShoutout, onEach) {
  const c = await client();
  const out = [];
  let i = 0;
  for (const file of fileList) {
    i++;
    onEach?.(i, fileList.length, file.name);
    const ext = (file.name.match(/\.[^.]+$/) || [""])[0] || "";
    const base = file.name.replace(/\.[^.]+$/, "").replace(/[^\w\- ]+/g, "").trim() || "track";
    const objName = `${asShoutout ? "shoutout-" : ""}${base}__${rand()}${ext}`.replace(/\s+/g, "_");
    const { error } = await c.storage
      .from(BUCKET)
      .upload(objName, file, { cacheControl: "3600", contentType: file.type || undefined, upsert: false });
    out.push({ name: file.name, ok: !error, error: error?.message });
  }
  return out;
}

export async function deleteTrack(item) {
  if (!item.uploaded || !isCloud()) return false;
  const c = await client();
  const { error } = await c.storage.from(BUCKET).remove([item.storageName]);
  return !error;
}
