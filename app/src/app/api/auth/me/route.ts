import { NextResponse } from "next/server";
import { readAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const { authed, user } = await readAuth();
  return NextResponse.json({ authed, user });
}
