import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const RECOVERY_CONFIRMATION_DESTINATION = "/auth/recovery/confirm";
const RECOVERY_DESTINATION = "/dashboard/settings?recovery=1";
const RECOVERY_FAILURE_DESTINATION = "/login?recovery_error=1";
const RECOVERY_TOKEN_COOKIE_PREFIX = "baucompliance-recovery-token";
const CONFIRMATION_ID_PATTERN = /^[a-f0-9]{32}$/;

function recoveryTokenCookie(confirmationId: string) {
  return `${RECOVERY_TOKEN_COOKIE_PREFIX}-${confirmationId}`;
}

function clearRecoveryToken(response: NextResponse, confirmationId: string) {
  response.cookies.set(recoveryTokenCookie(confirmationId), "", {
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
    return NextResponse.redirect(new URL(RECOVERY_FAILURE_DESTINATION, requestUrl.origin));
  }

  const confirmationId = crypto.randomUUID().replaceAll("-", "");
  const confirmationUrl = new URL(RECOVERY_CONFIRMATION_DESTINATION, requestUrl.origin);
  confirmationUrl.searchParams.set("confirmation_id", confirmationId);
  const response = NextResponse.redirect(confirmationUrl);
  response.cookies.set(recoveryTokenCookie(confirmationId), tokenHash, {
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
  const formData = await request.formData();
  const confirmationIdValue = formData.get("confirmation_id");
  const confirmationId =
    typeof confirmationIdValue === "string" &&
    CONFIRMATION_ID_PATTERN.test(confirmationIdValue)
      ? confirmationIdValue
      : null;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const cookieStore = await cookies();
  const tokenHash = confirmationId
    ? cookieStore.get(recoveryTokenCookie(confirmationId))?.value
    : null;

  if (!confirmationId || !tokenHash || !supabaseUrl || !supabaseAnonKey) {
    const response = NextResponse.redirect(
      new URL(RECOVERY_FAILURE_DESTINATION, requestUrl.origin),
      303
    );
    return confirmationId ? clearRecoveryToken(response, confirmationId) : response;
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

    if (!error) return clearRecoveryToken(response, confirmationId);
  } catch {
    // Keep provider/network details out of the URL and return to generic recovery guidance.
  }

  return clearRecoveryToken(
    NextResponse.redirect(new URL(RECOVERY_FAILURE_DESTINATION, requestUrl.origin), 303),
    confirmationId
  );
}
