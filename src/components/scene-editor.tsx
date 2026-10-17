"use client";
import {
  composePrompt,
  sceneDirectionFields,
  structuredScenePrompt,
  type Profile,
  type SceneRecord,
} from "@/lib/domain";
export default function SceneEditor({
  scene,
  profile,
  onChange,
}: {
  scene: SceneRecord;
  profile: Profile;
  onChange: (key: keyof SceneRecord, value: string | number) => void;
}) {
  let prompt = "",
    error = "";
  try {
    prompt = composePrompt(scene, profile);
  } catch (e) {
    error = (e as Error).message;
  }
  const override = scene.promptMode === "override";
  return (
    <>
      {override && (
        <p className="message warning">
          Prompt override is active. Turn it off in Advanced to edit structured instructions. Your
          saved fields are preserved.
        </p>
      )}
      <fieldset className="scene-fields" disabled={override}>
        {sceneDirectionFields
          .filter(([key]) => key !== "consistencyNotes")
          .map(([key, label]) => (
            <label key={key}>
              {label}
              <textarea
                aria-label={label}
                rows={key === "visualDescription" ? 3 : 2}
                value={scene[key]}
                onChange={(e) => onChange(key, e.target.value)}
              />
            </label>
          ))}
      </fieldset>
      <details className="scene-advanced">
        <summary>Advanced · Prompt & override</summary>
        <label className="override-toggle">
          <input
            type="checkbox"
            checked={override}
            onChange={(e) => {
              if (e.target.checked && !scene.promptOverride)
                onChange("promptOverride", structuredScenePrompt(scene));
              onChange("promptMode", e.target.checked ? "override" : "structured");
            }}
          />
          Use a scene prompt override
        </label>
        <p className="field-help">
          Overrides replace scene instructions; shared Creative Direction still applies. Turning
          this off restores your structured fields.
        </p>
        {override ? (
          <label>
            Prompt Override
            <textarea
              aria-label="Prompt Override"
              rows={6}
              value={scene.promptOverride}
              onChange={(e) => onChange("promptOverride", e.target.value)}
            />
          </label>
        ) : (
          <label>
            Scene Notes
            <textarea
              aria-label="Scene Notes"
              rows={2}
              value={scene.consistencyNotes}
              onChange={(e) => onChange("consistencyNotes", e.target.value)}
            />
          </label>
        )}
        <label>
          Final Prompt · next generation
          <textarea aria-label="Final Prompt" rows={8} value={prompt} readOnly />
        </label>
        {error && <p className="field-error">{error}</p>}
        <p className="field-help">
          Shared direction governs identity, product, brand and style; scene fields describe the
          shot. Both remain visible here. Existing videos keep their original prompt snapshots.
        </p>
      </details>
    </>
  );
}
