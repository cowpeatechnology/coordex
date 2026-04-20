# Cocos Creator Workflow

Use this document when an assigned task depends on Cocos Creator editor behavior, engine settings, or editor-driven asset and scene changes.

## Default Assumptions

- Confirm the real Cocos Creator version and target platform from project docs before making editor-specific decisions.
- Prefer documented editor workflows over runtime-code workarounds when the engine already exposes the required control path.
- If a task depends on editor state you cannot verify, escalate to the human or supervisor instead of guessing.

## Validation Rules

- Use the dedicated browser workflow for any browser preview or debug surface related to this project.
- Reuse existing dedicated-browser tabs whenever the needed preview is already open.
- If tooling cannot reach the required editor or preview surface, say so explicitly in the handoff.

## Handoff Expectations

- Name the scene, prefab, asset, or configuration files touched.
- State which part was changed in editor-facing terms, not only raw code terms.
- Report the validation path and any remaining editor-only follow-up.
