# Scribe

**Scribe is a sales employee agent that turns a rep's call recap into real CRM work** — updated Opportunity fields, follow-up Tasks, logged call notes, and new Contact records for stakeholders who came up on the call but aren't in Salesforce yet. The rep pastes or dictates what happened; Scribe does the 10–15 minutes of post-call data entry that reps otherwise skip or half-do.

Every change Scribe ever makes is written to a dedicated **audit trail**, reviewable through its own app, tabs, LWCs, and list views. Nothing Scribe does is invisible.

---

## Table of contents

- [Why Scribe](#why-scribe)
- [Design goals](#design-goals)
- [The three surfaces](#the-three-surfaces)
- [Architecture — data flow](#architecture--data-flow)
- [The five agent topics](#the-five-agent-topics)
- [Data model](#data-model)
- [Component inventory](#component-inventory)
- [Guardrails & safety](#guardrails--safety)
- [Install & deploy](#install--deploy)
- [Configuration reference](#configuration-reference)
- [Testing](#testing)
- [Project structure](#project-structure)
- [Status & known environment notes](#status--known-environment-notes)
- [License](#license)

---

## Why Scribe

Reps hate post-call admin, so it rots: Opportunity fields go stale, verbal commitments ("I'll send pricing," "we'll loop in their CFO") never become Tasks and quietly get forgotten, new stakeholders mentioned in passing never get added as Contacts, and deal notes live in the rep's head instead of the record.

None of that is laziness — turning a conversation into structured CRM fields is tedious work that adds value to the *org's data*, not to the rep. Scribe's job is to make "give me a two-sentence recap" produce the same CRM outcome as a rep spending fifteen minutes doing it by hand, and to make every automated change fully visible afterward.

## Design goals

| Goal | How Scribe honors it |
|------|----------------------|
| **Never invent data** | Every field update, task, or contact traces to something literally in the recap. The deterministic extraction engine (`Scribe_ExtractionService`) is the *only* place text is interpreted, and it flags `lowConfidence` instead of guessing. |
| **Confirm before writing** | Opportunity updates and new Contacts use a two-phase **propose → apply** flow; the agent only calls the `apply` action after the rep explicitly says yes. The two risky actions also carry `require_user_confirmation`. |
| **One extraction, many outputs** | The recap is parsed **once** by *Log This Call* and cached on `Scribe_Call_Log__c.Extraction_JSON__c`. Every other topic reuses that single parse via the call-log id — no re-pasting, no inconsistent re-parsing. |
| **No new habits** | Extraction works on bullets, stream-of-consciousness paragraphs, or a pasted transcript. No required format. |
| **Fit the deal cycle** | *Flag Missing Info* compares the deal against per-stage requirements and creates reminder tasks for what's still missing — actively catching deal risk, not just recording history. |
| **Full transparency** | Every write — no exceptions — funnels through `Scribe_ChangeLogService` and produces a `Scribe_Change_Log__c` row with before/after values and a link back to the source recap. |

## The three surfaces

1. **The employee agent (conversational)** — `Scribe_Agent`, an Agentforce `AiAuthoringBundle` with five topics. The rep talks to it; it does the CRM work.
2. **The automation engine (headless)** — five autolaunched Flows, each wrapping an invocable Apex action that performs the write *and* logs the audit row as its final step.
3. **The Scribe app (review & audit)** — a Lightning app where reps and admins see everything Scribe has ever done, by object, rep, date, or change type.

## Architecture — data flow

```
Rep recap ──▶ Scribe agent (Agentforce)
                     │
                     ▼
        Scribe_ExtractionService  ── one structured parse ──▶ cached on Scribe_Call_Log__c
                     │
   ┌─────────────┬───┴────────┬──────────────┬─────────────────┐
   ▼             ▼            ▼              ▼                 ▼
 Log call   Update Opp   Create Tasks   Flag gaps      Detect Contacts
 (additive) (confirm)    (additive)     (additive)     (confirm)
   │             │            │              │                 │
   └─────────────┴────────────┴──────────────┴─────────────────┘
                     │
                     ▼
             Scribe_Change_Log__c   ← every action writes exactly one audit row
```

The change log is the single source of truth for "everything Scribe has ever done," independent of whether someone views it via the app, a list view, or the record-page badge.

## The five agent topics

| # | Topic | Risk | What it does |
|---|-------|------|--------------|
| 1 | **Log This Call** | Additive | Extracts stage-relevant facts, objections, and sentiment; logs a `Scribe_Call_Log__c`; caches the one parse every other topic reuses. |
| 2 | **Update Opportunity** | **Confirm** | Proposes Stage / Close Date / Amount / Next Step changes field-by-field; writes only after explicit confirmation; audits each field with before/after. |
| 3 | **Create Follow-Up Tasks** | Additive | Turns each commitment ("I'll…", "we will…") into a Task with an inferred owner and due date. |
| 4 | **Flag Missing Info** | Additive | Compares the deal (this recap + all prior call logs) against `Scribe_Stage_Requirement__mdt` for the current stage and creates reminder Tasks for the gaps. |
| 5 | **Multi-Contact Detection** | **Confirm** | Drafts Contacts for stakeholders mentioned but not yet on the deal; creates them (linked via OpportunityContactRole) only after confirmation. |

## Data model

**Custom objects**

- **`Scribe_Call_Log__c`** — the raw recap/transcript, a link to the Opportunity, extracted sentiment/objections, and `Extraction_JSON__c` (the cached single parse). The source every change-log row traces back to.
- **`Scribe_Change_Log__c`** — one row per action Scribe takes. `Change_Type__c` (Call Logged / Field Update / Task Created / Stage Gap Task / Contact Created), `Related_Record_Id__c` + `Object_API_Name__c`, `Field_Name__c` / `Old_Value__c` / `New_Value__c` (field updates only), `Source_Call_Log__c`, and `Created_By_Rep__c` (the human behind the conversation, distinct from the running user).

**Custom metadata**

- **`Scribe_Stage_Requirement__mdt`** — what "complete" means per Opportunity stage (economic buyer, budget, timeline, …), with detection keywords. Tunable per sales process **without a code change**. Ships seeded for Qualification, Needs Analysis, Value Proposition, Proposal/Price Quote, and Negotiation/Review.

**Standard-object additions**

- `Task.Scribe_Generated__c`, `Contact.Scribe_Generated__c` — mark agent-created records so the "Created by Scribe" list views are trivially reliable (more robust than filtering on the integration user's `CreatedById`, and deployable without knowing that user's Id).
- `Task.Scribe_Source_Call_Log__c`, `Contact.Scribe_Source_Call_Log__c` — trace each generated record back to its recap.

## Component inventory

| Type | Components |
|------|-----------|
| **Agent** | `Scribe_Agent` (AiAuthoringBundle, 5 topics) |
| **Apex — core** | `Scribe_ExtractionService`, `Scribe_CallParse`, `Scribe_ChangeLogService`, `Scribe_Constants`, `Scribe_Util` |
| **Apex — invocables** | `Scribe_LogCallInvocable`, `Scribe_UpdateOpportunityInvocable`, `Scribe_CreateTasksInvocable`, `Scribe_CheckStageRequirementsInvocable`, `Scribe_DetectNewContactsInvocable` |
| **Apex — controllers** | `Scribe_ChangeLogConsoleController`, `Scribe_HomeDashboardController` |
| **Apex — tests** | `Scribe_ExtractionService_Test`, `Scribe_Invocables_Test`, `Scribe_Controllers_Test`, `Scribe_TestUtil` |
| **Flows** | `Scribe_Log_Call`, `Scribe_Update_Opportunity`, `Scribe_Create_Followup_Tasks`, `Scribe_Check_Stage_Requirements`, `Scribe_Detect_New_Contacts` |
| **LWCs** | `scribeChangeLogConsole`, `scribeHomeDashboard`, `scribeRecordHistoryBadge` |
| **App / tabs** | `Scribe` app; tabs: Scribe Home, Change Log, Change Log records, Call Logs (+ standard Task/Contact) |
| **List views** | Task & Contact "Created by Scribe"; Change Log "This Week / By Object / Field Updates Only" |
| **Permission sets** | `Scribe_Agent_User` (write, for the running/integration user), `Scribe_Reviewer` (read-only review access) |

## Guardrails & safety

- **Confirmation** is enforced two ways: the propose→apply action split (the agent only calls `apply` after an explicit yes) *and* `require_user_confirmation: True` on the two write actions.
- **Graceful degradation**: when a recap is too vague, `Scribe_ExtractionService` returns `lowConfidence` and the agent asks the rep to clarify rather than writing a low-confidence value.
- **The audit row is mandatory, not configurable.** Every write path calls `Scribe_ChangeLogService`; there is no code path that writes without auditing.
- Apex runs `with sharing`; controllers are read-only and use bound variables (no SOQL injection).

## Install & deploy

Requires an **Agentforce-enabled** org for the agent bundle. The data model, Apex, Flows, app, and LWCs deploy to any org.

```bash
# 1. Set your target org
sf config set target-org <alias>

# 2. Deploy everything
sf project deploy start --source-dir force-app

# 3. Assign permission sets
sf org assign permset --name Scribe_Agent_User      # running/integration user
sf org assign permset --name Scribe_Reviewer        # reps & managers who review

# 4. Validate, publish and activate the agent (Agentforce org)
sf agent validate authoring-bundle --api-name Scribe_Agent
sf agent publish  authoring-bundle --api-name Scribe_Agent
sf agent activate --api-name Scribe_Agent
```

Then add the **Scribe Record History** badge to the Opportunity Lightning record page in App Builder, and (optionally) set "Created by Scribe" as the default list view on the Tasks and Contacts tabs inside the Scribe app.

## Configuration reference

Tune **Flag Missing Info** entirely through `Scribe_Stage_Requirement__mdt` — no code change:

| Field | Purpose |
|-------|---------|
| `Stage_Name__c` | The Opportunity `StageName` this requirement applies to. |
| `Requirement_Key__c` / `Requirement_Label__c` | Machine key + human label (used in task subjects). |
| `Detection_Keywords__c` | Comma-separated, case-insensitive phrases. If any appears across the deal's recaps, the requirement is "covered." |
| `Reminder_Task_Subject__c` / `Reminder_Due_In_Days__c` | Subject and due window for the gap reminder Task. |
| `Sort_Order__c` / `Is_Active__c` | Ordering and on/off. |

## Testing

Apex tests cover the extraction engine, all five invocables (including propose→apply, dedup, and bad-input paths), both controllers, and the utilities:

```bash
sf apex run test --tests Scribe_ExtractionService_Test --tests Scribe_Invocables_Test \
                 --tests Scribe_Controllers_Test --result-format human --code-coverage
```

Static analysis (SLDS/ESLint) is clean:

```bash
sf code-analyzer run --target force-app
```

## Project structure

```
force-app/main/default/
├── aiAuthoringBundles/Scribe_Agent/   # the employee agent (5 topics)
├── applications/                       # Scribe Lightning app
├── classes/                            # extraction, invocables, controllers, tests
├── customMetadata/                     # seeded stage requirements
├── flexipages/                         # Scribe Home, Change Log app pages
├── flows/                              # 5 autolaunched action flows
├── lwc/                                # console, dashboard, record badge
├── objects/                            # Call Log, Change Log, Stage Requirement + Task/Contact fields
├── permissionsets/                     # Agent User, Reviewer
└── tabs/                               # Scribe Home, Change Log, Call Logs
```

## Status & known environment notes

**Deployed and verified** to a Developer Edition org (`imperialealex@gmail.com`): all objects, the stage-requirement type **and its 13 seed records**, 16 Apex classes, 5 Flows, 3 LWCs, 2 flexipages, 4 tabs, the Scribe app, both permission sets (assigned), and the `Scribe_Agent` AiAuthoringBundle. **All 20 Apex tests pass at 94% coverage of the exercised classes.**

Two org-specific deployment notes, already handled in this repo:

- **Task fields live on `Activity`.** `Scribe_Generated__c` and `Scribe_Source_Call_Log__c` are defined under `objects/Activity/` (Task is a sub-type of Activity, so a field placed directly on Task is rejected). They still surface on Task as `Task.Scribe_Generated__c` etc.
- **Seed CMT records deploy via the Apex Metadata API.** This org returns an `UNKNOWN_EXCEPTION` gack when deploying custom-metadata *records* through the Metadata API (reproducible even with a single minimal record — an org/platform issue, not the files). The 13 rows were loaded with `Metadata.Operations.enqueueDeployment` instead; on a healthy org `sf project deploy start` handles them normally.

Remaining, environment-limited:

- **Apex PMD/SFGE static analysis** was not run here because no Java runtime is installed (`sf code-analyzer` PMD/SFGE engines require Java 11). SLDS/ESLint analysis passes. Run `sf code-analyzer run --target force-app` on a machine with Java to exercise the Apex engines.
- **Agent publish/activate:** the bundle deploys cleanly, but `sf agent validate`/`preview` (the `afscript/v2/parseandcompile` reasoner endpoint) returned 422 across every available org — a service-side issue independent of the bundle. Re-run `sf agent validate authoring-bundle --api-name Scribe_Agent` when that service is reachable, then `sf agent publish` / `sf agent activate`.

## License

MIT — see [LICENSE](LICENSE).
