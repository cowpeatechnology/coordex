const additionalContext = [
  "Coordex browser validation must use the dedicated Google Chrome instance at browserUrl http://127.0.0.1:9333 with remote-debugging-port 9333 and user-data-dir /tmp/chrome-mcp-dedicated-9333.",
  "Do not treat a generic chrome-devtools MCP auto-connect session or any default Chrome profile path under ~/Library/Application Support/Google/Chrome as valid browser context for this project.",
  "If you cannot confirm attachment to the dedicated 9333 Chrome instance, do not claim browser verification is complete.",
  "Before browser debugging or validation, re-read AGENTS.md and docs/process/dedicated-browser-workflow.md."
].join(" ");

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext
    }
  })
);
