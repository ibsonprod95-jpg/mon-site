import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://ibrahima-ndiaye.vercel.app",
  "https://aibddemdikk-pro-1c6f.vercel.app",
  "https://aibddemdikk-git-main-pro-1c6f.vercel.app",
]);
const corsHeaders = (origin: string) => {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin",
  };
  if (allowedOrigins.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
};

const locations = new Set(["AIBD", "HLM GRAND YOFF", "TERMINUS GUEDIAWAYE"]);
const timeSlots = new Set(["07h00 – 15h00", "15h00 – 23h00", "23h00 – 07h00"]);
const states = new Set(["received", "searching", "found", "closed"]);
const bucket = "declaration-photos";
const maxImageBytes = 1024 * 1024;
const iterations = 180000;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function json(status: number, body: unknown, origin: string) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(origin) });
}
function randomHex(bytes: number) {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(data, (v) => v.toString(16).padStart(2, "0")).join("");
}
function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00Z");
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function decodeImage(value: unknown): { bytes: Uint8Array; type: string; ext: string } | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new Error("Image invalide.");
  const match = value.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("Format d’image invalide.");
  const binary = atob(match[2]);
  if (binary.length > maxImageBytes) throw new Error("Chaque image doit faire 1 Mo maximum.");
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const ext = match[1] === "image/jpeg" ? "jpg" : match[1].slice("image/".length);
  return { bytes, type: match[1], ext };
}
async function hashSecret(secret: string, saltHex?: string) {
  const salt = saltHex
    ? Uint8Array.from(saltHex.match(/.{2}/g)!.map((x) => parseInt(x, 16)))
    : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  const hash = Array.from(new Uint8Array(bits), (v) => v.toString(16).padStart(2, "0")).join("");
  const saltOut = Array.from(salt, (v) => v.toString(16).padStart(2, "0")).join("");
  return "$pbkdf2-sha256$" + iterations + "$" + saltOut + "$" + hash;
}
async function verifySecret(secret: string, stored: string) {
  if (/^[0-9a-f]{64}$/i.test(stored)) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
    const actual = Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, "0")).join("");
    const expected = stored.toLowerCase();
    if (actual.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  }
  const parts = stored.split("$");
  if (parts.length !== 5 || parts[1] !== "pbkdf2-sha256") return false;
  const count = Number(parts[2]);
  if (!Number.isInteger(count) || count < 100000 || count > 1000000) return false;
  const saltHex = parts[3];
  const salt = Uint8Array.from(saltHex.match(/.{2}/g) || [], (x) => parseInt(x, 16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: count }, key, 256);
  const actual = Array.from(new Uint8Array(bits), (v) => v.toString(16).padStart(2, "0")).join("");
  if (actual.length !== parts[4].length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ parts[4].charCodeAt(i);
  return diff === 0;
}
async function uploadImage(path: string, value: unknown) {
  const image = decodeImage(value);
  if (!image) return null;
  const objectPath = path + "." + image.ext;
  const { error } = await supabase.storage.from(bucket).upload(objectPath, image.bytes, {
    contentType: image.type, upsert: false, cacheControl: "3600",
  });
  if (error) throw error;
  return objectPath;
}
async function signedPhoto(path: string | null) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 900);
  return error ? null : data.signedUrl;
}
function privacyNotice(language: unknown) {
  if (language === "en") return "Your name, phone number and report details are stored to process and follow up on this report. Optional image files are stored privately. Keep your tracking code and private code safe; anyone with both can view the report.";
  if (language === "wo") return "Sa tur, nimero telefon ak xibaaru kayit bi dañu leen di denc ngir liggéey ci kayit bi ak toppandoo ko. Foto yi ñu yokk dañu leen di denc ci anam bu wóor. Dencal kodu toppandoo ak kodu sir: ku am ñaar ñépp mën na gis kayit bi.";
  return "Votre nom, votre téléphone et les renseignements de la déclaration sont enregistrés pour traiter le dossier et en assurer le suivi. Les images facultatives sont stockées dans un espace privé. Gardez vos codes de suivi et privé : ils permettent ensemble de consulter le dossier.";
}
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Une erreur est survenue.";
}

