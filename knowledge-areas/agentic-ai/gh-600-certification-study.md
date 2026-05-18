# GH-600: GitHub Certified Agentic AI Developer — Complete Study Guide

**Exam:** GH-600 (beta, GA July 2026)
**Format:** 120 min, proctored, scenario-based
**Passing:** 700+
**Source:** https://learn.microsoft.com/en-us/credentials/certifications/agentic-ai-developer/
**Study Guide:** https://aka.ms/GH600-StudyGuide

---

## Domain 1: Prepare Agent Architecture and SDLC Processes (15–20%)

### 1.1 Integrate Agents into the SDLC

**Key concepts:**
- Agents should occupy discrete, well-defined steps in the SDLC — not "do everything"
- Each agent step needs clear inputs, outputs, and success criteria
- Common anti-patterns: agent scope creep, undefined handoff contracts, circular dependencies, single-point-of-failure agents, "god agent" that tries to do planning + coding + testing + deploying in one run

**Anti-pattern catalog:**
1. **God Agent** — one agent does planning, implementation, testing, and deployment. Fails because context window doesn't fit everything and no independent QA.
2. **Context Collision** — multiple agents modify the same file/project without coordination. Produces merge conflicts and overwritten work.
3. **Silent Failure** — agent produces output but doesn't verify it. QA is skipped, bugs ship.
4. **Drift Cascade** — agent makes assumption in step 1, subsequent steps build on that assumption, final output is wrong but "consistent."
5. **Hallucinated Artifacts** — agent claims to have created/verified files that don't exist or are wrong.
6. **Orphan Handoff** — agent hands work to next agent without sufficient context, next agent can't proceed.
7. **Infinite Loop** — agent retries the same approach on failure instead of escalating.
8. **Permission Creep** — agent accumulates wider tool permissions than needed for its specific SDLC step.

**Input/Output/Success definitions:**
- **Inputs:** issue description, linked artifacts, gbrain context, repository state (branch, files)
- **Outputs:** structured deliverable (code change, test plan, QA report), proof artifact (screenshot, log, PR URL)
- **Success criteria:** specific, testable, scoped to the agent's role (NOT "the feature works" — that spans multiple agents)

### 1.2 Define Boundaries Between Planning, Reasoning, and Action

**Core principle:** These must be separate phases, potentially separate agents.

**Planning phase:**
- Agent outputs a structured plan BEFORE acting
- Plan includes: scope, file list, acceptance criteria, test strategy, risks, dependencies
- Plan is human-readable and machine-validatable

**Reasoning phase:**
- Agent analyzes the problem using plan as framework
- Produces inspectable intermediate reasoning (thinking traces, decision logs)

**Action phase:**
- Agent executes ONLY steps from the approved plan
- Must not improvise new scope mid-execution
- Every action should leave an audit trail

**Plan validation:**
- Can the plan be executed as written?
- Are dependencies identified and ordered?
- Are the acceptance criteria testable?
- Is the scope bounded (touching specific files, not "refactor everything")?

**Guard pattern:** Agent must NOT act until plan is validated (by human or automated checker).

### 1.3 Configure Observability and Control for Autonomous Agents

**Autonomy spectrum:**
1. **Fully autonomous** — agent plans + executes + verifies unsupervised (highest risk)
2. **Gated autonomous** — agent plans, human/automated check approves, agent executes (medium risk)
3. **Supervised** — agent proposes, human approves each action (lowest risk)
4. **Advisory only** — agent analyzes and recommends, human does everything

**Inspectable artifacts:**
- Every agent action must produce something reviewable: PR comments, Linear comments, audit logs, screenshots
- Artifacts should be in standard dev tooling (GitHub, Linear) — not custom formats

**Human intervention design:**
- Intervention points should be well-defined gates, not ad-hoc
- Intervention should not bottleneck the pipeline — asynchronous approval (comment + auto-continue) beats synchronous (must wait for human)
- Escalation path: automated retry → agent peer review → human review → block

