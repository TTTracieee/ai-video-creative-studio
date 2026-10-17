"use client";
import { useState } from "react";
import { Check, CirclePlay, RefreshCw, Star } from "lucide-react";
import type { ProjectView, TaskView } from "@/lib/client-types";

type Props = {
  project: ProjectView;
  busy: boolean;
  disabled: boolean;
  issue: (scene: ProjectView["scenes"][number]) => string;
  onGenerate: (sceneId: string) => void;
  onSelect: (sceneId: string, taskId: string) => void;
  onRetry: (task: TaskView) => void;
  onReview: (id: string, rating: number, feedback: string) => void;
  onPlan: () => void;
  onPreview: () => void;
};
export default function GenerateSelect(props: Props) {
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Choose the moments that make your story.</h2>
          <p className="muted">
            {props.project.progress.selectedCount} / {props.project.scenes.length} scenes selected.
            New versions keep your current choice.
          </p>
        </div>
        <button className="btn" onClick={props.onPlan}>
          Edit plan
        </button>
      </div>
      {!props.project.scenes.length ? (
        <div className="empty">
          <h3>Plan your scenes first.</h3>
          <button className="btn primary" onClick={props.onPlan}>
            Open Plan
          </button>
        </div>
      ) : (
        <div className="generation-scenes">
          {props.project.scenes.map((scene, index) => (
            <SceneVersions key={scene.id} {...props} scene={scene} index={index} />
          ))}
        </div>
      )}
      <div className="panel-actions">
        <button
          className="btn primary"
          disabled={!props.project.scenes.length}
          onClick={props.onPreview}
        >
          Preview & export <CirclePlay size={16} />
        </button>
      </div>
    </>
  );
}
function SceneVersions(props: Props & { scene: ProjectView["scenes"][number]; index: number }) {
  const { scene, project } = props;
  const [showVersions, setShowVersions] = useState(false);
  const attempts = project.tasks
    .filter((task) => task.sceneId === scene.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const selected = attempts.find((task) => task.id === scene.selectedGenerationTaskId);
  const primary = selected || attempts.at(-1);
  const running = attempts.some((task) => ["pending", "processing"].includes(task.status));
  const other = attempts.filter((task) => task.id !== primary?.id);
  const newResult =
    selected &&
    other.some((task) => task.status === "completed" && task.createdAt >= selected.createdAt);
  const issue = props.issue(scene);
  return (
    <section className="scene-versions panel" data-testid={`generate-scene-${props.index}`}>
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            SCENE {String(props.index + 1).padStart(2, "0")} · {scene.duration}s planned
          </span>
          <h3>{scene.title}</h3>
        </div>
        <button
          className="btn"
          disabled={props.busy || props.disabled || !!issue}
          onClick={() => props.onGenerate(scene.id)}
        >
          <RefreshCw size={15} />
          {attempts.length ? "Generate another" : "Generate scene"}
        </button>
      </div>
      {issue && <p className="field-error">{issue}</p>}
      {selected && running && (
        <p className="draft-note">
          Another version is generating. Your selected version stays in the cut.
        </p>
      )}
      {newResult && !running && (
        <p className="field-help">
          A new version is ready. Open other versions to compare and choose.
        </p>
      )}
      {primary ? (
        <Version
          key={primary.id}
          task={primary}
          number={attempts.indexOf(primary) + 1}
          selected={primary.id === selected?.id}
          {...props}
        />
      ) : (
        <div className="empty version-empty">
          <CirclePlay size={26} />
          <p>Generate a version, then choose it for your first cut.</p>
        </div>
      )}
      {!!other.length && (
        <details
          className="version-history"
          open={showVersions}
          onToggle={(event) => setShowVersions(event.currentTarget.open)}
        >
          <summary>Other versions ({other.length})</summary>
          {showVersions && (
            <div className="version-grid">
              {other.map((task) => (
                <Version
                  key={task.id}
                  task={task}
                  number={attempts.indexOf(task) + 1}
                  selected={false}
                  {...props}
                />
              ))}
            </div>
          )}
        </details>
      )}
    </section>
  );
}
function Version({
  task,
  number,
  selected,
  busy,
  disabled,
  onSelect,
  onRetry,
  onReview,
}: Pick<Props, "busy" | "disabled" | "onSelect" | "onRetry" | "onReview"> & {
  task: TaskView;
  number: number;
  selected: boolean;
}) {
  const [rating, setRating] = useState(task.review?.rating || 0);
  const [feedback, setFeedback] = useState(task.review?.feedback || "");
  return (
    <article className="version-result" data-testid={`task-${task.status}`}>
      <div className="row-between">
        <strong>Version {number}</strong>
        {selected ? (
          <span className="status completed" data-testid="selected-version">
            <Check size={13} />
            Selected for cut
          </span>
        ) : (
          <span className={`status ${task.status}`}>{task.status}</span>
        )}
      </div>
      {task.status === "completed" && task.resultUrl ? (
        <>
          <video
            className="clip-preview"
            controls
            playsInline
            preload="metadata"
            src={task.previewUrl || task.resultUrl}
            aria-label={`Version ${number} preview`}
          />
          {task.mode === "mock" && (
            <p className="tiny muted">Illustrative test footage; no model was called.</p>
          )}
          {!selected && (
            <button
              className="btn primary"
              disabled={busy || disabled}
              onClick={() => onSelect(task.sceneId!, task.id)}
            >
              Use this version
            </button>
          )}
          <details className="version-notes">
            <summary>Notes & details</summary>
            <p className="tiny muted">
              {task.mode === "live"
                ? `Generated with ${task.provider}`
                : "Prerecorded development fixture"}{" "}
              · {task.snapshot.scene.duration}s requested · Direction V
              {task.snapshot.profileVersion}
            </p>
            <div className="stars" aria-label="Optional rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  aria-label={`Rate ${n} stars`}
                  aria-pressed={rating === n}
                  onClick={() => setRating(n)}
                >
                  <Star size={18} fill={n <= rating ? "currentColor" : "none"} />
                </button>
              ))}
            </div>
            <label>
              Feedback
              <textarea
                aria-label="Feedback"
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
              />
            </label>
            <button
              className="btn"
              disabled={busy || !rating}
              onClick={() => onReview(task.id, rating, feedback)}
            >
              Save review
            </button>
            <details>
              <summary>Generation input snapshot</summary>
              <pre>{task.snapshot.finalPrompt}</pre>
            </details>
          </details>
        </>
      ) : task.status === "failed" ? (
        <div className="message error">
          <p>{task.errorMessage}</p>
          <button className="btn" disabled={busy} onClick={() => onRetry(task)}>
            Retry generation
          </button>
        </div>
      ) : (
        <p className="muted version-pending">
          {task.status === "pending" ? "Your scene is queued…" : "Your scene is generating…"}
        </p>
      )}
    </article>
  );
}
