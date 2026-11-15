# Prompt 03 — Build the sky dome on the explore page (short version)

Paste everything below the line into the agent.

---

Read `AGENTS.md` and `docs/03-design/prompts/02-sky-dome.md`, then build the sky dome it describes on the `/explore` page, following that prompt fully.

First, remove the existing placeholder content from the explore page:
- the header "HANOS COSMIC TIME MACHINE · SKY EXPLORER"
- the "RETURN TO LANDING" link
- the text "Ready for sky coordinates. Required test targets: Barnard's Star, Epsilon Indi B, WISE 0855, RW Aurigae, R Draconis."

These override `02-sky-dome.md`: do not add a header, wordmark or link back to the landing page, and do not list the test targets. The dome fills the whole page.

When done, run `npm run lint`, `npm run typecheck` and `npm run build`, check `/explore` in the browser, and report what you verified and what you did not. Do not commit or push.
