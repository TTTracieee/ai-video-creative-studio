import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertSameOrigin,
  AUTH_COOKIE,
  authConfigured,
  createSession,
  passwordMatches,
} from "@/lib/auth";
import { AppError } from "@/lib/domain";
export const runtime = "nodejs";
const attempts = new Map<string, { count: number; until: number }>();
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request.headers.get("origin"), request.headers.get("host"));
    const body = z
      .object({
        password: z.string().max(512).optional(),
        action: z.enum(["login", "logout"]).default("login"),
      })
      .parse(await request.json());
    if (body.action === "logout") {
      const response = NextResponse.json({ data: { ok: true } });
      response.cookies.delete(AUTH_COOKIE);
      return response;
    }
    if (!authConfigured())
      throw new AppError(
        "AUTH_CONFIG_REQUIRED",
        "Configure APP_PASSWORD (12+ characters) and SESSION_SECRET (32+ characters) on the server before signing in.",
        503,
      );
    // Single-process throttle for the private, single-person MVP; no external service.
    const bucket = "studio";
    const now = Date.now();
    const previous = attempts.get(bucket);
    if (previous && previous.until > now && previous.count >= 10)
      throw new AppError("RATE_LIMIT", "Too many sign-in attempts. Wait 10 minutes.", 429);
    const current = previous && previous.until > now ? previous : { count: 0, until: now + 600000 };
    if (!passwordMatches(body.password || "")) {
      current.count++;
      attempts.set(bucket, current);
      throw new AppError("WRONG_PASSWORD", "The access password is incorrect.", 401);
    }
    attempts.delete(bucket);
    const response = NextResponse.json({ data: { ok: true } });
    response.cookies.set(AUTH_COOKIE, createSession(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 8 * 3600,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    const e =
      error instanceof AppError
        ? error
        : new AppError("INVALID_REQUEST", "Send a valid sign-in request.", 400);
    return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.status });
  }
}
