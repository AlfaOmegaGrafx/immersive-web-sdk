# MSE in the Vibe-Coding Workflow

This is how MSE — our scene composition tool — fits into the developer journey when someone is "vibe-coding" an XR app with an AI agent.

## The setup

A developer runs `pnpm create @iw-sdk/create`, picks a few options, and gets a ready-to-go IWSDK app folder. MSE is already wired in — same as the dev server or test runner. Nothing to install, nothing to configure.

The developer then opens Claude Code (or another AI coding tool) inside that folder. From this moment on, the agent already knows MSE exists and how to use it.

## What MSE is, in one paragraph

MSE is a scene composition tool with **two faces over the same scene**: a **silent interface** the agent uses in the background, and a **visual editor** the developer can open in a browser tab whenever they want to look or interact directly. Both faces see the same scene in real time. Every change — whether the agent made it or the developer dragged something — flows automatically into the running app, with no rebuild and no restart.

## How it gets used

**Scenario 1 — Agent does everything.** The developer says "build me a classroom." The agent assembles the scene through MSE's silent interface — desks, chalkboard, lighting — saves it, and the running app picks up the change instantly. The agent screenshots its own work and iterates until the scene looks right. The developer never opens the visual editor. *This is the headline scenario — the closed-loop, hands-off workflow we're building toward.*

**Scenario 2 — Agent baseline, human refines.** The agent assembles a reasonable first pass, but the chalkboard is slightly off and the lighting's wrong. The developer opens the visual editor in a browser tab and tunes by hand — or asks the agent to keep tuning while watching the result live. Both can edit at the same time. The running app reflects every change. *Vibe-coding becomes vibe-directing: the developer steers, the agent executes, the visual editor is their shared canvas.*

**Scenario 3 — Human only.** The developer opens the visual editor directly and composes a scene by hand — importing models, arranging them, saving. *This is what MSE supports today, and it continues to work. Scenarios 1 and 2 are the new ground.*

## Why this matters

- **The agent stops faking it.** Today, the agent composes scenes by writing throwaway code, reloading the app, flying the VR camera around, and screenshotting — every iteration. MSE turns scene composition into a first-class tool the agent can drive directly. Iterations go from minutes to seconds.
- **The developer always sees the truth.** What the editor shows matches what the running app shows, because they share a renderer and a live scene file.
- **Agent and human hand off fluidly.** Same scene, same tool, two ways in. No export step, no format conversion, no "let me regenerate that for you."
