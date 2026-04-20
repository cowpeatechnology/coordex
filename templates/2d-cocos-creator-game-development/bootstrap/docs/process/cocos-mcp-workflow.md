# Cocos Creator Workflow

Use this document when an assigned task depends on Cocos Creator editor behavior, engine settings, or editor-driven asset and scene changes.

## Default Assumptions

- Confirm the real Cocos Creator version and target platform from project docs before making editor-specific decisions.
- Prefer built-in editor workflows, built-in components, and project settings over custom runtime workarounds when the engine already provides the required control path.
- Prefer documented editor workflows over runtime-code workarounds when the engine already exposes the required control path.
- If a task depends on editor state you cannot verify, escalate to the human or supervisor instead of guessing.

## Configuration-First Order

1. Read official docs first
   - Freeze the external contract from the Cocos manual and the target platform docs before proposing changes that depend on orientation, safe area, build output, or editor-owned properties.

2. Treat editor and config as the primary control surface
   - Design resolution, build orientation, camera visibility, canvas-camera binding, node layer, and component properties are editor/config problems first, not runtime-code problems first.

3. Ask for human assist before a code fallback
   - If the correct editor control exists but the current MCP surface cannot read or modify it reliably, ask the human to perform that step before dropping to file edits or workaround code.

4. Prefer the simplest validation path
   - Reuse the existing preview tab, built-in debug surfaces, bounded logs, and simple observation adjustments before inventing new runtime adapters only to inspect layout.

5. Record why a fallback was needed
   - If file edits or runtime code still become necessary, explain why the official path, editor path, and human-assist path were not enough.

## Local Preview Constraints

- Use the dedicated browser workflow for any browser preview or debug surface related to this project.
- Reuse existing dedicated-browser tabs whenever the needed preview is already open.
- A local browser preview is not the real mini-game container. If the result depends on platform-only APIs or runtime behavior, mark the evidence as environment-limited instead of pretending the browser fully proved it.
- After scene, component, or script changes, save the current scene and wait briefly before judging whether the preview has refreshed.
- If MCP becomes unavailable or clearly unstable, stop guessing and ask the human to restart it.
- If external file edits are not reflected in preview, prefer the documented reimport, refresh, or scene-reload path before assuming the gameplay logic is wrong or opening duplicate preview tabs.

## Asset Boundary Rule

- Keep generator scripts, pipeline specs, preview sheets, and other tool artifacts outside the runtime Cocos `assets/` tree unless the shipped game actually loads them.
- Only final integration-ready runtime assets should live in engine-owned asset paths.

## Handoff Expectations

- Name the scene, prefab, asset, or configuration files touched.
- State whether the change was editor/config, runtime code, or asset-pipeline work.
- State which part was changed in editor-facing terms, not only raw code terms.
- Report the validation path and any remaining editor-only follow-up.
