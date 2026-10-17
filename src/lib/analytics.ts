import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { AppError } from "./domain";

export interface AnalyticsResult {
  mode: string;
  origin: string;
  from: string;
  to: string;
  briefs: number;
  converted: number;
  conversion: number | null;
  completed: number;
  failed: number;
  pending: number;
  processing: number;
  successRate: number | null;
  failureRate: number | null;
  retryRate: number | null;
  averageRating: number | null;
  ratingCount: number;
  averageDuration: number | null;
  taskCount: number;
  firstCutsBuilt: number;
  mp4Exports: number;
}
export const analyticsFilterSchema = z.object({
  mode: z.enum(["mock", "live", "mixed"]).default("mock"),
  origin: z.enum(["user", "demo"]).default("user"),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});
export async function getAnalytics(
  db: PrismaClient,
  filters: unknown,
  now = new Date(),
): Promise<AnalyticsResult> {
  const f = analyticsFilterSchema.parse(filters);
  const from = f.from ? new Date(f.from) : new Date(now.getTime() - 30 * 86400000),
    to = f.to ? new Date(f.to) : now;
  if (from > to)
    throw new AppError("INVALID_DATE_RANGE", "Start date must be before end date.", 422);
  const [projects, tasks, built, exports] = await Promise.all([
    db.project.findMany({
      where: { origin: f.origin, createdAt: { gte: from, lte: to } },
      select: {
        events: {
          where: { name: "storyboard_generated", mode: f.mode, timestamp: { lte: to } },
          select: { id: true },
        },
      },
    }),
    db.generationTask.findMany({
      where: { mode: f.mode, createdAt: { gte: from, lte: to }, project: { origin: f.origin } },
      include: { review: true },
    }),
    db.event.count({
      where: {
        name: "first_cut_built",
        mode: f.mode,
        origin: f.origin,
        timestamp: { gte: from, lte: to },
        project: { origin: f.origin },
      },
    }),
    db.event.count({
      where: {
        name: "mp4_exported",
        mode: f.mode,
        origin: f.origin,
        timestamp: { gte: from, lte: to },
        project: { origin: f.origin },
      },
    }),
  ]);
  const converted = projects.filter((p) => p.events.length > 0).length;
  // A historical end date only counts terminal states reached by that time.
  const terminal = tasks.filter((t) => t.completedAt && t.completedAt <= to);
  const completed = terminal.filter((t) => t.status === "completed"),
    failed = terminal.filter((t) => t.status === "failed");
  const ratings = completed.flatMap((t) =>
    t.review && t.review.rating != null && t.review.updatedAt <= to ? [t.review.rating] : [],
  );
  const unfinished = tasks.filter((t) => !terminal.some((x) => x.id === t.id));
  return {
    mode: f.mode,
    origin: f.origin,
    from: from.toISOString(),
    to: to.toISOString(),
    briefs: projects.length,
    converted,
    conversion: projects.length ? converted / projects.length : null,
    completed: completed.length,
    failed: failed.length,
    pending: unfinished.filter((t) => !t.startedAt || t.startedAt > to).length,
    processing: unfinished.filter((t) => t.startedAt && t.startedAt <= to).length,
    successRate: terminal.length ? completed.length / terminal.length : null,
    failureRate: terminal.length ? failed.length / terminal.length : null,
    retryRate: tasks.length ? tasks.filter((t) => !!t.retryOfId).length / tasks.length : null,
    averageRating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null,
    ratingCount: ratings.length,
    averageDuration: completed.length
      ? completed.reduce(
          (n, t) => n + Math.max(0, t.completedAt!.getTime() - t.createdAt.getTime()) / 1000,
          0,
        ) / completed.length
      : null,
    taskCount: tasks.length,
    firstCutsBuilt: built,
    mp4Exports: exports,
  };
}
