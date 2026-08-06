import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const RECOVERY_DESTINATION = "/dashboard/settings?recovery=1";
const RECOVERY_FAILURE_DESTINATION = "/login?recovery_error=1";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!tokenHash || type !== "recovery" || !supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(new URL(RECOVERY_FAILURE_DESTINATION, requestUrl.origin));
  }

  const response = NextResponse.redirect(new URL(RECOVERY_DESTINATION, requestUrl.origin));
  const cookieStore = await cookies();
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

    if (!error) return response;
  } catch {
    // Keep provider/network details out of the URL and return to the generic recovery UI.
  }

  return NextResponse.redirect(new URL(RECOVERY_FAILURE_DESTINATION, requestUrl.origin));
}