### Motor Inn Cross-Reference (Domain 1)

**What we do well:**
- Archie handles planning (split-issue.mjs), Dev handles execution, Eve handles QA — clear separation
- Parent→child issue trees enforce bounded scope per agent
- `block.mjs --kind agent-redo` is a formal escalation path
- Phase 0→5 architecture maps SDLC phases to specific work packages

**Gaps identified:**
- No formal anti-pattern detection — we discover them when cards fail (MOT-355 "6-card battlefield")
- Planning is implicit in issue descriptions, not a structured "plan artifact" validated before Dev starts
- No autonomy-level classification per task type
- Human intervention is `needs-spencer` label only — no graduated intervention levels

---

## Domain 2: Implement Tool Use and Environment Interaction (20–25%)

### 2.1 Select and Configure Agent Tools

**Tool selection criteria:**
- Does the agent NEED this tool to complete its SDLC step?
- Is the tool's permission scope appropriate? (read-only file access vs. write access vs. shell execution vs. network access)
- Is the tool idempotent? (safe to retry)
- Is the tool's output deterministic? (same input = same output, or at least predictable)

**Tool permission model:**
- **Least privilege principle:** Agent gets only the tools needed for its specific task
- **Scoped by task type:** planning agent gets read + comment tools; execution agent gets read + write; QA agent gets read + verify tools
- **Temporal scoping:** tool access expires after task completion
- **Allowlist > blocklist:** explicitly grant tools rather than trying to block dangerous ones

**Tool configuration patterns:**
- Tool manifests should declare: name, description, parameters schema, permission level, idempotency, retry-safe
- Agents should be able to discover available tools but only use allowed ones
- Tool invocation should be logged with: agent ID, tool name, parameters, timestamp, result

### 2.2 Configure MCP Servers

**Model Context Protocol (MCP) fundamentals:**
- MCP is a standardized protocol for agents to interact with external tools and data sources
- Server → provides capabilities (tools, resources, prompts)
- Client (agent host) → connects to servers, routes agent tool calls

**MCP server configuration:**
- **Local MCP:** server runs on same machine, accessed via stdio or localhost
- **Remote MCP:** server hosted on GitHub/cloud, accessed via HTTPS + authentication
- **GitHub remote MCP:** GitHub-hosted MCP servers accessible to Copilot agents

**MCP registries:**
- Central catalog of available MCP servers
- Each server entry: name, description, endpoint, auth requirements, available tools
- Agents query registry to discover tools

**MCP allow lists:**
- Per-agent or per-task lists of which MCP servers/tools are permitted
- Prevents agent from accessing unauthorized external services
- Can be scoped to: specific servers, specific tools within servers, specific operations

**Tool permissions within MCP:**
- Read vs. write vs. execute permissions
- Rate limiting per tool
- Authentication scoping (which user/account the tool operates as)

### 2.3 Integrate Agents Within Development Environments

**Execution context evaluation:**
- Where does the agent run? (CI pipeline, local dev machine, cloud sandbox, GitHub Actions)
- What environment variables and secrets are available?
- What filesystem scope? (repo root, specific branch, specific directory)
- What network access? (none, localhost only, internet)

**Repository scoping:**
- Agent scope can be limited to: specific repo, specific branch, specific directory within repo
- Branch-based scope: agent operates on a feature branch, can't touch main directly
- Mono-repo scoping: agent limited to specific packages/services

**CI workflow integration:**
- Agents can be invoked as GitHub Actions workflow steps
- Input: workflow context (PR number, branch, commit SHA)
- Output: status (pass/fail), artifacts (reports, logs, screenshots)
- Agent actions within CI: code review, test generation, security scanning

**Autonomous action patterns:**
- Creating branches: agent generates branch name from issue ID + description
- Opening PRs: agent creates PR with title, description, linked issues
- Commit signing: agent commits must be attributable to the agent identity

