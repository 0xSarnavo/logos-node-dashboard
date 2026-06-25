import { NextRequest, NextResponse } from "next/server";
import { checkCredentials, signSession, SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "@/lib/auth";
import { apiError } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const username = typeof body.username === "string" ? body.username : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!checkCredentials(username, password)) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const res = NextResponse.json({ ok: true, user: username });
    res.cookies.set(SESSION_COOKIE, signSession(username), SESSION_COOKIE_OPTIONS);
    return res;
  } catch (e) {
    return apiError(e);
  }
}
