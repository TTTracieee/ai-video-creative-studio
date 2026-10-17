"use client";
import { useState } from "react";
import { Download, Film, Loader2 } from "lucide-react";
import type { ProjectView } from "@/lib/client-types";
function MP4Export({ url }: { url: string }) {
  return (
    <a
      className="btn primary"
      href={`${url}?download=1`}
      onClick={(event) => {
        event.currentTarget.href = `${url}?download=1&exportId=${crypto.randomUUID()}`;
      }}
    >
      <Download size={16} />
      Export MP4
    </a>
  );
}
export default function FirstCutPreview({
  project,
  busy,
  dirty,
  onBuild,
  onGenerate,
}: {
  project: ProjectView;
  busy: boolean;
  dirty: boolean;
  onBuild: () => void;
  onGenerate: () => void;
}) {
  const { output, outputIsCurrent, progress } = project;
  const [failedMedia, setFailedMedia] = useState<string | null>(null);
  const ready = !!project.scenes.length && progress.selectedCount === project.scenes.length;
  const current = outputIsCurrent && output?.status === "completed" && !!output.mediaUrl;
  const processing = output?.status === "processing";
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Your first cut.</h2>
          <p className="muted">Your selected scenes, assembled in order.</p>
        </div>
        <div className="button-row">
          <button className="btn" onClick={onGenerate}>
            Choose versions
          </button>
          {current && <MP4Export url={output!.mediaUrl!} />}
        </div>
      </div>
      <div className="cut-sequence" aria-label="First cut sequence">
        {project.scenes.map((scene, index) => (
          <div className="cut-shot" key={scene.id}>
            <span className="eyebrow">SCENE {String(index + 1).padStart(2, "0")}</span>
            <strong>{scene.title}</strong>
            <span>
              {scene.selectedGenerationTaskId ? "Selected" : "Choose a version"} · {scene.duration}s
              planned
            </span>
          </div>
        ))}
      </div>
      <section className="panel first-cut-panel">
        <div className="section-heading">
          <div>
            <h3>Project preview</h3>
            <p className="muted">
              Target {project.brief.duration}s · {progress.selectedCount} / {project.scenes.length}{" "}
              selected{output?.duration != null && ` · First cut ${output.duration.toFixed(1)}s`}
            </p>
          </div>
          {!current && ready && (
            <button
              className="btn primary"
              disabled={busy || dirty || processing}
              onClick={onBuild}
            >
              {busy || processing ? <Loader2 className="spin" size={16} /> : <Film size={16} />}{" "}
              {busy || processing
                ? "Building first cut…"
                : output
                  ? "Update first cut"
                  : "Build first cut"}
            </button>
          )}
          {current && <span className="status completed">Up to date</span>}
        </div>
        {dirty && (
          <p className="draft-note">
            Unsaved Plan edits affect future generations. Existing videos are unchanged; save
            selection order changes before building.
          </p>
        )}
        {!ready && (
          <div className="empty">
            <Film size={30} />
            <h3>Select one version for every scene.</h3>
            <p>Then build and watch your first cut here.</p>
            <button className="btn" onClick={onGenerate}>
              Open Generate & Select
            </button>
          </div>
        )}
        {ready && !output && !busy && (
          <div className="empty">
            <Film size={30} />
            <h3>All scenes are selected.</h3>
            <p>Build a single MP4 from your chosen clips.</p>
          </div>
        )}
        {output && !outputIsCurrent && (
          <p role="status" className="message warning">
            Your selected clips or playback order changed. Update the first cut to include them.
          </p>
        )}
        {output?.status === "failed" && (
          <p role="alert" className="message error">
            {output.errorMessage}
          </p>
        )}
        {output?.status === "completed" && !output.mediaUrl && (
          <p role="alert" className="message error">
            The saved preview file is unavailable. Rebuild it from your selected clips.
          </p>
        )}
        {output?.status === "completed" && output.mediaUrl && (
          <video
            key={`${output.id}-${output.updatedAt}`}
            className="first-cut-video"
            controls
            playsInline
            preload="metadata"
            src={output.mediaUrl}
            poster={`/api/media/thumbnails/${output.snapshot.scenes[0].taskId}`}
            aria-label="First cut preview"
            onError={() => setFailedMedia(`${output.id}-${output.updatedAt}`)}
          />
        )}
        {output && failedMedia === `${output.id}-${output.updatedAt}` && (
          <p role="alert" className="message error">
            The first cut could not be played. Reload to retry or export the MP4 to open it locally.
          </p>
        )}
        {output?.mode && output.mode !== "live" && (
          <p className="tiny muted">Contains illustrative test footage.</p>
        )}
        <details className="cut-details">
          <summary>About this first cut</summary>
          <p>
            Clips are joined with simple cuts and their original sound. Actual duration follows the
            chosen videos. Editing the plan does not alter existing clips; generate and select a new
            version to change the cut. No transitions, music editing or timeline controls.
          </p>
        </details>
      </section>
    </>
  );
}
