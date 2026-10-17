"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronRight,
  CirclePlay,
  Clapperboard,
  Clock3,
  Download,
  FileText,
  Film,
  LayoutDashboard,
  Leaf,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import {
  briefSchema,
  composePrompt,
  defaultProfile,
  sampleBrief,
  type Brief,
  type Profile,
  type SceneRecord,
} from "@/lib/domain";
import type { ConfigView, ProjectView, TaskView } from "@/lib/client-types";

import { api } from "@/lib/client-api";
import Analytics from "./analytics";
const profileFields: [keyof Profile, string][] = [
  ["characterIdentity", "Character Identity"],
  ["productAppearance", "Product Appearance"],
  ["brandElements", "Brand Elements"],
  ["visualStyle", "Visual Style"],
];
const sceneFields: [keyof Omit<SceneRecord, "id" | "duration">, string][] = [
  ["visualDescription", "Visual Description"],
  ["subject", "Subject"],
  ["consistencyNotes", "Consistency Notes"],
  ["cameraMovement", "Camera Movement"],
  ["lighting", "Lighting"],
  ["mood", "Mood"],
  ["prompt", "Scene Prompt"],
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
      {mode === "live" ? "Live" : "Mock / Demo"}
    </span>
  );
}
function SceneArt({ index = 0, large = false }: { index?: number; large?: boolean }) {
  return (
    <div className={`scene-art art-${index % 3} ${large ? "large" : ""}`} aria-hidden="true">
      <div className="art-window" />
      <div className="art-sun" />
      <div className="art-table" />
      <div className="art-bag">
        <span>
          MORNING
          <br />
          MOMENTS
        </span>
      </div>
      <div className="art-cup" />
      <span className="art-label">STORYBOARD PLACEHOLDER</span>
    </div>
  );
}

