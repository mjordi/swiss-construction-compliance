import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const RECOVERY_CONFIRMATION_DESTINATION = "/auth/recovery/confirm";
const RECOVERY_DESTINATION = "/dashboard/settings?recovery=1";
const RECOVERY_FAILURE_DESTINATION = "/login?recovery_error=1";
const RECOVERY_TOKEN_COOKIE = "baucompliance-recovery-token";

function clearRecoveryToken(response: NextResponse) {
  response.cookies.set(RECOVERY_TOKEN_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/auth/recovery",
    sameSite: "lax",
  });
  return response;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!tokenHash || type !== "recovery" || !supabaseUrl || !supabaseAnonKey) {
    return clearRecoveryToken(
      NextResponse.redirect(new URL(RECOVERY_FAILURE_DESTINATION, requestUrl.origin))
    );
  }

  const response = NextResponse.redirect(
    new URL(RECOVERY_CONFIRMATION_DESTINATION, requestUrl.origin)
  );
  response.cookies.set(RECOVERY_TOKEN_COOKIE, tokenHash, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: "/auth/recovery",
    sameSite: "lax",
    secure: requestUrl.protocol === "https:",
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const cookieStore = await cookies();
  const tokenHash = cookieStore.get(RECOVERY_TOKEN_COOKIE)?.value;

  if (!tokenHash || !supabaseUrl || !supabaseAnonKey) {
    return clearRecoveryToken(
      NextResponse.redirect(new URL(RECOVERY_FAILURE_DESTINATION, requestUrl.origin), 303)
    );
  }

  const response = NextResponse.redirect(
    new URL(RECOVERY_DESTINATION, requestUrl.origin),
    303
  );
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  try {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "recovery",
    });

    if (!error) return clearRecoveryToken(response);
  } catch {
    // Keep provider/network details out of the URL and return to generic recovery guidance.
  }

  return clearRecoveryToken(
    NextResponse.redirect(new URL(RECOVERY_FAILURE_DESTINATION, requestUrl.origin), 303)
  );
}