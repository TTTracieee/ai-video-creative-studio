-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Review" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "rating" INTEGER,
    "feedback" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Review_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "GenerationTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Review" ("feedback", "id", "rating", "taskId", "updatedAt") SELECT "feedback", "id", "rating", "taskId", "updatedAt" FROM "Review";
DROP TABLE "Review";
ALTER TABLE "new_Review" RENAME TO "Review";
CREATE UNIQUE INDEX "Review_taskId_key" ON "Review"("taskId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;


-- Upgrade only the untouched bundled Example. User-edited plans and task snapshots are preserved.
UPDATE "Scene" SET "content" = json_set("content", '$.promptMode', 'structured', '$.promptOverride', json_extract("content", '$.prompt'))
WHERE "projectId" = 'example-morning-brew-v1' AND json_extract("content", '$.promptMode') IS NULL
AND EXISTS (SELECT 1 FROM "Project" WHERE "id" = "Scene"."projectId" AND "origin" = 'demo' AND "revision" = 0);
