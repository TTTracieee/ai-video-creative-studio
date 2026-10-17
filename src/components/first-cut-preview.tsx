"use client";
import { Download, Film, Loader2 } from "lucide-react";
import type { ProjectView } from "@/lib/client-types";

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
  const ready = !!project.scenes.length && progress.selectedCount === project.scenes.length;
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Your first cut.</h2>
          <p className="muted">A draft assembled from your selected scenes, in storyboard order.</p>
        </div>
        <button className="btn" onClick={onGenerate}>
          Choose versions
        </button>
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
          <button
            className="btn primary"
            disabled={busy || dirty || !ready || output?.status === "processing"}
            onClick={onBuild}
          >
            {busy || output?.status === "processing" ? (
              <Loader2 className="spin" size={16} />
            ) : (
              <Film size={16} />
            )}
            {busy || output?.status === "processing"
              ? "Building first cut…"
              : output
                ? "Rebuild first cut"
                : "Build first cut"}
          </button>
        </div>
        {dirty && (
          <p className="draft-note">Save your Plan edits before building a new first cut.</p>
        )}
        {!ready && (
          <div className="empty">
            <Film size={30} />
            <h3>Select one version for every scene.</h3>
            <p>Then build and watch the whole first cut here.</p>
            <button className="btn" onClick={onGenerate}>
              Open Generate & Select
            </button>
          </div>
        )}
        {ready && !output && !busy && (
          <div className="empty">
            <Film size={30} />
            <h3>All scenes are selected.</h3>
            <p>Build a single MP4 from these clips. This does not call a generation model.</p>
          </div>
        )}
        {output && !outputIsCurrent && (
          <p role="status" className="message warning">
            Your selection or plan changed. This is the previous first cut; rebuild to use the
            current selection.
          </p>
        )}
        {output?.status === "failed" && (
          <p role="alert" className="message error">
            {output.errorMessage}
          </p>
        )}
        {output?.status === "completed" && output.mediaUrl && (
          <>
            <video
              key={`${output.id}-${output.updatedAt}`}
              className="first-cut-video"
              controls
              playsInline
              preload="metadata"
              src={output.mediaUrl}
              aria-label="First cut preview"
            />
            <div className="panel-actions">
              {outputIsCurrent ? (
                <a className="btn primary" href={`${output.mediaUrl}?download=1`}>
                  <Download size={16} />
                  Export MP4
                </a>
              ) : (
                <button className="btn" disabled>
                  Rebuild before exporting
                </button>
              )}
            </div>
            {output.mode !== "live" && (
              <p className="tiny muted">
                Contains illustrative development footage. See the source versions for details.
              </p>
            )}
          </>
        )}
        <p className="field-help">
          Simple cuts only. Original clip sound is kept; sound and visual continuity may vary
          between clips. No transitions, music editing or timeline controls.
        </p>
      </section>
    </>
  );
}