**Environment constraints:**
- Production vs. staging vs. development — different permission levels
- Sandbox environments: isolated execution with no external side effects
- Resource limits: time, memory, API calls per agent run

### 2.4 Safe Execution Paths and Error Handling

**Error handling patterns:**
- **Graceful degradation:** agent should produce partial results rather than crash
- **Explicit error types:** classify errors as retryable, non-retryable, permission, environment
- **Error logging:** structured error data (type, context, attempt count, timestamp)

**Retry strategies:**
- Exponential backoff for transient errors (network, rate limit)
- Max retry count per operation (prevent infinite loops)
- Circuit breaker: stop retrying after N failures, escalate
- Different retry for different error types

**Rollback patterns:**
- Agent should be able to revert its own changes on failure
- Git-based rollback: reset branch to pre-agent state
- State-based rollback: undo DB changes, file writes
- Partial rollback: only undo the failed part, keep successful work

**Escalation paths:**
- Tier 1: agent retry with modified approach
- Tier 2: peer agent review (another agent checks the failure)
- Tier 3: human review (Spencer/Mac investigates)
- Escalation should include full context: what was attempted, what failed, logs, artifacts

**Traceability and accountability:**
- Every agent action logged with: agent ID, action type, target, result, timestamp
- Immutable audit trail (append-only log)
- Audit trail queryable by: agent, time range, issue, action type

### Motor Inn Cross-Reference (Domain 2)

**What we do well:**
- Dedicated Linear API scripts per function (claim, submit, verify, handoff, block, triage, split) — clear tool boundaries
- `dispatch-events.jsonl` for audit trail
- MCP server infrastructure for agent tools
- Branch-based workflow: `MOT-N` branches, PR-based submission
- `handoff.mjs` with hop counting and loop escalation
- `block.mjs` with three-tier blocking (agent-redo, needs-decision, external-wall)

**Gaps identified:**
- No formal tool permission model — agents have same tool access regardless of task
- No documented MCP server manifest/catalog — implicit in code only
- No retry strategy beyond "Dev daemon sees it's still in Todo and retries"
- No rollback mechanism — failed work stays in branches, cleaned up manually
- Error handling is ad-hoc (agent sees failure and blocks itself)
- No structured error classification system
- Tool idempotency not documented or enforced

---

## Domain 3: Manage Memory, State, and Execution (10–15%)

### 3.1 Implement Agent Memory Strategies

**Memory types:**
1. **Short-term (conversation):** current turn's context window, includes system prompt + conversation history
2. **Long-term (durable):** persisted across sessions — MEMORY.md, gbrain, database records
3. **External (reference):** linked artifacts — Linear issues, Google Docs, PDFs, code files

**Memory scoping:**
- Only load memory relevant to current task
- Use semantic search (memory_search) to find relevant snippets
- Avoid loading entire memory store into context

**Memory expiration, pruning, and reset:**
- Daily notes rotate (memory/YYYY-MM-DD.md) — natural expiration
- Long-term memory (MEMORY.md) pruned periodically — remove stale info
- Session reset: each new session starts fresh, must re-read memory

**Memory strategies by task type:**
- Planning tasks: need broad context (architecture, previous decisions, related issues)
- Execution tasks: need focused context (specific issue, file contents, acceptance criteria)
- QA tasks: need comparison context (expected vs. actual, previous test results)

### 3.2 Persist Agent State and Manage Context Drift

**State capture:**
- What was decided and why (decision log)
- What was completed and what remains (progress markers)
- Dependencies and their status
- Format: Linear comments, structured JSON artifacts, gbrain pages

**Resumption patterns:**
- Agent should be able to resume work without repeating completed steps
- Checkpoint: after each meaningful milestone, persist state
- Resume signal: "you were working on X, you completed Y, next step is Z"

**Context drift detection:**
- Compare current state with expected state from last checkpoint
- Signals of drift: different branch than expected, modified files not matching plan, different issue state
- Correction: re-read the plan, compare with current state, identify gap, resume from correct point

