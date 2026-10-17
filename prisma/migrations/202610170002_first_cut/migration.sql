ALTER TABLE "GenerationTask" ADD COLUMN "localMediaPath" TEXT;

CREATE TABLE "ProjectOutput" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "selectionKey" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "mediaPath" TEXT,
    "duration" REAL,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    CONSTRAINT "ProjectOutput_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Scene" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "selectedGenerationTaskId" TEXT,
    CONSTRAINT "Scene_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Scene_selectedGenerationTaskId_fkey" FOREIGN KEY ("selectedGenerationTaskId") REFERENCES "GenerationTask" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Scene" ("content", "id", "position", "projectId") SELECT "content", "id", "position", "projectId" FROM "Scene";
DROP TABLE "Scene";
ALTER TABLE "new_Scene" RENAME TO "Scene";
CREATE UNIQUE INDEX "Scene_selectedGenerationTaskId_key" ON "Scene"("selectedGenerationTaskId");
CREATE INDEX "Scene_projectId_position_idx" ON "Scene"("projectId", "position");
UPDATE "Scene" SET "selectedGenerationTaskId" = (
    SELECT "id" FROM "GenerationTask"
    WHERE "sceneId" = "Scene"."id" AND "status" = 'completed' AND "resultUrl" IS NOT NULL AND "resultUrl" != ''
    ORDER BY "createdAt" ASC, "id" ASC LIMIT 1
);
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

CREATE INDEX "ProjectOutput_projectId_createdAt_idx" ON "ProjectOutput"("projectId", "createdAt");
CREATE UNIQUE INDEX "ProjectOutput_projectId_selectionKey_key" ON "ProjectOutput"("projectId", "selectionKey");
