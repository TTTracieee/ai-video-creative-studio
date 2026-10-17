"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronRight,
  CirclePlay,
  Clapperboard,
  Clock3,
  FileText,
  Film,
  LayoutDashboard,
  Leaf,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import {
  briefSchema,
  composePrompt,
  defaultProfile,
  sampleBrief,
  emptyBrief,
  planDirtyRegions,
  type Brief,
  type Profile,
  type SceneRecord,
} from "@/lib/domain";
import type { ConfigView, ProjectView, TaskView } from "@/lib/client-types";

import { api } from "@/lib/client-api";
import Analytics from "./analytics";
import GenerateSelect from "./generate-select";
import FirstCutPreview from "./first-cut-preview";
import SceneEditor from "./scene-editor";
import MediaThumbnail from "./media-thumbnail";
const profileFields: [keyof Profile, string][] = [
  ["characterIdentity", "Character Identity"],
  ["productAppearance", "Product Appearance"],
  ["brandElements", "Brand Elements"],
  ["visualStyle", "Visual Style"],
];
function date(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function ModeBadge({ mode }: { mode: string }) {
  return (
    <span className={`badge ${mode === "live" ? "live" : "mock"}`}>
      {mode === "live" ? "Live" : "Mock"}
    </span>
  );
}
export default function Studio() {
  const pathname = usePathname();
  const router = useRouter();
  const parts = pathname.split("/").filter(Boolean);
  const projectId = parts[0] === "projects" && parts[1] && parts[1] !== "new" ? parts[1] : null;
  const [projects, setProjects] = useState<ProjectView[]>([]);
  const [project, setProject] = useState<ProjectView | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectView | null>(null);
  const [projectName, setProjectName] = useState("");
  const [brief, setBrief] = useState<Brief>({ ...emptyBrief });
  const [profile, setProfile] = useState<Profile>(defaultProfile(emptyBrief));
  const [scenes, setScenes] = useState<SceneRecord[]>([]);
  const [tasks, setTasks] = useState<TaskView[]>([]);
  const [config, setConfig] = useState<ConfigView>({
    storyboardMode: "mock",
    videoMode: "mock",
    videoProvider: "mock",
    capabilities: { minDuration: 1, maxDuration: 8 },
  });
  const [tab, setTab] = useState("plan");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pollError, setPollError] = useState("");
  const [scenario, setScenario] = useState("success");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const reload = useCallback(
    async (drafts = true) => {
      if (!projectId) return;
      const p = await api<ProjectView>(`projects/${projectId}`);
      setProject(p);
      if (drafts) {
        setBrief(p.brief);
        setProfile(p.profile);
        setScenes(p.scenes);
        setProjectName(p.name);
      }
    },
    [projectId],
  );
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      setNotice("");
      setProject(null);
      setTab("plan");
      try {
        const cfg = await api<ConfigView>("config");
        if (!active) return;
        setConfig(cfg);
        if (projectId) {
          const p = await api<ProjectView>(`projects/${projectId}`);
          if (!active) return;
          setProject(p);
          setTab(
            parts[2] !== "settings" && p.outputIsCurrent && p.output?.status === "completed"
              ? "preview"
              : "plan",
          );
          setBrief(p.brief);
          setProfile(p.profile);
          setScenes(p.scenes);
          setProjectName(p.name);
        } else if (pathname === "/projects/new") {
          setBrief({ ...emptyBrief });
          setFormErrors({});
        } else if (pathname === "/tasks") {
          const all = await api<TaskView[]>("tasks");
          if (active) setTasks(all);
        } else if (pathname === "/") {
          const list = await api<ProjectView[]>("projects");
          if (active) setProjects(list);
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
    // Route changes replace drafts; background task refreshes never do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, projectId]);
  const activeTasks = project?.tasks ?? tasks;
  const pendingIds = activeTasks
    .filter((t) => ["pending", "processing"].includes(t.status))
    .map((t) => t.id)
    .join(",");
  useEffect(() => {
    if (!pendingIds || busy) return;
    let stopped = false;
    let running = false;
    async function poll() {
      if (running || document.hidden) return;
      running = true;
      try {
        await Promise.all(pendingIds.split(",").map((id) => api(`tasks/${id}/sync`, "POST", {})));
        if (stopped) return;
        if (projectId) await reload(false);
        else setTasks(await api<TaskView[]>("tasks"));
        setPollError("");
      } catch (e) {
        if (!stopped) setPollError((e as Error).message);
      } finally {
        running = false;
      }
    }
    const timer = setInterval(
      () => void poll(),
      config.pollIntervalMs ?? (config.videoMode === "mock" ? 2000 : 5000),
    );
    void poll();
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [pendingIds, busy, projectId, reload, config.videoMode, config.pollIntervalMs]);
  useEffect(() => {
    if (project?.output?.status !== "processing" || busy) return;
    const timer = setInterval(() => void reload(false).catch((e) => setPollError(e.message)), 2000);
    return () => clearInterval(timer);
  }, [project?.output?.status, busy, reload]);
  const dirtyRegions = project
    ? planDirtyRegions(project, { name: projectName, brief, profile, scenes })
    : [];
  const dirty = dirtyRegions.length > 0;
  useEffect(() => {
    const prevent = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  async function run(action: () => Promise<void>, success = "") {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      if (success) setNotice(success);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function requestDeletion(id: string) {
    return run(async () => setDeleteTarget(await api<ProjectView>(`projects/${id}`)));
  }
  function confirmDeletion() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    return run(async () => {
      await api(`projects/${target.id}`, "DELETE", { revision: target.revision });
      setDeleteTarget(null);
      setProjects((list) => list.filter((p) => p.id !== target.id));
      setTasks((list) => list.filter((t) => t.projectId !== target.id));
      if (projectId === target.id) {
        setProject(null);
        router.replace("/");
      }
    }, "Project and related records deleted.");
  }
  function refreshDeletionStatus() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    return run(async () => {
      await Promise.all(
        target.tasks
          .filter((task) => ["pending", "processing"].includes(task.status))
          .map((task) => api(`tasks/${task.id}/sync`, "POST", {})),
      );
      setDeleteTarget(await api<ProjectView>(`projects/${target.id}`));
    });
  }
  function ensureSaved() {
    if (dirty)
      throw new Error("Save your brief, creative direction, and scene edits before generating.");
  }
  function validateBrief() {
    const result = briefSchema.safeParse(brief);
    if (!result.success) {
      setFormErrors(Object.fromEntries(result.error.issues.map((i) => [i.path[0], i.message])));
      throw new Error("Please check the highlighted brief fields.");
    }
    setFormErrors({});
    return result.data;
  }
  const total = scenes.reduce((n, s) => n + s.duration, 0);
  const setupMissing = !!config.setupRequired?.length;
  function sceneIssue(scene: SceneRecord) {
    const { minDuration, maxDuration, maxPromptLength = 10000 } = config.capabilities;
    if (
      !Number.isInteger(scene.duration) ||
      scene.duration < minDuration ||
      scene.duration > maxDuration
    )
      return `${config.videoProvider} requires ${minDuration === maxDuration ? minDuration : `${minDuration}–${maxDuration}`}s per clip. Edit the duration or select another provider.`;
    let finalPrompt = "";
    try {
      finalPrompt = composePrompt(scene, profile);
    } catch (e) {
      return (e as Error).message;
    }
    if (finalPrompt.length > maxPromptLength)
      return `Shorten the scene prompt, consistency notes or shared profile to fit ${maxPromptLength} characters.`;
    return "";
  }
  async function generateClips(ids: string[]) {
    ensureSaved();
    await api(`projects/${projectId}/tasks`, "POST", {
      sceneIds: ids,
      revision: project!.revision,
      scenario,
      idempotencyKey: crypto.randomUUID(),
    });
    await reload(false);
    setTab("generate");
  }
  async function exportData(boardOnly = false) {
    if (dirty) throw new Error("Save your edits before exporting.");
    const data = await api<{ project: ProjectView }>(`projects/${projectId}/export`, "POST", {});
    const payload = boardOnly
      ? {
          schemaVersion: 1,
          mode: project?.storyboardMode,
          brief: data.project.brief,
          profile: data.project.profile,
          scenes: data.project.scenes,
        }
      : data;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${project?.name || "project"}-${boardOnly ? "storyboard" : "project"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
  function editScene(id: string, key: keyof SceneRecord, value: string | number) {
    setScenes((items) => items.map((s) => (s.id === id ? { ...s, [key]: value } : s)));
  }
  function moveScene(index: number, delta: number) {
    setScenes((items) => {
      const copy = [...items];
      [copy[index], copy[index + delta]] = [copy[index + delta], copy[index]];
      return copy;
    });
  }
  async function saveCurrentPlan() {
    const saved = await api<ProjectView>(`projects/${projectId}/plan`, "PUT", {
      revision: project!.revision,
      name: projectName,
      brief: validateBrief(),
      profile,
      scenes,
    });
    setProject(saved);
    setBrief(saved.brief);
    setProfile(saved.profile);
    setScenes(saved.scenes);
    setProjectName(saved.name);
  }
  async function regenerateBoard() {
    ensureSaved();
    if (
      scenes.length &&
      !confirm(
        "Replace every scene and clear selected versions? Previous attempts are kept in Activity but will not be assigned to the new scenes.",
      )
    )
      return;
    await api(`projects/${projectId}/storyboard`, "POST", { revision: project!.revision });
    await reload();
  }
  const missingSceneIds =
    project?.scenes
      .filter(
        (scene) =>
          !scene.selectedGenerationTaskId &&
          !project.tasks.some(
            (task) => task.sceneId === scene.id && ["pending", "processing"].includes(task.status),
          ),
      )
      .map((scene) => scene.id) ?? [];
  const nav = [
    ["/", "Projects", LayoutDashboard],
    ["/projects/new", "New project", Plus],
  ] as const;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="brand-mark">
            <Film size={23} />
          </span>
          frame<span className="brand-dot">.</span>
        </Link>
        <span className="brand-sub">AI VIDEO CREATIVE STUDIO</span>
        <div className="nav-caption">WORKSPACE</div>
        <nav>
          {nav.map(([href, label, Icon]) => (
            <Link
              key={href}
              href={href}
              className={`nav-item ${pathname === href ? "active" : ""}`}
            >
              <Icon size={18} />
              {label}
              {href === "/projects/new" && <span className="nav-plus">+</span>}
            </Link>
          ))}
        </nav>
        <details className="internal-tools">
          <summary>Workspace tools</summary>
          <Link className="nav-item" href="/tasks">
            Generation activity
          </Link>
          <Link className="nav-item" href="/analytics">
            Internal analytics
          </Link>
        </details>
        <div className="sidebar-note">
          <Leaf size={22} />
          <strong>
            Big ideas.
            <br />
            Thoughtful frames.
          </strong>
          <p>One clear workflow, from your marketing brief to a first cut.</p>
          <span className="tiny">Built for the creative process</span>
        </div>
        <div className="sidebar-footer">
          <span className="avatar">CS</span>
          <div>
            <strong>Your creative space</strong>
            <span>Single-person workspace</span>
          </div>
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <span className="breadcrumbs">
            Workspace <ChevronRight size={14} />{" "}
            {project
              ? "Project studio"
              : pathname === "/tasks"
                ? "Generation tasks"
                : pathname === "/analytics"
                  ? "Analytics"
                  : pathname === "/projects/new"
                    ? "Create project"
                    : "Overview"}
          </span>
          <div className="topbar-right">
            <span className="tiny">BRIEF TO FIRST CUT</span>
            {config.passwordRequired && (
              <button
                className="text-btn"
                onClick={() =>
                  run(async () => {
                    await api("auth", "POST", { action: "logout" });
                    router.replace("/login");
                    router.refresh();
                  })
                }
              >
                Sign out
              </button>
            )}
          </div>
        </header>
        <main className="main-content">
          {setupMissing && (
            <div role="alert" className="message warning">
              API setup required: {config.setupRequired!.join(", ")}. Add these server environment
              variables and restart. Live mode means a provider is selected; it does not confirm a
              successful connection. Generation is disabled until configured.
            </div>
          )}
          {error && !deleteTarget && (
            <div role="alert" className="message error">
              <span>{error}</span>
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={16} />
              </button>
            </div>
          )}
          {config.videoProvider === "bach-v1" && (
            <div className="message warning">
              Legacy BACH v1 adapter. Verify that your account supports this endpoint; live
              availability has not been verified for this portfolio build.
            </div>
          )}
          {notice && (
            <div role="status" className="message success">
              <CheckCircle2 size={17} />
              {notice}
            </div>
          )}
          {pollError && (
            <div role="alert" className="message error">
              Task sync: {pollError} <button onClick={() => location.reload()}>Reload tasks</button>
            </div>
          )}
          {loading ? (
            <div className="loading">
              <Loader2 className="spin" /> Opening your studio…
            </div>
          ) : (
            <>
              {pathname === "/" && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">YOUR CREATIVE WORKSPACE</span>
                      <h1>Good ideas start here.</h1>
                      <p>Give your next campaign a little direction.</p>
                    </div>
                    <Link className="btn primary" href="/projects/new">
                      <Plus size={17} />
                      New project
                    </Link>
                  </div>
                  <div className="section-heading">
                    <h2>
                      Your projects <span className="count">{projects.length}</span>
                    </h2>
                    <span className="muted tiny">Every brief has a beginning.</span>
                  </div>
                  {projects.length ? (
                    <div className="project-grid">
                      {projects.map((p) => (
                        <article
                          className="project-card"
                          key={p.id}
                          data-testid={`project-card-${p.id}`}
                        >
                          <Link className="project-card-link" href={`/projects/${p.id}`}>
                            <MediaThumbnail
                              src={p.thumbnailUrl}
                              label={`${p.name} video preview`}
                            />
                            <div className="project-card-body">
                              <div className="row-between">
                                <span className="project-category">{p.brief.targetPlatform}</span>
                                {p.origin === "demo" && <span className="badge">Example</span>}
                              </div>
                              <h3>{p.name}</h3>
                              <p>
                                {p.brief.duration}s target <span>·</span> {p.brief.aspectRatio}{" "}
                                <span>·</span> {p.progress.selectedCount} / {p.progress.sceneCount}{" "}
                                selected
                              </p>
                              <div className="project-card-foot">
                                <span>
                                  {p.progress.label}
                                  {p.progress.activeCount > 0 &&
                                    ` · ${p.progress.activeCount} generating`}
                                  <br />
                                  <small>{date(p.updatedAt)}</small>
                                </span>
                                <ArrowRight size={16} />
                              </div>
                            </div>
                          </Link>
                        </article>
                      ))}
                      <Link href="/projects/new" className="new-project-card">
                        <Plus size={25} />
                        <strong>Start something new</strong>
                        <span>Turn a brief into a first cut</span>
                      </Link>
                    </div>
                  ) : (
                    <div className="empty">
                      <FileText size={29} />
                      <h3>Your first story is waiting.</h3>
                      <p>Create a project to start planning your video.</p>
                    </div>
                  )}
                  <div className="workflow-strip">
                    {[
                      [FileText, "01", "Plan your story"],
                      [CirclePlay, "02", "Generate & select"],
                      [Film, "03", "Preview & export"],
                    ].map(([Icon, n, t]) => {
                      const I = Icon as typeof FileText;
                      return (
                        <div key={String(n)}>
                          <I size={20} />
                          <span>{String(n)}</span>
                          <strong>{String(t)}</strong>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
              {pathname === "/projects/new" && (
                <>
                  <Link href="/" className="back-link">
                    <ArrowLeft size={15} />
                    All projects
                  </Link>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">START WITH THE WHY</span>
                      <h1>A little brief. A big beginning.</h1>
                      <p>Tell us about your brand and the story you want to tell.</p>
                    </div>
                    <button
                      className="btn"
                      onClick={() => {
                        setBrief(sampleBrief);
                        setFormErrors({});
                      }}
                    >
                      Fill example brief
                    </button>
                  </div>
                  <div className="brief-layout">
                    <section className="panel">
                      <BriefForm brief={brief} setBrief={setBrief} errors={formErrors} />
                      <div className="panel-actions">
                        <button
                          className="btn primary"
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              const valid = validateBrief();
                              const p = await api<ProjectView>("projects", "POST", {
                                brief: valid,
                              });
                              router.push(`/projects/${p.id}`);
                            })
                          }
                        >
                          {busy ? <Loader2 className="spin" size={16} /> : <ArrowRight size={16} />}
                          Create project
                        </button>
                      </div>
                    </section>
                    <aside className="brief-aside">
                      <span className="icon-tile">
                        <Sparkles />
                      </span>
                      <h3>A clear brief makes room for creativity.</h3>
                      <p>Focus on one audience, one message, and one moment that matters.</p>
                      <div className="aside-note">
                        <strong>What happens next?</strong>
                        <p>
                          We’ll help you plan scenes, define shared visual details, and review a
                          first cut assembled from your chosen video clips.
                        </p>
                      </div>
                    </aside>
                  </div>
                </>
              )}
              {project && (
                <>
                  <Link href="/" className="back-link">
                    <ArrowLeft size={15} />
                    All projects
                  </Link>
                  <div className="page-heading project-heading">
                    <div>
                      <div className="eyebrow">
                        YOUR PROJECT{" "}
                        {project.origin === "demo" && <span className="badge">Example</span>}
                      </div>
                      <h1>{project.name}</h1>
                      <p>
                        {project.brief.targetPlatform} <span>·</span> {project.brief.aspectRatio}{" "}
                        <span>·</span> {project.brief.duration}s target ·{" "}
                        {project.progress.selectedCount} / {project.progress.sceneCount} selected ·{" "}
                        {project.progress.label}
                      </p>
                    </div>
                    <div className="button-row">
                      <button
                        className="btn"
                        disabled={busy || dirty}
                        title="Copy the plan without generated media"
                        onClick={() =>
                          run(async () => {
                            const copy = await api<{ id: string }>(
                              `projects/${project.id}/duplicate`,
                              "POST",
                              {},
                            );
                            router.push(`/projects/${copy.id}`);
                          })
                        }
                      >
                        Duplicate plan
                      </button>
                      <details className="project-more">
                        <summary className="btn">More</summary>
                        <div className="more-menu">
                          <button
                            className="text-btn"
                            disabled={busy || dirty}
                            onClick={() => run(() => exportData())}
                          >
                            Export project JSON
                          </button>
                          <button
                            className="text-btn"
                            disabled={busy || dirty || !scenes.length}
                            onClick={() => run(() => exportData(true))}
                          >
                            Export storyboard JSON
                          </button>
                          <button
                            className="text-btn"
                            disabled={busy || dirty || setupMissing || !scenes.length}
                            onClick={() => run(regenerateBoard, "Storyboard replaced.")}
                          >
                            Regenerate all scenes
                          </button>
                          <button
                            className="text-btn danger-text"
                            disabled={busy}
                            onClick={() => requestDeletion(project.id)}
                          >
                            Delete project
                          </button>
                        </div>
                      </details>
                    </div>
                  </div>
                  <div className="studio-tabs">
                    {[
                      ["plan", "01", "Plan"],
                      ["generate", "02", "Generate & Select"],
                      ["preview", "03", "Preview & Export"],
                    ].map(([id, n, label]) => (
                      <button
                        key={id}
                        onClick={() => setTab(id)}
                        className={tab === id ? "selected" : ""}
                      >
                        <span>{n}</span>
                        {label}
                      </button>
                    ))}
                  </div>
                  {dirty && tab !== "plan" && (
                    <p className="draft-note">
                      Unsaved: {dirtyRegions.join(", ")}. Return to Plan to save; existing videos
                      are unchanged.
                    </p>
                  )}
                  {tab === "plan" && (
                    <div className="plan-save-bar">
                      <div>
                        <strong>
                          {dirty ? `Unsaved: ${dirtyRegions.join(", ")}` : "All plan changes saved"}
                        </strong>
                        <p>
                          Brief defines the goal. Creative Direction is shared. Scenes describe
                          individual shots. Saved changes apply to future generations.
                        </p>
                      </div>
                      <button
                        className="btn primary"
                        disabled={busy || !dirty}
                        onClick={() =>
                          run(saveCurrentPlan, "Plan saved. Existing videos are unchanged.")
                        }
                      >
                        <Save size={16} />
                        Save Plan
                      </button>
                    </div>
                  )}
                  {tab === "plan" && (
                    <details className="panel brief-plan" open={!scenes.length}>
                      <summary>
                        Creative brief{" "}
                        <span className="muted tiny"> · Edit campaign requirements</span>
                      </summary>
                      <div className="section-heading">
                        <h2>Creative brief</h2>
                        <span className="muted tiny">
                          Changes keep your existing storyboard and history.
                        </span>
                      </div>
                      <label>
                        Project name
                        <input
                          value={projectName}
                          maxLength={150}
                          onChange={(e) => setProjectName(e.target.value)}
                        />
                      </label>
                      <BriefForm brief={brief} setBrief={setBrief} errors={formErrors} />
                    </details>
                  )}
                  {tab === "plan" && (
                    <>
                      <div className="section-heading storyboard-toolbar">
                        <div>
                          <h2>Your story, scene by scene</h2>
                          <p className="muted">
                            Edit each scene and the creative direction shared by future generations.
                          </p>
                        </div>
                        <div className="button-row">
                          {scenes.length > 0 && (
                            <>
                              <span
                                className={`duration-pill ${total !== project.brief.duration ? "unbalanced" : ""}`}
                              >
                                <Clock3 size={14} />
                                {total} / {project.brief.duration}s planned
                              </span>
                            </>
                          )}
                          {!scenes.length && (
                            <button
                              className="btn primary"
                              disabled={busy || dirty || setupMissing}
                              onClick={() => run(regenerateBoard, "Storyboard generated.")}
                            >
                              <WandSparkles size={16} />
                              Generate storyboard
                            </button>
                          )}
                        </div>
                      </div>
                      {project.storyboardAt &&
                        new Date(project.briefUpdatedAt) > new Date(project.storyboardAt) && (
                          <div className="message warning">
                            Your brief changed after this storyboard was generated. Review or
                            regenerate your scenes.
                          </div>
                        )}
                      {dirty && (
                        <div className="draft-note">
                          <span className="draft-dot" /> Unsaved edits · Save Plan before
                          generating. Existing video exports remain available.
                        </div>
                      )}
                      <div className="workspace-grid with-profile">
                        <div>
                          {!scenes.length ? (
                            <div className="empty board-empty">
                              <span className="icon-tile">
                                <Clapperboard size={28} />
                              </span>
                              <h2>Every story starts with a scene.</h2>
                              <p>
                                Your brief is ready. Generate a{" "}
                                {project.brief.duration === 15 ? "three" : "five"}-scene storyboard,
                                then make it yours.
                              </p>
                              {config.storyboardMode === "mock" && (
                                <p className="tiny muted">Starts with an editable template.</p>
                              )}
                            </div>
                          ) : (
                            <>
                              <div className="scene-grid">
                                {scenes.map((scene, i) => (
                                  <article
                                    className="scene-card"
                                    key={scene.id}
                                    data-testid={`scene-${i}`}
                                  >
                                    <div className="scene-card-top">
                                      <MediaThumbnail
                                        src={
                                          project.scenes.find((saved) => saved.id === scene.id)
                                            ?.thumbnailUrl
                                        }
                                        label={`${scene.title} video preview`}
                                      />
                                      <span className="scene-number">
                                        SCENE {String(i + 1).padStart(2, "0")}
                                      </span>
                                      <span className="scene-seconds">{scene.duration}s</span>
                                    </div>
                                    <div className="scene-body">
                                      <label className="sr-only" htmlFor={`title-${scene.id}`}>
                                        Scene {i + 1} title
                                      </label>
                                      <input
                                        className="scene-title"
                                        id={`title-${scene.id}`}
                                        value={scene.title}
                                        onChange={(e) =>
                                          editScene(scene.id, "title", e.target.value)
                                        }
                                      />
                                      <label>
                                        Duration (seconds)
                                        <input
                                          type="number"
                                          min={1}
                                          max={30}
                                          value={scene.duration}
                                          onChange={(e) =>
                                            editScene(scene.id, "duration", Number(e.target.value))
                                          }
                                        />
                                      </label>
                                      <SceneEditor
                                        scene={scene}
                                        profile={profile}
                                        onChange={(key, value) => editScene(scene.id, key, value)}
                                      />
                                      {sceneIssue(scene) && (
                                        <p className="field-error">{sceneIssue(scene)}</p>
                                      )}
                                      <div className="scene-tools">
                                        <button
                                          className="icon-btn"
                                          aria-label={`Move scene ${i + 1} up`}
                                          disabled={i === 0 || busy}
                                          onClick={() => moveScene(i, -1)}
                                        >
                                          <ArrowUp size={15} />
                                        </button>
                                        <button
                                          className="icon-btn"
                                          aria-label={`Move scene ${i + 1} down`}
                                          disabled={i === scenes.length - 1 || busy}
                                          onClick={() => moveScene(i, 1)}
                                        >
                                          <ArrowDown size={15} />
                                        </button>
                                        <button
                                          className="icon-btn"
                                          aria-label={`Delete scene ${i + 1}`}
                                          disabled={busy || scenes.length === 1}
                                          onClick={() =>
                                            setScenes((items) =>
                                              items.filter((s) => s.id !== scene.id),
                                            )
                                          }
                                        >
                                          <Trash2 size={15} />
                                        </button>
                                        <button
                                          className="text-btn"
                                          disabled={
                                            busy ||
                                            dirty ||
                                            setupMissing ||
                                            scene.promptMode === "override"
                                          }
                                          onClick={() =>
                                            run(async () => {
                                              ensureSaved();
                                              await api(
                                                `projects/${project.id}/scenes/${scene.id}/regenerate`,
                                                "POST",
                                                { revision: project.revision },
                                              );
                                              await reload();
                                            }, "Scene rewritten with the shared creative direction.")
                                          }
                                        >
                                          <RefreshCw size={13} />
                                          Rewrite
                                        </button>
                                      </div>
                                    </div>
                                  </article>
                                ))}
                              </div>
                              <div className="board-footer">
                                <button
                                  className="btn"
                                  disabled={busy || scenes.length >= 12}
                                  onClick={() =>
                                    setScenes([
                                      ...scenes,
                                      {
                                        ...scenes[scenes.length - 1],
                                        id: `draft-${crypto.randomUUID()}`,
                                        title: "New scene",
                                        duration: 1,
                                        promptMode: "structured",
                                        promptOverride: "",
                                        prompt:
                                          "Describe this scene’s subject, action, setting, camera, and style.",
                                      },
                                    ])
                                  }
                                >
                                  <Plus size={15} />
                                  Add scene
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                        <aside className="consistency-panel">
                          <div className="row-between">
                            <span className="icon-tile small">
                              <ShieldCheck size={19} />
                            </span>
                            <span className="tiny muted">DIRECTION V{project.profileVersion}</span>
                          </div>
                          <h3>Creative Direction</h3>
                          <p className="muted">
                            Shared guidance for new generations. Results may vary.
                          </p>
                          {profileFields.map(([key, label]) => (
                            <label key={key}>
                              {label}
                              <textarea
                                aria-label={label}
                                rows={3}
                                value={profile[key]}
                                onChange={(e) => setProfile({ ...profile, [key]: e.target.value })}
                              />
                            </label>
                          ))}
                          <details className="direction-help">
                            <summary>How shared direction applies</summary>
                            <p>
                              Shared identity, product, brand and style take precedence in the
                              submitted instructions. Scene fields add shot details. Inputs are kept
                              unchanged; model adherence may vary. Saving here never changes
                              existing clips.
                            </p>
                          </details>
                        </aside>
                      </div>
                      <div className="generation-bar">
                        <div>
                          <strong>
                            {scenes.length} scenes · {total} / {project.brief.duration}s planned
                          </strong>
                          <span>
                            Choose one generated version per scene, then build your first cut.
                          </span>
                        </div>
                        <button
                          className="btn primary"
                          disabled={!scenes.length || dirty}
                          onClick={() => setTab("generate")}
                        >
                          Continue to Generate & Select <ArrowRight size={16} />
                        </button>
                      </div>
                    </>
                  )}
                  {tab === "generate" && (
                    <>
                      {dirty && (
                        <p className="draft-note">
                          Save your Plan edits before generating or selecting a version.
                        </p>
                      )}
                      {missingSceneIds.length > 0 && (
                        <div className="panel-actions">
                          <button
                            className="btn primary"
                            disabled={
                              busy ||
                              dirty ||
                              setupMissing ||
                              total !== project.brief.duration ||
                              project.scenes.some((scene) => !!sceneIssue(scene))
                            }
                            onClick={() => run(() => generateClips(missingSceneIds))}
                          >
                            Generate missing scenes
                          </button>
                        </div>
                      )}
                      {config.developmentTools && config.videoMode === "mock" && (
                        <details className="dev-controls">
                          <summary>Development controls</summary>
                          <label>
                            Mock scenario
                            <select
                              aria-label="Mock scenario"
                              value={scenario}
                              onChange={(event) => setScenario(event.target.value)}
                            >
                              <option value="success">Success fixture</option>
                              <option value="fail">Simulate failure</option>
                            </select>
                          </label>
                        </details>
                      )}
                      <GenerateSelect
                        project={project}
                        busy={busy}
                        disabled={dirty || setupMissing}
                        issue={sceneIssue}
                        onPlan={() => setTab("plan")}
                        onPreview={() => setTab("preview")}
                        onGenerate={(id) => run(() => generateClips([id]))}
                        onSelect={(sceneId, taskId) =>
                          run(async () => {
                            ensureSaved();
                            await api(`projects/${project.id}/scenes/${sceneId}/select`, "PUT", {
                              revision: project.revision,
                              taskId,
                            });
                            await reload(false);
                          }, "Version selected for your first cut.")
                        }
                        onRetry={(task) =>
                          run(async () => {
                            const acceptDuplicateRisk =
                              task.errorCode === "SUBMISSION_UNKNOWN" &&
                              confirm(
                                "The previous live submission may have been accepted. Retrying may create an additional charge. Retry anyway?",
                              );
                            await api(`tasks/${task.id}/retry`, "POST", {
                              idempotencyKey: crypto.randomUUID(),
                              acceptDuplicateRisk,
                            });
                            await reload(false);
                          }, "Retry submitted. The previous attempt is preserved.")
                        }
                        onReview={(id, rating, feedback) =>
                          run(async () => {
                            await api(`tasks/${id}/review`, "PUT", { rating, feedback });
                            await reload(false);
                          }, "Notes saved.")
                        }
                      />
                    </>
                  )}
                  {tab === "preview" && (
                    <FirstCutPreview
                      project={project}
                      busy={busy}
                      dirty={dirty}
                      onGenerate={() => setTab("generate")}
                      onBuild={() =>
                        run(async () => {
                          ensureSaved();
                          try {
                            await api(`projects/${project.id}/first-cut`, "POST", {
                              revision: project.revision,
                            });
                          } finally {
                            await reload(false);
                          }
                        }, "First cut ready.")
                      }
                    />
                  )}
                </>
              )}
              {pathname === "/tasks" && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">EVERY TAKE, IN ONE PLACE</span>
                      <h1>Generation tasks</h1>
                      <p>Follow your clips from the queue to the review.</p>
                    </div>
                    <ModeBadge mode={config.videoMode} />
                  </div>
                  <TaskList
                    tasks={tasks}
                    busy={busy}
                    onRetry={(task) =>
                      run(async () => {
                        const acceptDuplicateRisk =
                          task.errorCode === "SUBMISSION_UNKNOWN" &&
                          confirm(
                            "This live request may already have been accepted. Retry with possible duplicate charges?",
                          );
                        await api(`tasks/${task.id}/retry`, "POST", {
                          idempotencyKey: crypto.randomUUID(),
                          acceptDuplicateRisk,
                        });
                        setTasks(await api<TaskView[]>("tasks"));
                      })
                    }
                    onReview={(id, rating, feedback) =>
                      run(async () => {
                        await api(`tasks/${id}/review`, "PUT", { rating, feedback });
                        setTasks(await api<TaskView[]>("tasks"));
                      }, "Notes saved.")
                    }
                  />
                </>
              )}
              {pathname === "/analytics" && <Analytics />}
              {!project &&
                pathname !== "/" &&
                pathname !== "/projects/new" &&
                pathname !== "/tasks" &&
                pathname !== "/analytics" &&
                !error && (
                  <div className="empty">
                    Project not found. <Link href="/">Return to overview</Link>
                  </div>
                )}
            </>
          )}
          <footer className="page-footer">
            <span>FRAME / AI VIDEO CREATIVE STUDIO</span>
            <span>Plan thoughtfully. Create intentionally.</span>
          </footer>
        </main>
        {deleteTarget && (
          <DeleteProjectDialog
            project={deleteTarget}
            busy={busy}
            error={error}
            onCancel={() => {
              setDeleteTarget(null);
              setError("");
            }}
            onConfirm={confirmDeletion}
            onRefresh={refreshDeletionStatus}
          />
        )}
      </div>
    </div>
  );
}

function DeleteProjectDialog({
  project,
  busy,
  error,
  onCancel,
  onConfirm,
  onRefresh,
}: {
  project: ProjectView;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
  onRefresh: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const active = project.tasks.filter((t) => ["pending", "processing"].includes(t.status)).length;
  const building = project.output?.status === "processing";
  return (
    <dialog
      ref={dialog}
      role="alertdialog"
      className="delete-project-dialog"
      aria-labelledby="delete-project-title"
      aria-describedby="delete-project-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <h2 id="delete-project-title">Delete project?</h2>
      <p id="delete-project-description">
        Permanently delete <strong>{project.name}</strong> and all its local records? This cannot be
        undone.
      </p>
      <p className="delete-record-counts">
        {project.scenes.length} scenes · {project.tasks.length} generation attempts ·{" "}
        {project.tasks.filter((t) => t.review).length} reviews
      </p>
      <p>
        The brief, creative direction, project events, first cuts and cached clips will also be
        removed. Unsaved edits will be discarded. Export the project first if you need a copy.
      </p>
      <p>Deleting local records does not cancel provider jobs or refund generation charges.</p>
      {active > 0 && (
        <p className="message warning" role="status">
          {active} generation tasks are still active. Wait for completion, then check their status
          here before deleting.
        </p>
      )}
      {building && (
        <p className="message warning" role="status">
          A first cut is still building. Wait for completion, then check its status before deleting.
        </p>
      )}
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      <div className="button-row">
        <button className="btn" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        {(active > 0 || building) && (
          <button className="btn" disabled={busy} onClick={onRefresh}>
            Check task status
          </button>
        )}
        <button
          className="btn danger"
          disabled={busy || active > 0 || building}
          onClick={onConfirm}
        >
          {busy ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />} Delete permanently
        </button>
      </div>
    </dialog>
  );
}

function BriefForm({
  brief,
  setBrief,
  errors,
}: {
  brief: Brief;
  setBrief: (brief: Brief) => void;
  errors: Record<string, string>;
}) {
  const fields: [
    keyof Pick<
      Brief,
      | "brandName"
      | "productDescription"
      | "targetAudience"
      | "marketingObjective"
      | "creativeConcept"
      | "visualStyle"
      | "targetPlatform"
    >,
    string,
    string,
  ][] = [
    ["brandName", "Brand Name", "e.g. Your brand"],
    ["productDescription", "Product Description", "What makes your product special?"],
    ["targetAudience", "Target Audience", "Who are you speaking to?"],
    ["marketingObjective", "Marketing Objective", "e.g. Brand awareness"],
    [
      "creativeConcept",
      "Creative Concept",
      "Describe the story, message, or moment you have in mind…",
    ],
    ["visualStyle", "Visual Style", "e.g. Cinematic, warm, natural"],
    ["targetPlatform", "Target Platform", "e.g. Instagram Reels"],
  ];
  return (
    <div className="form-grid">
      {fields.map(([key, label, placeholder]) => (
        <label
          className={key === "creativeConcept" || key === "productDescription" ? "wide" : ""}
          key={key}
        >
          {label} <span className="required">*</span>
          {["creativeConcept", "productDescription"].includes(key) ? (
            <textarea
              required
              rows={key === "creativeConcept" ? 4 : 2}
              value={brief[key]}
              placeholder={placeholder}
              aria-invalid={!!errors[key]}
              onChange={(e) => setBrief({ ...brief, [key]: e.target.value })}
            />
          ) : (
            <input
              required
              value={brief[key]}
              placeholder={placeholder}
              aria-invalid={!!errors[key]}
              onChange={(e) => setBrief({ ...brief, [key]: e.target.value })}
            />
          )}{" "}
          {errors[key] && <span className="field-error">{errors[key]}</span>}
        </label>
      ))}
      <label>
        Target duration <span className="required">*</span>
        <select
          value={brief.duration}
          onChange={(e) => setBrief({ ...brief, duration: Number(e.target.value) as 15 | 30 })}
        >
          <option value={15}>15 seconds · 3 scenes by default</option>
          <option value={30}>30 seconds · 5 scenes by default</option>
        </select>
        <span className="field-help">
          Planning target. The first cut uses actual clip lengths, so its duration may vary.
        </span>
      </label>
      <label>
        Aspect Ratio <span className="required">*</span>
        <select
          value={brief.aspectRatio}
          onChange={(e) =>
            setBrief({ ...brief, aspectRatio: e.target.value as Brief["aspectRatio"] })
          }
        >
          <option value="9:16">9:16 · Vertical</option>
          <option value="16:9">16:9 · Landscape</option>
          <option value="1:1">1:1 · Square</option>
        </select>
      </label>
    </div>
  );
}
function TaskList({
  tasks,
  busy,
  onRetry,
  onReview,
}: {
  tasks: TaskView[];
  busy: boolean;
  onRetry: (task: TaskView) => void;
  onReview: (id: string, rating: number | null, feedback: string) => void;
}) {
  if (!tasks.length)
    return (
      <div className="empty">
        <CirclePlay size={30} />
        <h3>Your first take is ahead.</h3>
        <p>Generate a clip from your storyboard to see tasks and results here.</p>
      </div>
    );
  return (
    <div className="task-grid">
      {tasks.map((task) => (
        <TaskCard key={task.id} task={task} busy={busy} onRetry={onRetry} onReview={onReview} />
      ))}
    </div>
  );
}
function TaskCard({
  task,
  busy,
  onRetry,
  onReview,
}: {
  task: TaskView;
  busy: boolean;
  onRetry: (task: TaskView) => void;
  onReview: (id: string, rating: number | null, feedback: string) => void;
}) {
  const [feedback, setFeedback] = useState(task.review?.feedback || "");
  const [mediaError, setMediaError] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (task.completedAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [task.completedAt]);
  const elapsed = Math.max(
    0,
    Math.round(
      ((task.completedAt ? new Date(task.completedAt).getTime() : now) -
        new Date(task.createdAt).getTime()) /
        1000,
    ),
  );
  return (
    <article className="task-card" data-testid={`task-${task.status}`}>
      <div className="row-between">
        <span className={`status ${task.status}`}>
          {["pending", "processing"].includes(task.status) ? (
            <Loader2 size={13} className="spin" />
          ) : task.status === "completed" ? (
            <Check size={13} />
          ) : (
            <X size={13} />
          )}{" "}
          {task.status}
        </span>
        <ModeBadge mode={task.mode} />
      </div>
      <h3>{task.snapshot.scene.title}</h3>
      <div className="tiny muted">
        {task.project?.name && (
          <Link href={`/projects/${task.projectId}`}>{task.project.name} · </Link>
        )}
        {date(task.createdAt)} · {elapsed}s elapsed
      </div>
      <div className="task-id">
        Task {task.id}
        {task.retryOfId && " · Retry attempt"}
      </div>
      {task.status === "completed" && task.resultUrl ? (
        <>
          <div className="video-wrap">
            <video
              controls
              playsInline
              preload="metadata"
              src={task.previewUrl || `/api/media/tasks/${task.id}`}
              poster={`/api/media/thumbnails/${task.id}`}
              onError={() => setMediaError(true)}
              aria-label={`${task.snapshot.scene.title} result`}
            />
            {task.mode === "mock" && <span>MOCK / DEMO FOOTAGE</span>}
          </div>
          {mediaError && (
            <p className="field-error">Preview unavailable. External result URLs may expire.</p>
          )}
          {task.mode === "mock" && (
            <p className="tiny muted">
              Fixed demo footage, not generated from your prompt. The footage duration is
              independent of the storyboard plan.
            </p>
          )}
          {task.provider.startsWith("wan") && (
            <p className="tiny muted">
              Generated with Wan. The preview uses a local cache when available. Uncached provider
              links may expire.
            </p>
          )}
          <a
            className="text-btn"
            href={task.previewUrl || `/api/media/tasks/${task.id}`}
            target="_blank"
            rel="noreferrer"
          >
            <CirclePlay size={14} />
            Open clip
          </a>
          <div className="review-form">
            <label>
              Review Notes
              <textarea
                aria-label="Review Notes"
                rows={2}
                maxLength={3000}
                value={feedback}
                placeholder="Private notes for this version. Not sent to the model."
                onChange={(e) => setFeedback(e.target.value)}
              />
            </label>
            <button
              className="btn full"
              disabled={busy}
              onClick={() => onReview(task.id, null, feedback)}
            >
              <Save size={14} />
              Save notes
            </button>
          </div>
        </>
      ) : task.status === "failed" ? (
        <div className="failed-result">
          <p>{task.errorMessage}</p>
          <button className="btn" disabled={busy} onClick={() => onRetry(task)}>
            <RefreshCw size={15} />
            Retry generation
          </button>
        </div>
      ) : (
        <div className="pending-result">
          <Loader2 size={29} className="spin" />
          <strong>
            {task.status === "pending"
              ? "Waiting for a little inspiration…"
              : "Your clip is in progress…"}
          </strong>
          <span>Safe to refresh. Your task is saved.</span>
        </div>
      )}
      <details className="task-snapshot">
        <summary>Generation input snapshot</summary>
        <p className="tiny muted">
          Profile version {task.snapshot.profileVersion} · {task.snapshot.scene.duration}s ·{" "}
          {task.snapshot.aspectRatio} · {task.provider}
        </p>
        <pre>{task.snapshot.finalPrompt}</pre>
      </details>
    </article>
  );
}