export default function Studio() {
  const pathname = usePathname();
  const router = useRouter();
  const parts = pathname.split("/").filter(Boolean);
  const projectId = parts[0] === "projects" && parts[1] && parts[1] !== "new" ? parts[1] : null;
  const [projects, setProjects] = useState<ProjectView[]>([]);
  const [project, setProject] = useState<ProjectView | null>(null);
  const [projectName, setProjectName] = useState("");
  const [brief, setBrief] = useState<Brief>({
    ...sampleBrief,
    brandName: "",
    productDescription: "",
    targetAudience: "",
    creativeConcept: "",
  });
  const [profile, setProfile] = useState<Profile>(defaultProfile(sampleBrief));
  const [scenes, setScenes] = useState<SceneRecord[]>([]);
  const [tasks, setTasks] = useState<TaskView[]>([]);
  const [config, setConfig] = useState<ConfigView>({
    storyboardMode: "mock",
    videoMode: "mock",
    videoProvider: "mock",
    capabilities: { minDuration: 1, maxDuration: 8 },
  });
  const [tab, setTab] = useState("storyboard");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pollError, setPollError] = useState("");
  const [scenario, setScenario] = useState("success");
  const [showProfile, setShowProfile] = useState(true);
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
      setTab(parts[2] === "settings" ? "brief" : "storyboard");
      try {
        const cfg = await api<ConfigView>("config");
        if (!active) return;
        setConfig(cfg);
        if (projectId) {
          const p = await api<ProjectView>(`projects/${projectId}`);
          if (!active) return;
          setProject(p);
          setBrief(p.brief);
          setProfile(p.profile);
          setScenes(p.scenes);
          setProjectName(p.name);
        } else if (pathname === "/projects/new") {
          setBrief({
            ...sampleBrief,
            brandName: "",
            productDescription: "",
            targetAudience: "",
            creativeConcept: "",
          });
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
  const dirtyScenes = !!project && JSON.stringify(scenes) !== JSON.stringify(project.scenes);
  const dirtyProfile = !!project && JSON.stringify(profile) !== JSON.stringify(project.profile);
  const dirtyBrief =
    !!project &&
    (JSON.stringify(brief) !== JSON.stringify(project.brief) || projectName !== project.name);
  const dirty = dirtyScenes || dirtyProfile || dirtyBrief;
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
  function ensureSaved() {
    if (dirty)
      throw new Error("Save your brief, consistency profile, and scene edits before generating.");
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
    if (composePrompt(scene, profile).length > maxPromptLength)
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
    setTab("review");
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
  const nav = [
    ["/", "Overview", LayoutDashboard],
    ["/projects/new", "New project", Plus],
    ["/tasks", "Generation tasks", Clapperboard],
    ["/analytics", "Analytics", BarChart3],
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
        <div className="sidebar-note">
          <Leaf size={22} />
          <strong>
            Big ideas.
            <br />
            Thoughtful frames.
          </strong>
          <p>One clear workflow, from your first brief to your next creative direction.</p>
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
            <span className="mode-dot" />{" "}
            <span>Video: {config.videoMode === "mock" ? "Mock mode" : "Live mode"}</span>
            <span className="top-divider" />
            <span className="tiny">LOCAL-FIRST STUDIO</span>
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
          {error && (
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
                  <section className="welcome-hero">
                    <div>
                      <span className="hero-tag">
                        <Sparkles size={14} /> FROM BRIEF TO BETTER PROMPTS
                      </span>
                      <h2>
                        A story worth
                        <br />
                        bringing to life.
                      </h2>
                      <p>
                        Shape your concept. Plan every scene.
                        <br />
                        Keep the details that make your brand, yours.
                      </p>
                      <button
                        className="btn primary"
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            const p = await api<ProjectView>("projects", "POST", {
                              brief: sampleBrief,
                              origin: "demo",
                            });
                            router.push(`/projects/${p.id}`);
                          })
                        }
                      >
                        Try the coffee campaign <ArrowRight size={17} />
                      </button>
                      <span className="hero-footnote">
                        Sample project · template storyboard · mock video
                      </span>
                    </div>
                    <div className="hero-art">
                      <SceneArt large />
                      <span className="hero-art-chip">
                        <Clapperboard size={15} /> Morning Brew · 15s plan
                      </span>
                    </div>
                  </section>
                  <div className="section-heading">
                    <h2>
                      Your projects <span className="count">{projects.length}</span>
                    </h2>
                    <span className="muted tiny">Every brief has a beginning.</span>
                  </div>
                  {projects.length ? (
                    <div className="project-grid">
                      {projects.map((p, i) => (
                        <Link className="project-card" key={p.id} href={`/projects/${p.id}`}>
                          <SceneArt index={i} />
                          <div className="project-card-body">
                            <div className="row-between">
                              <span className="project-category">{p.brief.targetPlatform}</span>
                              <span className="badge">
                                {p.origin === "demo" ? "Sample" : "User-created"}
                              </span>
                            </div>
                            <h3>{p.name}</h3>
                            <p>
                              {p.brief.duration}s plan <span>·</span> {p.brief.aspectRatio}{" "}
                              <span>·</span> {p._count?.scenes || 0} scenes
                            </p>
                            <div className="project-card-foot">
                              <span>{date(p.updatedAt)}</span>
                              <ArrowRight size={16} />
                            </div>
                          </div>
                        </Link>
                      ))}
                      <Link href="/projects/new" className="new-project-card">
                        <Plus size={25} />
                        <strong>Start something new</strong>
                        <span>Turn a brief into a storyboard</span>
                      </Link>
                    </div>
                  ) : (
                    <div className="empty">
                      <FileText size={29} />
                      <h3>Your first story is waiting.</h3>
                      <p>Create a project or try the sample above. No API key needed.</p>
                    </div>
                  )}
                  <div className="workflow-strip">
                    {[
                      [FileText, "01", "Write your brief"],
                      [WandSparkles, "02", "Shape your scenes"],
                      [ShieldCheck, "03", "Share visual direction"],
                      [CirclePlay, "04", "Generate & review"],
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
                      Use Morning Brew example
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
                          We’ll help you plan scenes, define shared visual details, and review
                          individual video clips.
                        </p>
                      </div>
                      <ModeBadge mode={config.storyboardMode} />
                      <p className="tiny">
                        {config.storyboardMode === "mock"
                          ? "Template-based storyboards are labeled as Mock. No model is called in this mode."
                          : "Your brief is sent to the configured LLM when you generate a storyboard."}
                      </p>
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
                        {project.origin === "demo" ? "SAMPLE CAMPAIGN" : "YOUR CAMPAIGN"}
                        <ModeBadge mode={project.storyboardMode || config.storyboardMode} />
                      </div>
                      <h1>{project.name}</h1>
                      <p>
                        {project.brief.targetPlatform} <span>·</span> {project.brief.aspectRatio}{" "}
                        <span>·</span> {project.brief.duration}s storyboard plan
                      </p>
                    </div>
                    <div className="button-row">
                      <button
                        className="btn"
                        disabled={busy}
                        onClick={() => run(() => exportData())}
                      >
                        <Download size={16} />
                        Export project
                      </button>
                      <Link
                        href={`/projects/${project.id}/settings`}
                        className="icon-btn"
                        aria-label="Project settings"
                      >
                        <Settings2 size={19} />
                      </Link>
                    </div>
                  </div>
                  <div className="studio-tabs">
                    {[
                      ["brief", "01", "Creative brief"],
                      ["storyboard", "02", "Storyboard"],
                      ["consistency", "03", "Visual consistency"],
                      ["review", "04", "Generate & review"],
                    ].map(([id, n, label]) => (
                      <button
                        key={id}
                        onClick={() => setTab(id)}
                        className={tab === id ? "selected" : ""}
                      >
                        <span>{n}</span>
                        {label}
                        {id === "review" && project.tasks.length > 0 && (
                          <b>{project.tasks.length}</b>
                        )}
                      </button>
                    ))}
                  </div>
                  {tab === "brief" && (
                    <section className="panel">
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
                      <div className="panel-actions">
                        <button
                          className="btn primary"
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              await api(`projects/${project.id}`, "PATCH", {
                                revision: project.revision,
                                brief: validateBrief(),
                                name: projectName,
                              });
                              await reload(false);
                            }, "Brief saved. Existing scenes have not been overwritten.")
                          }
                        >
                          <Save size={16} />
                          Save brief
                        </button>
                      </div>
                    </section>
                  )}
                  {(tab === "storyboard" || tab === "consistency") && (
                    <>
                      <div className="section-heading storyboard-toolbar">
                        <div>
                          <h2>
                            {tab === "consistency"
                              ? "The details that stay with your story"
                              : "Your story, scene by scene"}
                          </h2>
                          <p className="muted">
                            {tab === "consistency"
                              ? "One shared direction, referenced in every generation."
                              : "Fine-tune the moments. Make the story your own."}
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
                              <button
                                className="btn"
                                disabled={busy}
                                onClick={() =>
                                  run(async () => {
                                    const saved = await api<ProjectView>(
                                      `projects/${project.id}/storyboard`,
                                      "PUT",
                                      { revision: project.revision, scenes },
                                    );
                                    setProject(saved);
                                    setScenes(saved.scenes);
                                  }, "Storyboard saved.")
                                }
                              >
                                <Save size={15} />
                                Save scenes{dirtyScenes ? " *" : ""}
                              </button>
                            </>
                          )}
                          <button
                            className="btn primary"
                            disabled={busy || dirty || setupMissing}
                            onClick={() =>
                              run(async () => {
                                ensureSaved();
                                if (
                                  scenes.length &&
                                  !confirm(
                                    "Replace the current storyboard? Existing video task history will be kept.",
                                  )
                                )
                                  return;
                                await api(`projects/${project.id}/storyboard`, "POST", {
                                  revision: project.revision,
                                });
                                await reload();
                              }, "Storyboard generated.")
                            }
                          >
                            <WandSparkles size={16} />
                            {scenes.length ? "Regenerate board" : "Generate storyboard"}
                          </button>
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
                          <span className="draft-dot" /> Unsaved edits · Save changes before
                          generating or exporting.
                        </div>
                      )}
                      <div
                        className={`workspace-grid ${showProfile || tab === "consistency" ? "with-profile" : ""}`}
                      >
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
                              <ModeBadge mode={config.storyboardMode} />
                              <p className="tiny">
                                Mock mode uses editable templates, not an AI model.
                              </p>
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
                                      <SceneArt index={i} />
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
                                      <label>
                                        Scene Prompt
                                        <textarea
                                          rows={4}
                                          value={scene.prompt}
                                          onChange={(e) =>
                                            editScene(scene.id, "prompt", e.target.value)
                                          }
                                        />
                                      </label>
                                      <p className="field-help">
                                        Final prompt: {composePrompt(scene, profile).length} /{" "}
                                        {config.capabilities.maxPromptLength ?? 10000} characters
                                      </p>
                                      {sceneIssue(scene) && (
                                        <p className="field-error">{sceneIssue(scene)}</p>
                                      )}
                                      <details>
                                        <summary>Scene direction & final prompt</summary>
                                        {sceneFields
                                          .filter(([key]) => key !== "prompt")
                                          .map(([key, label]) => (
                                            <label key={key}>
                                              {label}
                                              <textarea
                                                rows={2}
                                                value={scene[key]}
                                                onChange={(e) =>
                                                  editScene(scene.id, key, e.target.value)
                                                }
                                              />
                                            </label>
                                          ))}
                                        <label>
                                          Final submitted prompt preview
                                          <textarea
                                            readOnly
                                            rows={6}
                                            value={composePrompt(scene, profile)}
                                          />
                                        </label>
                                      </details>
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
                                          disabled={busy || dirty || setupMissing}
                                          onClick={() =>
                                            run(async () => {
                                              ensureSaved();
                                              await api(
                                                `projects/${project.id}/scenes/${scene.id}/regenerate`,
                                                "POST",
                                                { revision: project.revision },
                                              );
                                              await reload();
                                            }, "Scene regenerated with the shared visual profile.")
                                          }
                                        >
                                          <RefreshCw size={13} />
                                          Rewrite
                                        </button>
                                      </div>
                                      <button
                                        className="btn full"
                                        disabled={
                                          busy || dirty || setupMissing || !!sceneIssue(scene)
                                        }
                                        onClick={() => run(() => generateClips([scene.id]))}
                                      >
                                        <CirclePlay size={15} />
                                        Generate clip
                                      </button>
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
                                        prompt:
                                          "Describe this scene’s subject, action, setting, camera, and style.",
                                      },
                                    ])
                                  }
                                >
                                  <Plus size={15} />
                                  Add scene
                                </button>
                                <button
                                  className="text-btn"
                                  disabled={busy}
                                  onClick={() => run(() => exportData(true))}
                                >
                                  <Download size={14} />
                                  Export storyboard JSON
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                        {(showProfile || tab === "consistency") && (
                          <aside className="consistency-panel">
                            <div className="row-between">
                              <span className="icon-tile small">
                                <ShieldCheck size={19} />
                              </span>
                              <span className="tiny muted">PROFILE V{project.profileVersion}</span>
                            </div>
                            <h3>
                              Visual Consistency
                              <br />
                              Profile
                            </h3>
                            <p className="muted">The shared details that guide every scene.</p>
                            {profileFields.map(([key, label]) => (
                              <label key={key}>
                                {label}
                                <textarea
                                  aria-label={label}
                                  rows={3}
                                  value={profile[key]}
                                  onChange={(e) =>
                                    setProfile({ ...profile, [key]: e.target.value })
                                  }
                                />
                              </label>
                            ))}
                            <button
                              className="btn primary full"
                              disabled={busy}
                              onClick={() =>
                                run(async () => {
                                  await api(`projects/${project.id}`, "PATCH", {
                                    revision: project.revision,
                                    profile,
                                  });
                                  const updated = await api<ProjectView>(`projects/${project.id}`);
                                  setProject(updated);
                                  setProfile(updated.profile);
                                }, "Visual profile saved. Future generations will reference it.")
                              }
                            >
                              <Save size={15} />
                              Save profile{dirtyProfile ? " *" : ""}
                            </button>
                            <div className="profile-disclaimer">
                              <ShieldCheck size={15} />
                              <span>
                                Prompt guidance only. Actual visual consistency depends on the model
                                and is not guaranteed.
                              </span>
                            </div>
                          </aside>
                        )}
                      </div>
                      <div className="generation-bar">
                        <div>
                          <strong>
                            {scenes.length} scenes · {project.brief.duration}s plan
                          </strong>
                          <span>Individual clips only. No automatic stitching.</span>
                          {config.videoDescription && <span>{config.videoDescription}</span>}
                        </div>
                        <div className="button-row">
                          <button className="text-btn" onClick={() => setShowProfile(!showProfile)}>
                            {showProfile ? "Hide" : "Show"} visual profile
                          </button>
                          {config.videoMode === "mock" && (
                            <select
                              aria-label="Mock scenario"
                              value={scenario}
                              onChange={(e) => setScenario(e.target.value)}
                            >
                              <option value="success">Mock: success</option>
                              <option value="fail">Mock: simulate failure</option>
                            </select>
                          )}
                          <button
                            className="btn primary"
                            disabled={
                              busy ||
                              setupMissing ||
                              dirty ||
                              !scenes.length ||
                              total !== project.brief.duration ||
                              scenes.some((scene) => !!sceneIssue(scene))
                            }
                            onClick={() => run(() => generateClips(scenes.map((s) => s.id)))}
                          >
                            {busy ? (
                              <Loader2 className="spin" size={16} />
                            ) : (
                              <CirclePlay size={17} />
                            )}
                            Generate all clips
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                  {tab === "review" && (
                    <>
                      <div className="section-heading">
                        <div>
                          <h2>A little perspective on every take.</h2>
                          <p className="muted">
                            Review, leave feedback, and decide what comes next.
                          </p>
                        </div>
                        <button className="btn" onClick={() => setTab("storyboard")}>
                          <ArrowLeft size={15} />
                          Edit prompts
                        </button>
                      </div>
                      <TaskList
                        tasks={project.tasks}
                        busy={busy}
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
                          }, "Review saved.")
                        }
                      />
                    </>
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
                      }, "Review saved.")
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
      </div>
    </div>
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
    ["brandName", "Brand Name", "e.g. Morning Brew"],
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
        Storyboard Duration <span className="required">*</span>
        <select
          value={brief.duration}
          onChange={(e) => setBrief({ ...brief, duration: Number(e.target.value) as 15 | 30 })}
        >
          <option value={15}>15 seconds · 3 scenes by default</option>
          <option value={30}>30 seconds · 5 scenes by default</option>
        </select>
        <span className="field-help">Planning duration. Clips are not automatically stitched.</span>
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
  onReview: (id: string, rating: number, feedback: string) => void;
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
  onReview: (id: string, rating: number, feedback: string) => void;
}) {
  const [rating, setRating] = useState(task.review?.rating || 0);
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
              src={task.resultUrl}
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
              Generated by Alibaba Cloud Wan from the saved prompt. The result link expires after 24
              hours; save the clip from Open clip.
            </p>
          )}
          <a className="text-btn" href={task.resultUrl} target="_blank" rel="noreferrer">
            <CirclePlay size={14} />
            Open clip
          </a>
          <div className="review-form">
            <label>Rate this result</label>
            <div className="stars">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  aria-label={`Rate ${n} stars`}
                  aria-pressed={rating === n}
                  onClick={() => setRating(n)}
                  key={n}
                >
                  <Star size={23} fill={n <= rating ? "currentColor" : "none"} />
                </button>
              ))}
            </div>
            <label>
              Feedback
              <textarea
                aria-label="Feedback"
                rows={2}
                maxLength={3000}
                value={feedback}
                placeholder="What worked? What would you change?"
                onChange={(e) => setFeedback(e.target.value)}
              />
            </label>
            <button
              className="btn full"
              disabled={busy || !rating}
              onClick={() => onReview(task.id, rating, feedback)}
            >
              <Save size={14} />
              {task.review ? "Update review" : "Save review"}
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
