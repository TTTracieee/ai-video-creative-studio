"use client";
import { useEffect, useState } from "react";
import { BarChart3, Loader2 } from "lucide-react";
import { api } from "@/lib/client-api";
import type { AnalyticsResult } from "@/lib/analytics";
const percent = (n: number | null) => (n === null ? "—" : `${(n * 100).toFixed(1)}%`);
export default function Analytics() {
  const [mode, setMode] = useState("mock"),
    [origin, setOrigin] = useState("user"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const [result, setResult] = useState<AnalyticsResult | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    async function load() {
      setError("");
      setResult(null);
      try {
        const query = new URLSearchParams({ mode, origin });
        if (from) query.set("from", new Date(`${from}T00:00:00`).toISOString());
        if (to) query.set("to", new Date(`${to}T23:59:59.999`).toISOString());
        const data = await api<AnalyticsResult>(`analytics?${query}`);
        if (active) setResult(data);
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [mode, origin, from, to]);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">A LITTLE SIGNAL, A CLEARER NEXT STEP</span>
          <h1>Internal product analytics</h1>
          <p>Diagnostic metrics for the builder; these are not campaign performance metrics.</p>
        </div>
        <BarChart3 size={29} color="#7f956c" />
      </div>
      <div className="analytics-filters">
        <label>
          Provider mode
          <select
            aria-label="Analytics provider mode"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="mock">Mock execution</option>
            <option value="live">Live</option>
          </select>
        </label>
        <label>
          Data source
          <select
            aria-label="Analytics data source"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
          >
            <option value="user">User-created activity</option>
            <option value="demo">Sample projects</option>
          </select>
        </label>
        <label>
          From
          <input
            type="date"
            aria-label="Analytics from"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          Through
          <input
            type="date"
            aria-label="Analytics through"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>
      <p className="tiny muted">
        Default range: last 30 days. Personal activity is not validated user research. Mode applies
        to the relevant storyboard or video provider.
      </p>
      {mode === "mock" && (
        <div className="message warning" style={{ marginTop: 20 }}>
          Mock execution only. These metrics do not measure real model quality, speed, or market
          demand.
        </div>
      )}
      {error && (
        <div className="message error" role="alert">
          {error}
        </div>
      )}
      {!result && !error ? (
        <div className="loading">
          <Loader2 className="spin" />
          Calculating metrics…
        </div>
      ) : (
        result && (
          <>
            <div className="metric-grid">
              <div className="metric">
                <span>BRIEF → STORYBOARD CONVERSION</span>
                <strong data-testid="conversion-rate">{percent(result.conversion)}</strong>
                <p>
                  {result.converted} of {result.briefs} projects in this brief cohort
                </p>
              </div>
              <div className="metric">
                <span>GENERATION SUCCESS RATE</span>
                <strong data-testid="success-rate">{percent(result.successRate)}</strong>
                <p>
                  {result.completed} completed / {result.completed + result.failed} terminal
                  attempts
                </p>
              </div>
              <div className="metric">
                <span>AVERAGE USER RATING</span>
                <strong data-testid="average-rating">
                  {result.averageRating === null ? "—" : `${result.averageRating.toFixed(1)} / 5`}
                </strong>
                <p>{result.ratingCount} latest task reviews</p>
              </div>
            </div>
            <section className="panel">
              <div className="stats-strip">
                <div>
                  <span>Failure rate · terminal tasks</span>
                  <strong>{percent(result.failureRate)}</strong>
                </div>
                <div>
                  <span>Retry attempts / all attempts</span>
                  <strong>{percent(result.retryRate)}</strong>
                </div>
                <div>
                  <span>Average completed duration</span>
                  <strong>
                    {result.averageDuration === null
                      ? "—"
                      : `${result.averageDuration.toFixed(1)}s`}
                  </strong>
                </div>
                <div>
                  <span>Still in progress</span>
                  <strong>{result.pending + result.processing}</strong>
                </div>
              </div>
              <p className="tiny muted" style={{ marginTop: 22 }}>
                {result.taskCount} attempts · {result.pending} pending · {result.processing}{" "}
                processing · {result.failed} failed. Unfinished attempts are excluded from success
                and failure rates. Tasks sync while their workspace or task page is open.
              </p>
            </section>
            <details className="definitions">
              <summary>How these metrics are calculated</summary>
              <ul>
                <li>
                  Conversion: projects created in the range with a matching-mode storyboard
                  generation event by the range end / all briefs created in the range.
                </li>
                <li>
                  Success: completed / (completed + failed), for attempts created in the range and
                  terminal by its end.
                </li>
                <li>
                  Rating: average latest saved rating for completed attempts in the cohort.
                  Revisions do not add extra reviews.
                </li>
                <li>Failure: failed / terminal attempts. Retry: retry attempts / all attempts.</li>
                <li>
                  Duration: mean completedAt − createdAt for completed attempts, including queue
                  time.
                </li>
                <li>
                  Mock and Live are never pooled. User-created and sample projects are separated.
                  Automated test databases are separate.
                </li>
                <li>
                  Without samples the value is —. Review edits are stored as the latest value, not a
                  historical rating timeline.
                </li>
              </ul>
            </details>
          </>
        )
      )}
    </>
  );
}