async function checkRateLimit(request: Request, action: string) {
  const limits: Record<string, [number, number]> = {
    health: [120, 3600],
    submit: [5, 3600],
    track: [60, 3600],
    "admin-login": [10, 3600],
    "admin-list": [60, 3600],
    "admin-update": [30, 3600],
    "admin-photo": [60, 3600],
  };
  const limit = limits[action];
  if (!limit) return null;

  const forwarded = request.headers.get("x-forwarded-for") || "";
  const clientIp = request.headers.get("cf-connecting-ip") || forwarded.split(",")[0].trim();
  if (!clientIp || clientIp.length > 100) {
    throw new Error("Impossible d’identifier la connexion pour limiter les tentatives.");
  }

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(clientIp));
  const clientKey = Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, "0")).join("");
  const { data, error } = await supabase.rpc("consume_declaration_rate_limit", {
    p_client_key: clientKey,
    p_action: action,
    p_limit: limit[0],
    p_window_seconds: limit[1],
  });
  if (error) throw error;
  return data === true;
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin") || "";
  if (!allowedOrigins.has(origin)) return json(403, { error: "Origine de requête non autorisée." }, "");
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (request.method !== "POST") return json(405, { error: "Méthode non autorisée." }, origin);

  try {
    const length = Number(request.headers.get("content-length") || 0);
    if (length > 5_000_000) return json(413, { error: "Requête trop volumineuse." }, origin);
    const raw = await request.text();
    if (raw.length > 5_000_000) return json(413, { error: "Requête trop volumineuse." }, origin);
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { return json(400, { error: "Requête invalide." }, origin); }
    const action = body.action;
    if (!["health", "submit", "track", "admin-login", "admin-list", "admin-update", "admin-photo"].includes(String(action))) {
      return json(400, { error: "Action inconnue." }, origin);
    }

    let withinLimit: boolean | null;
    try {
      withinLimit = await checkRateLimit(request, String(action));
    } catch (error) {
      console.error("declaration rate limit failed", error);
      return json(503, { error: "Le service de suivi est momentanément indisponible. Réessayez." }, origin);
    }
    if (withinLimit === false) {
      return new Response(JSON.stringify({ error: "Trop de tentatives. Veuillez réessayer plus tard." }), {
        status: 429,
        headers: { ...corsHeaders(origin), "Retry-After": "3600" },
      });
    }

    if (action === "health") {
      return json(200, { ok: true, privacyNotice: privacyNotice(body.language) }, origin);
    }

    if (action === "submit") {
      if (body.consent !== true) return json(400, { error: "Le consentement est requis." }, origin);
      const ownerName = typeof body.ownerName === "string" ? body.ownerName.trim() : "";
      const phone = typeof body.phone === "string" ? body.phone.trim() : "";
      const description = typeof body.description === "string" ? body.description.trim() : "";
      const declarationType = typeof body.declarationType === "string" ? body.declarationType : "lost";
      const takenDescription = typeof body.takenDescription === "string" ? body.takenDescription.trim() : "";
      const location = typeof body.location === "string" ? body.location : "";
      const lostDate = body.lostDate;
      const lostTimeSlot = typeof body.lostTimeSlot === "string" ? body.lostTimeSlot : "";
      const busNumber = typeof body.busNumber === "string" ? body.busNumber.trim() : "";
      if (!ownerName || ownerName.length > 120 || !phone || phone.length > 40 ||
          !description || description.length > 1200 || !["lost", "confused"].includes(declarationType) ||
          (declarationType === "confused" && (!takenDescription || takenDescription.length > 1200)) ||
          !locations.has(location) || !validDate(lostDate) || !timeSlots.has(lostTimeSlot) ||
          busNumber.length > 80) {
        return json(400, { error: "Vérifiez les renseignements obligatoires." }, origin);
      }

      let photoPath: string | null = null;
      let takenPhotoPath: string | null = null;
      let ticketPath: string | null = null;
      try {
        photoPath = await uploadImage(crypto.randomUUID() + "/baggage", body.photo);
        takenPhotoPath = declarationType === "confused"
          ? await uploadImage(crypto.randomUUID() + "/taken-baggage", body.takenBaggagePhoto)
          : null;
        ticketPath = await uploadImage(crypto.randomUUID() + "/ticket", body.ticketPhoto);
      } catch (error) {
        const uploaded = [photoPath, takenPhotoPath, ticketPath].filter(Boolean) as string[];
        if (uploaded.length) await supabase.storage.from(bucket).remove(uploaded);
        throw error;
      }

      const accessSecret = randomHex(16).toUpperCase();
      const accessSecretHash = await hashSecret(accessSecret);
      let created: Record<string, unknown> | null = null;
      let finalCode = "";
      let dbError: unknown = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        finalCode = "DD-" + randomHex(6).toUpperCase();
        const { data, error } = await supabase.rpc("create_lost_declaration", {
          p_id: crypto.randomUUID(),
          p_tracking_code: finalCode,
          p_access_secret_hash: accessSecretHash,
          p_owner_name: ownerName,
          p_phone: phone,
          p_description: description,
          p_color: "Non précisée",
          p_lost_location: location,
          p_lost_date: lostDate,
          p_lost_time_slot: lostTimeSlot,
          p_bus_number: busNumber || null,
          p_photo_path: photoPath,
          p_ticket_path: ticketPath,
          p_declaration_type: declarationType,
          p_taken_description: declarationType === "confused" ? takenDescription : null,
          p_taken_photo_path: takenPhotoPath,
        });
        if (!error) { created = data as Record<string, unknown>; dbError = null; break; }
        dbError = error;
        if ((error as { code?: string }).code !== "23505") break;
      }
      if (!created) {
        const paths = [photoPath, takenPhotoPath, ticketPath].filter(Boolean) as string[];
        if (paths.length) await supabase.storage.from(bucket).remove(paths);
        console.error("create_lost_declaration failed", dbError);
        return json(500, { error: "Impossible d’enregistrer la déclaration pour le moment." }, origin);
      }
      return json(200, { trackingCode: finalCode, accessSecret }, origin);
    }

    if (action === "track") {
      const trackingCode = typeof body.trackingCode === "string" ? body.trackingCode.trim().toUpperCase() : "";
      const accessSecret = typeof body.accessSecret === "string" ? body.accessSecret.trim() : "";
      if (!trackingCode || trackingCode.length > 40 || !accessSecret || accessSecret.length > 100) {
        return json(404, { error: "Dossier introuvable ou codes incorrects." }, origin);
      }
      const { data: row, error } = await supabase.from("declarations")
        .select("id,tracking_code,access_secret_hash,declaration_type,description,taken_description,status,lost_time_slot,updated_at,photo_path,taken_photo_path,ticket_path")
        .eq("tracking_code", trackingCode).maybeSingle();
      if (error || !row || !(await verifySecret(accessSecret, row.access_secret_hash))) {
        return json(404, { error: "Dossier introuvable ou codes incorrects." }, origin);
      }
      const { data: history, error: historyError } = await supabase.from("declaration_status_history")
        .select("status,note,created_at").eq("declaration_id", row.id).order("created_at", { ascending: true });
      if (historyError) console.error("status history read failed", historyError);
      const [baggage, takenBaggage, ticket] = await Promise.all([
        signedPhoto(row.photo_path), signedPhoto(row.taken_photo_path), signedPhoto(row.ticket_path),
      ]);
      return json(200, {
        trackingCode: row.tracking_code,
        declarationType: row.declaration_type || "lost",
        description: row.description,
        takenDescription: row.taken_description,
        status: row.status,
        lostTimeSlot: row.lost_time_slot,
        updatedAt: row.updated_at,
        history: history || [],
        photos: { baggage, takenBaggage, ticket },
      }, origin);
    }

      if (action === "admin-login") {
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (!email || email.length > 254 || !password || password.length > 256) {
        return json(400, { error: "Identifiants incorrects." }, origin);
      }
      const apiKey = request.headers.get("apikey");
      if (!apiKey) return json(503, { error: "Connexion au service impossible." }, origin);
      const authClient = createClient(Deno.env.get("SUPABASE_URL")!, apiKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await authClient.auth.signInWithPassword({ email, password });
      if (error || !data.session || !data.user?.email) {
        return json(401, { error: "Identifiants incorrects." }, origin);
      }
      const { data: allowedAdmin, error: allowlistError } = await supabase
        .from("admin_allowlist").select("email").eq("email", data.user.email.toLowerCase()).maybeSingle();
      if (allowlistError) {
        console.error("admin allowlist lookup failed", allowlistError);
        return json(503, { error: "Vérification du compte impossible. Réessayez." }, origin);
      }
      if (!allowedAdmin) return json(403, { error: "Accès réservé au compte autorisé." }, origin);
      return json(200, { token: data.session.access_token, expiresIn: data.session.expires_in }, origin);
    }

    if (action === "admin-list") {
      const token = typeof body.token === "string" ? body.token : "";
      const { data: authData, error: authError } = await supabase.auth.getUser(token);
      if (authError || !authData.user?.email) {
        return json(401, { error: "Session expirée. Reconnectez-vous." }, origin);
      }
      const { data: allowedAdmin, error: allowlistError } = await supabase
        .from("admin_allowlist").select("email").eq("email", authData.user.email.toLowerCase()).maybeSingle();
      if (allowlistError) return json(503, { error: "Vérification du compte impossible. Réessayez." }, origin);
      if (!allowedAdmin) return json(403, { error: "Accès réservé au compte autorisé." }, origin);
      const { data: records, error } = await supabase.from("declarations")
        .select("id,tracking_code,declaration_type,taken_description,owner_name,phone,description,color,lost_location,lost_date,lost_time_slot,bus_number,photo_path,taken_photo_path,ticket_path,status,created_at,updated_at")
        .order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return json(200, records || [], origin);
    }

    if (action === "admin-update") {
      const token = typeof body.token === "string" ? body.token : "";
      const { data: authData, error: authError } = await supabase.auth.getUser(token);
      if (authError || !authData.user?.email) {
        return json(401, { error: "Session expirée. Reconnectez-vous." }, origin);
      }
      const { data: allowedAdmin, error: allowlistError } = await supabase
        .from("admin_allowlist").select("email").eq("email", authData.user.email.toLowerCase()).maybeSingle();
      if (allowlistError) return json(503, { error: "Vérification du compte impossible. Réessayez." }, origin);
      if (!allowedAdmin) return json(403, { error: "Accès réservé au compte autorisé." }, origin);
      const id = typeof body.id === "string" ? body.id : "";
      const status = typeof body.status === "string" ? body.status : "";
      const note = typeof body.note === "string" ? body.note.trim() : "";
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
          || !states.has(status) || note.length > 500) {
        return json(400, { error: "Données de mise à jour invalides." }, origin);
      }
      const { data, error } = await supabase.rpc("update_lost_declaration_status", {
        p_id: id, p_status: status, p_note: note,
      });
      if (error) throw error;
      return json(200, Array.isArray(data) ? data[0] : data, origin);
    }

    if (action === "admin-photo") {
      const token = typeof body.token === "string" ? body.token : "";
      const { data: authData, error: authError } = await supabase.auth.getUser(token);
      if (authError || !authData.user?.email) {
        return json(401, { error: "Session expirée. Reconnectez-vous." }, origin);
      }
      const { data: allowedAdmin, error: allowlistError } = await supabase
        .from("admin_allowlist").select("email").eq("email", authData.user.email.toLowerCase()).maybeSingle();
      if (allowlistError) return json(503, { error: "Vérification du compte impossible. Réessayez." }, origin);
      if (!allowedAdmin) return json(403, { error: "Accès réservé au compte autorisé." }, origin);
      const id = typeof body.id === "string" ? body.id : "";
      const kind = body.kind === "baggage" || body.kind === "taken-baggage" || body.kind === "ticket" ? body.kind : "";
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) || !kind) {
        return json(400, { error: "Photo invalide." }, origin);
      }
      const { data: record, error } = await supabase.from("declarations")
        .select("photo_path,taken_photo_path,ticket_path").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!record) return json(404, { error: "Dossier introuvable." }, origin);
      const path = kind === "baggage" ? record.photo_path : kind === "taken-baggage" ? record.taken_photo_path : record.ticket_path;
      if (!path) return json(404, { error: "Aucune photo pour ce dossier." }, origin);
      const url = await signedPhoto(path);
      if (!url) throw new Error("Impossible de charger la photo pour le moment.");
      return json(200, { url }, origin);
    }


    return json(400, { error: "Action inconnue." }, origin);
  } catch (error) {
    console.error("declarations function error", error);
    return json(400, { error: errorMessage(error) }, origin);
  }
});
