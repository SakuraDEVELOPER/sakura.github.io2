import { createClient } from "npm:@supabase/supabase-js@2";
import { cert, getApps, initializeApp } from "npm:firebase-admin/app";
import { getAuth } from "npm:firebase-admin/auth";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const firebaseServiceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON") ?? "";
const firebaseServiceAccountEmail = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_EMAIL") ?? "";
const firebaseServiceAccountPrivateKey = (
  Deno.env.get("FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY") ?? ""
).replace(/\\n/g, "\n");

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    "Missing required env for firebase-auth-bridge function. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
  );
}

if (
  !firebaseServiceAccountJson &&
  (!firebaseServiceAccountEmail || !firebaseServiceAccountPrivateKey)
) {
  throw new Error(
    "Missing Firebase service account env for firebase-auth-bridge. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_EMAIL and FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY."
  );
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

type JsonRecord = Record<string, unknown>;

type ProfileRow = {
  profile_id: number | null;
  firebase_uid: string | null;
  auth_user_id: string | null;
  email: string | null;
};

const json = (body: JsonRecord, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

const nowIso = () => new Date().toISOString();

const getBearerToken = (request: Request) => {
  const authorization = request.headers.get("authorization") ?? "";

  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const token = authorization.slice(7).trim();
  return token || null;
};

const normalizeInteger = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? Math.trunc(parsedValue) : null;
  }

  return null;
};

const normalizeString = (value: unknown, maxLength = 500) =>
  typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : null;

const parseFirebaseServiceAccount = () => {
  if (firebaseServiceAccountJson) {
    const parsed = JSON.parse(firebaseServiceAccountJson) as Record<string, unknown>;

    return {
      projectId:
        normalizeString(parsed.project_id, 200) ??
        normalizeString(parsed.projectId, 200),
      clientEmail:
        normalizeString(parsed.client_email, 320) ??
        normalizeString(parsed.clientEmail, 320),
      privateKey:
        normalizeString(parsed.private_key, 8192) ??
        normalizeString(parsed.privateKey, 8192),
    };
  }

  return {
    projectId: null,
    clientEmail: firebaseServiceAccountEmail,
    privateKey: firebaseServiceAccountPrivateKey,
  };
};

const getFirebaseAdminAuth = () => {
  if (!getApps().length) {
    const serviceAccount = parseFirebaseServiceAccount();

    if (!serviceAccount.clientEmail || !serviceAccount.privateKey) {
      throw new Error("Firebase service account is missing client email or private key.");
    }

    initializeApp({
      credential: cert({
        projectId: serviceAccount.projectId ?? undefined,
        clientEmail: serviceAccount.clientEmail,
        privateKey: serviceAccount.privateKey,
      }),
    });
  }

  return getAuth();
};

const verifySupabaseAccessToken = async (token: string) => {
  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user?.id) {
    throw new Error("Invalid Supabase session.");
  }

  return data.user;
};

const loadProfileByAuthUserId = async (authUserId: string): Promise<ProfileRow | null> => {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("profile_id,firebase_uid,auth_user_id,email")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data
    ? {
        profile_id: normalizeInteger(data.profile_id),
        firebase_uid: normalizeString(data.firebase_uid, 128),
        auth_user_id: normalizeString(data.auth_user_id, 128),
        email: normalizeString(data.email, 320),
      }
    : null;
};

const loadProfilesByEmail = async (email: string): Promise<ProfileRow[]> => {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("profile_id,firebase_uid,auth_user_id,email")
    .eq("email", email)
    .limit(2);

  if (error) {
    throw error;
  }

  return Array.isArray(data)
    ? data.map((row) => ({
        profile_id: normalizeInteger(row.profile_id),
        firebase_uid: normalizeString(row.firebase_uid, 128),
        auth_user_id: normalizeString(row.auth_user_id, 128),
        email: normalizeString(row.email, 320),
      }))
    : [];
};

