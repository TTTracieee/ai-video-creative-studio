# AI Video Creative Studio — Frame

## Problem

Marketing briefs describe an audience and an objective, while video generation requires concrete scene and camera instructions. I explored the hypothesis that a structured workspace could help organize this translation and make iterations easier to trace. I have not validated demand through user interviews.

## Product Vision

Help a marketer move from a brief to an editable storyboard, shared visual instructions, individual clip-generation attempts, and review feedback in one local-first application.

## Target Users

Marketing specialists, social content creators, small-brand owners, and agency team members who need a focused planning workflow. This is a chosen initial audience, not a validated customer segment.

## My Role

Product framing, MVP prioritization, interaction design, and full-stack implementation with Codex-assisted development. I defined the data model, provider boundaries, event definitions, and an executable usability-testing plan. Automated tests are distinct from research with external participants.

## MVP Scope

A working Next.js application with persisted briefs, editable scenes, a four-field Visual Consistency Profile, asynchronous Mock video tasks, retry history, ratings, feedback, JSON export, and a small analytics dashboard. Default storyboards use labeled templates; default videos are fixed, watermarked demonstration assets. The application does not assemble a finished advertisement.

## Product Decisions

I prioritized the complete no-key workflow before real API adapters and analytics. Runway already offers references and workflows, and Firefly offers camera and reference controls; my differentiation hypothesis concerns a marketing-oriented planning and review experience, not a claim that competitors lack those capabilities. Shared visual instructions are prompt constraints, not a technical guarantee of cross-scene consistency.

## Technical Implementation

Next.js, React, TypeScript, Tailwind CSS, Prisma, SQLite, and Zod. Provider interfaces separate storyboard creation from video generation. Tasks preserve the final prompt and profile version, while revision checks protect newer edits. Mock task progression is derived from database timestamps so refreshes and process restarts do not erase its state. Live adapters target OpenAI Structured Outputs and the historical BACH v1 text-to-video contract; real paid calls have not been verified.

## Challenges

I addressed invalid structured output, duration budgeting, duplicate submissions, ambiguous provider timeouts, retry history, and analytics denominators. Browser testing exposed an Origin/Host mismatch in the local server path, which was corrected. BACH's old documentation now redirects to a different Pro protocol, so I kept the legacy adapter separate and documented the availability uncertainty.

## Evaluation

The core success and failure/retry browser workflows were run successfully before adding live adapters. Unit and integration tests cover parsing, persistence, state progression, provider contracts, access protection, and analytics. The final checks passed 22 business/contract tests, three browser scenarios, a production build, and access-protection and process-restart smoke tests. Exact command results are recorded in TEST_RESULTS.md. Protocol tests use simulated transports; they do not establish live API access, model quality, a deployed service, or business impact. No external user-study findings are claimed.

## Future Improvements

Conduct observed task testing with target users; measure whether shared instructions are understood and useful; then evaluate reference-image support, additional providers, and clip assembly. Verify account access and legacy API availability before live evaluation. Deploy the password-protected application with persistent storage and test recovery.

## CV-ready descriptions

- Built a local-first AI video creative workspace with Next.js, TypeScript, Prisma, and SQLite, connecting marketing briefs, editable storyboards, shared visual instructions, and review feedback.
- Designed provider adapters with schema validation, capability checks, immutable generation snapshots, and persistent asynchronous task and retry history.
- Defined source-separated product metrics and implemented terminal-task success rates, brief-to-storyboard conversion, and latest-result ratings without pooling Mock and Live data.
- Used Codex-assisted development to translate product hypotheses into a working MVP, automated workflow tests, documented decisions, and an executable usability-testing plan.

No user growth, revenue, time savings, public deployment, guaranteed consistency, or verified paid API performance is implied.
