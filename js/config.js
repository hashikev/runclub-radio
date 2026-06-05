// config.js — backend settings.
//
// These are filled in for the live "runclub-radio" Supabase project, which turns
// on realtime sync across real phones over the internet. The publishable key is
// designed to be public (safe to ship in client code); it only allows the
// realtime broadcast this app uses — no database access, no login.
//
// To point at a different Supabase project, swap these two values. Leave them
// blank to fall back to Local mode (syncs only tabs on one computer).
export const CONFIG = {
  supabaseUrl: "https://sfudquxrxsmbdxcxstzi.supabase.co",
  supabaseAnonKey: "sb_publishable_7ZrIueUN6fAUWbQHoGYTXw__8tDlQ04",
};
