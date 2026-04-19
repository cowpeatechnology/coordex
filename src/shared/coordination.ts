import type { CoordexPlanFeature, CoordexProject, CoordexProjectBoard } from "./types.js";

export function buildFeatureDispatchMessage(
  project: CoordexProject | null,
  plan: CoordexProjectBoard["activePlan"] | null,
  feature: CoordexPlanFeature
): string {
  const ownerRole = feature.ownerRole || "unassigned";
  const normalizedOwnerRole = ownerRole.trim().toLowerCase();
  const isSupervisorOwned = normalizedOwnerRole === "supervisor";
  const replyTargetRole = isSupervisorOwned ? "human" : "supervisor";
  const replyKind = isSupervisorOwned ? "decision" : "result";
  const replyStatus = isSupervisorOwned ? "done" : "answered";
  const responseRules = isSupervisorOwned
    ? [
        "- Because this subfunction is owned by supervisor, do not send a self-report back to supervisor.",
        "- Complete any required plan or ledger updates before replying.",
        '- If the subfunction is complete, reply with `kind: "decision"`, `status: "done"`, and `to_role: "human"`.',
        '- If the subfunction cannot continue, reply with `kind: "blocker"`, `status: "blocked"`, and `to_role: "human"`.'
      ]
    : [
        '- If another role is needed, use `kind: "handoff"` or `kind: "blocker"` instead of silently expanding scope.',
        "- Keep strings concise and put paths or checks into `artifacts` and `validation`."
      ];

  return [
    `[Coordex Structured Dispatch]`,
    "",
    `project: ${project?.name ?? "Unknown project"}`,
    `goal: ${plan?.goal || "No current goal recorded."}`,
    `task_id: ${feature.id}`,
    `subfunction: ${feature.title || "Untitled subfunction"}`,
    `owner_role: ${ownerRole}`,
    "",
    `input`,
    `${feature.description || "Implement this subfunction within your role scope and report back with concrete evidence."}`,
    "",
    "Reply with exactly one JSON object, no markdown fences, and no prose before or after it.",
    "Use protocol_version `coordex-agent-io.v1` and keep field names exactly as shown below.",
    "",
    "{",
    '  "protocol_version": "coordex-agent-io.v1",',
    `  "task_id": "${feature.id}",`,
    `  "from_role": "${ownerRole}",`,
    `  "to_role": "${replyTargetRole}",`,
    `  "kind": "${replyKind}",`,
    `  "status": "${replyStatus}",`,
    '  "summary": "one-line outcome",',
    '  "input": "what you were asked to do",',
    '  "expected_output": "what done looks like",',
    '  "output": "what you actually produced",',
    '  "artifacts": [],',
    '  "validation": [],',
    '  "blockers": [],',
    '  "next_role_request": null',
    "}",
    "",
    "Allowed enums:",
    "- kind: dispatch | question | blocker | handoff | result | decision",
    "- status: open | answered | blocked | done",
    "",
    "Rules:",
    "- Keep coordination inside this subfunction's scope.",
    ...responseRules
  ].join("\n");
}
