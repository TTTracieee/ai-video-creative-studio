import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/domain";
import * as service from "@/lib/service";
import { videoProvider, storyboardProvider } from "@/lib/providers";
import { getAnalytics } from "@/lib/analytics";
import { assertSameOrigin, authorized, AUTH_COOKIE, passwordRequired } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: NextRequest, route: { params: Promise<{ path: string[] }> }) {
  const sessionId = request.cookies.get("studio-session")?.value || randomUUID();
  const context = { sessionId };
  try {
    if (request.method !== "GET")
      assertSameOrigin(request.headers.get("origin"), request.headers.get("host"));
    const { path } = await route.params;
    const [root, id, action, child, operation] = path;
    if (root !== "health" && !authorized(request.cookies.get(AUTH_COOKIE)?.value))
      throw new AppError("UNAUTHORIZED", "Sign in to access this private studio.", 401);
    const method = request.method;
    let body: unknown;
    if (method !== "GET") {
      try {
        body = await request.json();
      } catch {
        throw new AppError("INVALID_JSON", "Send a valid JSON request.");
      }
    }
    let data: unknown;
    if (root === "health" && method === "GET") {
      await db.$queryRaw`SELECT 1`;
      data = { ok: true };
    } else if (root === "config" && method === "GET")
      data = {
        storyboardMode: storyboardProvider().mode,
        videoMode: videoProvider().mode,
        videoProvider: videoProvider().name,
        capabilities: videoProvider().capabilities,
        passwordRequired: passwordRequired(),
      };
    else if (root === "analytics" && method === "GET")
      data = await getAnalytics(db, Object.fromEntries(request.nextUrl.searchParams));
    else if (root === "projects" && !id && method === "GET")
      data = await db.project.findMany({
        orderBy: { updatedAt: "desc" },
        include: { _count: { select: { scenes: true, tasks: true } } },
      });
    else if (root === "projects" && !id && method === "POST")
      data = await service.createProject(db, body, context);
    else if (root === "projects" && id && !action && method === "GET")
      data = await service.getProject(db, id);
    else if (root === "projects" && id && !action && method === "PATCH")
      data = await service.updateProject(db, id, body, context);
    else if (root === "projects" && action === "storyboard" && method === "POST")
      data = await service.generateBoard(db, id, body, context);
    else if (root === "projects" && action === "storyboard" && method === "PUT")
      data = await service.saveBoard(db, id, body, context);
    else if (
      root === "projects" &&
      action === "scenes" &&
      operation === "regenerate" &&
      method === "POST"
    )
      data = await service.regenerateScene(db, id, child, body, context);
    else if (root === "projects" && action === "tasks" && method === "POST")
      data = await service.startTasks(db, id, body, context);
    else if (root === "projects" && action === "export" && method === "POST")
      data = await service.exportProject(db, id, context);
    else if (root === "tasks" && !id && method === "GET")
      data = await db.generationTask.findMany({
        orderBy: { createdAt: "desc" },
        include: { review: true, project: { select: { name: true } } },
      });
    else if (root === "tasks" && action === "sync" && method === "POST")
      data = await service.syncTask(db, id, context);
    else if (root === "tasks" && action === "retry" && method === "POST")
      data = await service.retryTask(db, id, body, context);
    else if (root === "tasks" && action === "review" && method === "PUT")
      data = await service.reviewTask(db, id, body, context);
    else throw new AppError("NOT_FOUND", "Endpoint not found.", 404);
    const response = NextResponse.json({ data });
    response.headers.set("Cache-Control", "no-store");
    response.cookies.set("studio-session", sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 86400 * 30,
    });
    return response;
  } catch (error) {
    if (error instanceof ZodError)
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
          },
        },
        { status: 422 },
      );
    if (error instanceof AppError)
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "The operation could not be completed. Your saved data is preserved.",
        },
      },
      { status: 500 },
    );
  }
}
export { handle as GET, handle as POST, handle as PUT, handle as PATCH };
