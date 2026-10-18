// =====================================================================
//  CONFIGURAZIONE DELL'APP  –  da compilare UNA VOLTA (vedi guida/01_Supabase.md)
//
//  Questi valori sono "pubblici" per definizione: finiscono nel browser di chi
//  apre l'app. La sicurezza è garantita dal login + dalle regole RLS del database,
//  NON dal tenere nascosti questi valori. Le credenziali Twilio e Google NON vanno qui.
// =====================================================================
window.APP_CONFIG = {
  // Supabase → Project Settings → API → Project URL
  SUPABASE_URL: "https://ymbfyzxeibeedtgetlhw.supabase.co",

  // Supabase → Project Settings → API Keys → "anon public" (oppure la "publishable key")
  SUPABASE_ANON_KEY: "sb_publishable_zUXXGCbSoA530_PH764lJQ_IprJm8mu",

  // Email dell'utente amministratore creato in Supabase (accesso rapido con codice 2103)
  ADMIN_EMAIL: "marco.strianese1998@gmail.com",

  // Prefisso della password dell'admin: password reale = prefisso + codice (es. "Strozzi#2103").
  // Supabase vuole password di almeno 6 caratteri, per questo serve il prefisso.
  ADMIN_PASSWORD_PREFIX: "Strozzi#",
};