**Drift prevention:**
- Explicit state markers ("last completed step: 3 of 7")
- Immutable plan reference (Linear issue description should not change mid-execution)
- Agent re-reads plan at start of each session/turn

### 3.3 Ensure Continuity Across Tools and Environments

**State sharing:**
- Agents share state through Linear (comments, labels, state transitions)
- gbrain for knowledge continuity
- `dispatch-events.jsonl` for event-based state

**Conflicting context prevention:**
- Only one agent should be "active" on an issue at a time (state machine enforces this)
- If multiple agents need to work on related files, sequence them (blocks relation)
- Split large tasks into sequenced sub-issues to prevent overlap

**Stale context prevention:**
- Re-read issue + linked context at session start
- Check for newer comments/updates since last interaction
- Timeout and re-queue if issue has been modified by another agent

### Motor Inn Cross-Reference (Domain 3)

**What we do well:**
- Three memory tiers exist: session context (short-term), memory/YYYY-MM-DD.md (medium-term), gbrain (long-term)
- `memory_search` with corpus filtering for targeted retrieval
- Linear state machine (Todo → In Progress → In Review → Done) enforces single-agent-at-a-time
- Daily note rotation provides natural memory expiration
- Archie's "required reading each session" is a resumption pattern

**Gaps identified:**
- No formal checkpoint system — agents don't explicitly mark "completed step 3 of 7"
- No drift detection — if agent diverges from plan, no one notices until QA fails
- Resumption is ad-hoc (agent reads issue + code, figures out what happened)
- State is scattered across Linear comments + gbrain + audit log — no unified state view
- Long-running tasks (multi-wake) degrade because agent loses thread across wakes
- No explicit memory strategy per agent role — all agents use same memory pattern

---

## Domain 4: Perform Evaluation, Error Analysis, and Tuning (15–20%)

### 4.1 Define Success Criteria and Evaluation Signals

**Expected outcomes:**
- Functional: the code/feature works as described
- Quality: meets standards (tests pass, lint clean, no regressions)
- Completeness: all acceptance criteria met, no missing deliverables
- Correctness: output matches plan, no scope creep or shortcuts

**Operational constraints:**
- Performance: within acceptable time/resource bounds
- Security: no introduced vulnerabilities
- Compatibility: works with existing systems
- Reversibility: can be rolled back if needed

**Evaluation signals (quantitative):**
- Test pass rate: % of tests passing
- Code coverage: % of code covered by tests
- Lint/type errors: count of violations
- Build success: binary yes/no
- PR mergeability: mergeable status, conflict count
- Performance metrics: runtime, memory usage

**Evaluation signals (qualitative):**
- Code review: human/agent assessment of code quality
- Design review: alignment with architecture
- Accessibility: WCAG compliance if UI
- Documentation: completeness, accuracy

**Automated scanning tools:**
- Linters, type checkers, test runners
- Security scanners (dependency audit, SAST)
- Performance profilers
- Accessibility checkers
- Schema validators (JSON-LD, structured data)

### 4.2 Analyze Agent Failures and Identify Root Causes

**Failure classification:**
1. **Reasoning errors:** agent misunderstood requirement, made wrong assumption, used incorrect logic
2. **Tool misuse:** agent used wrong tool, incorrect parameters, tool permission error
3. **Context issues:** missing information, stale context, conflicting information
4. **Environment issues:** network failure, auth failure, resource exhaustion
5. **Scope errors:** agent did too much (scope creep) or too little (incomplete)

**Root cause analysis framework:**
- Trace the agent's decision path: what did it read? what did it assume? what did it output?
- Compare output with plan: did it follow the plan? where did it deviate?
- Check artifacts: are the claimed deliverables present? are they correct?
- Reproduce: can the failure be reproduced with the same inputs?

**Failure data sources:**
- Agent thinking traces (if available)
- Tool invocation logs
- Linear comment history
- Git history (commits, diffs)
- Test results
- QA artifacts