const linkProfileToSupabaseUser = async (
  profileId: number,
  authUserId: string,
): Promise<ProfileRow | null> => {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update({
      auth_user_id: authUserId,
      updated_at: nowIso(),
    })
    .eq("profile_id", profileId)
    .select("profile_id,firebase_uid,auth_user_id,email")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data
    ? {
        profile_id: normalizeInteger(data.profile_id),
        firebase_uid: normalizeString(data.firebase_uid, 128),
        auth_user_id: normalizeString(data.auth_user_id, 128),
        email: normalizeString(data.email, 320),
      }
    : null;
};

const resolveLinkedProfile = async (supabaseUser: {
  id: string;
  email?: string | null;
}) => {
  const linkedProfile = await loadProfileByAuthUserId(supabaseUser.id);

  if (linkedProfile) {
    return {
      profile: linkedProfile,
      linkedByEmail: false,
      error: null as string | null,
    };
  }

  const email = normalizeString(supabaseUser.email, 320);

  if (!email) {
    return {
      profile: null,
      linkedByEmail: false,
      error: "Supabase user does not have an email to match against profiles.",
    };
  }

  const emailMatches = await loadProfilesByEmail(email);

  if (!emailMatches.length) {
    return {
      profile: null,
      linkedByEmail: false,
      error: "No Supabase profile row matches this auth email yet.",
    };
  }

  if (emailMatches.length > 1) {
    return {
      profile: null,
      linkedByEmail: false,
      error: "Multiple profile rows match this auth email. Manual linking is required.",
    };
  }

  const match = emailMatches[0];

  if (!match.profile_id || match.profile_id <= 0) {
    return {
      profile: null,
      linkedByEmail: false,
      error: "Matched profile row is missing profile_id.",
    };
  }

  if (match.auth_user_id && match.auth_user_id !== supabaseUser.id) {
    return {
      profile: null,
      linkedByEmail: false,
      error: "Matched profile row is already linked to another Supabase auth user.",
    };
  }

  const updatedProfile =
    match.auth_user_id === supabaseUser.id
      ? match
      : await linkProfileToSupabaseUser(match.profile_id, supabaseUser.id);

  return {
    profile: updatedProfile,
    linkedByEmail: true,
    error: null as string | null,
  };
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const token = getBearerToken(request);

    if (!token) {
      return json({ error: "Missing bearer token." }, 401);
    }

    const supabaseUser = await verifySupabaseAccessToken(token);
    const body = ((await request.json().catch(() => ({}))) ?? {}) as JsonRecord;
    const action = normalizeString(body.action, 64) ?? "mint_firebase_custom_token";

    if (action !== "mint_firebase_custom_token") {
      return json({ error: "Unsupported action." }, 400);
    }

    const resolvedProfile = await resolveLinkedProfile({
      id: supabaseUser.id,
      email: supabaseUser.email ?? null,
    });

    if (!resolvedProfile.profile) {
      return json(
        {
          error: resolvedProfile.error ?? "Supabase user is not linked to a Firebase-backed profile yet.",
        },
        409,
      );
    }

    if (!resolvedProfile.profile.firebase_uid) {
      return json(
        {
          error: "Linked profile does not have firebase_uid yet.",
        },
        409,
      );
    }

    const customToken = await getFirebaseAdminAuth().createCustomToken(
      resolvedProfile.profile.firebase_uid,
      {
        supabase_uid: supabaseUser.id,
        supabase_email: supabaseUser.email ?? undefined,
      },
    );

    return json({
      ok: true,
      action,
      customToken,
      firebaseUid: resolvedProfile.profile.firebase_uid,
      profileId: resolvedProfile.profile.profile_id,
      linkedByEmail: resolvedProfile.linkedByEmail,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected firebase-auth-bridge failure.";
    console.error("firebase-auth-bridge failed:", error);
    return json({ error: message }, 500);
  }
});
