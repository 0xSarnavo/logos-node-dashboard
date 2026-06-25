import { NextRequest, NextResponse } from "next/server";
import { checkCredentials, signSession, SESSION_COOKIE, sessionCookieOptions, SESSION_SHORT, SESSION_LONG } from "@/lib/auth";
import { apiError } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const username = typeof body.username === "string" ? body.username : "";
    const password = typeof body.password === "string" ? body.password : "";
    const remember = body.remember === true;

    if (!checkCredentials(username, password)) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const age = remember ? SESSION_LONG : SESSION_SHORT;
    const res = NextResponse.json({ ok: true, user: username });
    res.cookies.set(SESSION_COOKIE, signSession(username, age), sessionCookieOptions(age));
    return res;
  } catch (e) {
    return apiError(e);
  }
}