### 4.3 Tune Agent Behavior Based on Evaluation

**Instruction revision:**
- Update agent AGENTS.md with lessons learned from failures
- Refine system prompts for specific task types
- Add explicit constraints for known failure modes ("never do X when Y")

**Workflow refinement:**
- Adjust handoff criteria (when to escalate vs. retry)
- Modify split thresholds (when to break into sub-issues)
- Update acceptance criteria format

**Constraint adjustment:**
- Tighten permissions for tasks that showed tool misuse
- Add explicit verification steps for error-prone operations
- Increase artifact requirements for high-risk changes

**Memory refinement:**
- Adjust what context is loaded per task type
- Add specific references for recurring issues
- Prune misleading or outdated information

**Tool refinement:**
- Add validation wrappers around risky tools
- Add default safe parameters
- Document tool usage patterns from successful executions

### Motor Inn Cross-Reference (Domain 4)

**What we do well:**
- Eve's QA role is an explicit evaluation gate
- `verify.mjs` with structured pass/fail
- `archie-merge-or-block.mjs` enforces CI, mergeability, branch naming
- `block.mjs` provides structured failure feedback
- QA artifacts (screenshots, test results) are required for submission

**Gaps identified:**
- Evaluation is binary (pass/fail) — no scored/weighted assessment
- No automated scanning integration (linters, security scanners run in CI but agents don't consume their output)
- Root cause analysis is manual — agent sees failure, blocks, human figures out why
- No systematic tuning loop — failures don't feed back into agent configuration automatically
- Agent instructions not version-tracked alongside results
- No evaluation metrics trend (is the pipeline getting better or worse over time?)
- Success criteria for agent tasks are implicit in issue descriptions, not formal

---

## Domain 5: Orchestrate Multi-Agent Coordination (15–20%)

### 5.1 Operate and Manage Multi-Agent Workflows

**Orchestration patterns:**

1. **Sequential pipeline:** Agent A → Agent B → Agent C (our Jeeves→Mac→Archie→Dev→Eve model)
   - Each agent produces artifact consumed by next agent
   - Clear handoff contracts at each boundary
   - Single point of failure at each step

2. **Fan-out/Fan-in:** Split work into parallel sub-tasks, merge results
   - Useful for independent work (different files, different services)
   - Requires merge agent to resolve conflicts
   - Higher throughput but more complex coordination

3. **Supervisor/Worker:** One supervisor agent assigns tasks, multiple workers execute
   - Supervisor monitors progress, reassigns on failure
   - Workers are stateless and interchangeable
   - Good for large-scale parallel work

4. **Debate/Critique:** Multiple agents produce proposals, critic agent selects best
   - Useful for high-stakes decisions
   - Higher cost but better quality for ambiguous problems

**Agent isolation for parallel execution:**
- Separate branches per parallel agent
- Non-overlapping file scopes
- Independent environments (no shared mutable state)
- Merge agent resolves any conflicts

**Conflict detection and resolution:**
- **Overlapping code changes:** two agents modify same file/function → detected by git merge conflict
- **Duplicated effort:** two agents solve same problem independently → detected by comparing outputs
- **Contradictory outputs:** agent A adds feature, agent B removes it → detected by integration testing
- **Resolution strategies:** sequential re-execution, merge agent, human decision

### 5.2 Configure Observability for Multi-Agent Behavior

**Artifacts for review and audit:**
- Per-agent: plan, execution log, output, verification result
- Per-handoff: handoff comment with context, dependencies, next steps
- Per-workflow: end-to-end trace showing agent chain and outcomes

**Decision documentation:**
- Key decisions logged: what was chosen, alternatives considered, rationale
- Handoff context: what agent A decided, what agent B needs to know
- Outcome documentation: final result and evidence

**Post-hoc analysis:**
- Reconstruct full agent execution trace from artifacts
- Identify bottlenecks, failures, coordination issues
- Measure per-agent and end-to-end performance

### 5.3 Detect and Respond to Multi-Agent Failures

**Failure types in multi-agent systems:**
- **Partial failure:** some sub-tasks succeeded, some failed
- **Stalled execution:** agent is stuck, no progress for N time units
- **Degraded coordination:** agents produce inconsistent or conflicting work
- **Cascading failure:** one agent's failure propagates to downstream agents

**Response strategies:**
- Partial success: merge successful work, re-queue failed sub-tasks
- Stalled execution: timeout + reassign or escalate
- Degraded coordination: pause all agents, resolve conflict, restart
- Cascading failure: rollback to last known good state, fix root cause, re-execute

**Recovery patterns:**
- Rollback: revert all agents' work to pre-workflow state
- Skip: mark failed step as "won't fix for now," continue pipeline
- Replace: reassign failed work to different agent with fresh context
- Human-in-the-loop: pause workflow, surface decision to human, resume on approval

### 5.4 Manage Agent Lifecycle in Multi-Agent Workflows

**Adding agents:**
- New agents must conform to existing handoff contracts
- Onboarding: document the agent's role, inputs, outputs, tools, and SLAs
- Test in isolation before integrating into pipeline

**Updating/reconfiguring agents:**
- Version agent configurations (AGENTS.md in git)
- Canary deployment: test updated agent on subset of work before full rollout
- Backward compatibility: updated agent must accept old input formats

**Retiring agents:**
- Preserve audit trail for retired agent's past work
- Migrate active work to replacement agent
- Update pipeline documentation to remove retired agent
- Archive agent's AGENTS.md and tool scripts

### Motor Inn Cross-Reference (Domain 5)

**What we do well:**
- Sequential pipeline: Jeeves→Mac→Archie→Dev→Eve — clear orchestration pattern
- `split-issue.mjs` creates discrete sub-issues with blocks relations
- `handoff.mjs` formalizes handoffs with context and hop counting
- `sweep-children-to-archie.mjs` for batch child management
- Branch-based isolation (MOT-N branches)
- `stale-blocker-sweep.mjs` for detecting stalled work

**Gaps identified:**
- No fan-out pattern — all work is sequential, no parallelism
- No agent lifecycle management — agents are static, no versioning or canary testing
- Conflict detection is reactive (Eve finds it at QA time) not proactive
- No end-to-end trace across the full agent chain — each handoff is independent
- No "partial success" handling — if sub-issue 3 of 9 fails, the whole chain blocks
- Agent retirement/update is manual and undocumented
- MOT-355 class problems (cards fighting over same file) have no systematic prevention — only reactive blocking
- No multi-agent performance metrics or trends

---

## Domain 6: Implement Guardrails and Accountability (10–15%)

### 6.1 Define Autonomy Levels

**Risk classification framework:**
- **Operational risk:** could the agent's action cause downtime or service degradation?
- **Security risk:** could the agent's action expose data, create vulnerabilities, or bypass auth?
- **Compliance risk:** could the agent's action violate regulations (GDPR, PCI, etc.) or internal policies?

**Autonomy tiers per action type:**

| Action type | Risk level | Autonomy | Human check |
|-------------|-----------|----------|-------------|
| Read files/logs | Low | Autonomous | None |
| Create branch | Low | Autonomous | None |
| Comment on issue | Low | Autonomous | None |
| Write code (feature branch) | Medium | Gated | Plan review |
| Run tests | Medium | Gated | None (automated) |
| Open PR | Medium | Autonomous | PR review later |
| Merge to main | High | Supervised | Required |
| Deploy to production | Critical | Supervised | Required |
| Delete data | Critical | Advisory only | Required |
| Modify auth/config | High | Supervised | Required |
| Send external messages | High | Gated | Message review |
| Execute shell commands | Medium-High | Gated | Command review |

**Right-sizing interventions:**
- Don't require human approval for low-risk, reversible actions (slows delivery)
- Don't allow autonomous execution for high-risk, irreversible actions (dangerous)
- Balance: enough guardrails for safety, enough autonomy for velocity

### 6.2 Implement Guardrails and Human-in-the-Loop Workflows

**Identifying actions requiring human judgment:**
- Irreversible operations (deploy, delete, schema changes)
- External communication (emails, social posts, Slack messages to customers)
- Financial transactions
- Access control changes
- Content that represents the brand publicly

**Blocking policy violations:**
- Pre-execution validation: agent's planned action is checked against policy BEFORE execution
- Runtime enforcement: tool proxy intercepts and blocks policy-violating calls
- Post-execution audit: violations are detected after the fact, triggering alerts

**Least-privilege access:**
- Per-agent tool allowlists (planning agent gets read tools, execution agent gets write tools)
- Scoped execution contexts (specific repo, branch, directory)
- Time-limited access (access expires after task duration)
- Environment isolation (production vs staging credentials)

**Explicit authorization:**
- Merge approvals: must pass CI + code review + QA before merge
- Deployment authorization: explicit approval gate before production deploy
- Controlled paths only: agent can only deploy through approved CI/CD pipeline, never direct

**Accountability:**
- Immutable audit log of all agent actions
- Agent identity per action (which agent, which wake, which task)
- Rollback capability for any agent action
- Regular audit review of agent activity

**Compliance logging:**
- What was done, by which agent, when, why (linked to issue), result
- Retained for compliance period
- Queryable for audits

### Motor Inn Cross-Reference (Domain 6)

**What we do well:**
- `archie-merge-or-block.mjs` with 6 formal merge gates
- `block.mjs` with three blocking tiers (agent-redo, needs-decision, external-wall)
- Spencer override (`merge-override: spencer-approved`) for human-in-the-loop
- `handoff.mjs` with hop-count escalation to prevent infinite loops
- Branch-based isolation (agents work on MOT-N branches, never main directly)
- `dispatch-events.jsonl` for immutable audit trail
- Self-verification-block pattern (agent cannot verify own work)

**Gaps identified:**
- No formal autonomy level classification — all agents run with same effective permissions
- No risk-based tool permission model — agent tools are not scoped by risk level
- Guardrails are merge-time only (gates checked at PR merge), not pre-execution
- No policy engine — violations detected by humans/agents on review, not systematically blocked
- No least-privilege enforcement — agent has full tool access regardless of task
- No deployment authorization gate (not relevant yet since we're not in production)
- Accountability is reactive (audit log exists but rarely reviewed)
- No regular audit or compliance review process

---

## Overall Motor Inn Agent Pipeline Assessment

### Pipeline Maturity Score

| Domain | Maturity | Rating |
|--------|----------|--------|
| 1. Architecture & SDLC | Medium | We separate planning/execution/QA but lack formal anti-pattern detection and plan validation |
| 2. Tool Use & Environment | Medium-High | Rich tool suite, but no permission model, retry/rollback, or error classification |
| 3. Memory & State | Medium-Low | Multi-tier memory exists but no checkpoint system, drift detection, or unified state view |
| 4. Evaluation & Tuning | Low-Medium | Eve does QA but it's binary, no scored evaluation, no tuning feedback loop |
| 5. Multi-Agent Coordination | Medium | Sequential pipeline works but no parallelism, no conflict prevention, no lifecycle management |
| 6. Guardrails | Medium | Good merge gates but no risk-based autonomy, no pre-execution policy enforcement |

### Top Systemic Vulnerabilities

1. **No checkpoint/resumption system (D3)** — multi-wake tasks degrade, agents lose context
2. **No conflict prevention (D5)** — MOT-355 class problems will recur until we have proactive coordination
3. **Binary evaluation only (D4)** — cannot measure improvement or detect gradual degradation
4. **No permission model (D2, D6)** — agents have uniform tool access, no least-privilege
5. **No anti-pattern catalog (D1)** — we learn from failures but don't systematize the learning
