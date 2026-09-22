# claude-horizon-animation

An agent skill, `horizon-reel`, that makes short launch videos in the collage style of Claude's model-launch films. Each shot cuts to a new dome-shaped horizon: a museum plate, a lace veil, a microscope slide, a chalk drawing, the edge of the Earth. A line of serif copy rides the curve, and the reel ends on your brand lockup over a rising planet limb.

![Example: a day 0 reel for Claude Opus 5.5 on LiteLLM](docs/preview.gif)

The images are real public-domain and CC0 files from the Met, the Art Institute of Chicago, NASA and Wikimedia Commons, downloaded with their credits logged. The drawn shots are procedural canvas. No image or video model is involved, and every render of a film is identical.

## Install

With the [skills CLI](https://github.com/vercel-labs/skills), for Claude Code, Codex or any other supported agent:

```bash
npx skills add misbahsy/claude-horizon-animation
```

Add `-g` to install for your user rather than the current project, and `-a claude-code` or `-a codex` to pick the agent without prompts.

As a Claude Code plugin:

```
/plugin marketplace add misbahsy/claude-horizon-animation
/plugin install horizon-reel@claude-horizon-animation
```

From a clone, for Claude Code and Codex together:

```bash
git clone https://github.com/misbahsy/claude-horizon-animation
cd claude-horizon-animation && ./install.sh
```

Needs Node 18+, `ffmpeg` and `curl`. On first use the skill runs `scripts/setup.mjs`, which installs `playwright-core` into the skill folder, downloads Chromium if none is present (about 95MB, once) and renders a two-second smoke test.

## Use

Ask your agent for it in plain words:

> Make a 10 second launch reel for our v2.0 release, in the Claude launch video style. Copy: "v2.0" / "is out" / "today". End on our logo, media/logo.png.

The agent writes the copy, sources and picks images, drafts `film.json`, checks a stills sheet, then renders an MP4, a GIF under GitHub's 10MB limit, and a credits file for every photograph used. The same steps by hand, from `skills/horizon-reel`:

```bash
node scripts/source.mjs ~/reel/media --from met --q "plate" --medium Ceramics --n 6
node scripts/sheet.mjs ~/reel/media ~/reel/candidates.png
node scripts/render.mjs ~/reel/film.json ~/reel/stills.png --stills
node scripts/render.mjs ~/reel/film.json ~/reel/reel.mp4 --gif --audio track.m4a --audio-start 9.7
```

`skills/horizon-reel/examples/opus-5-5/` holds the film in the preview. `bash source.sh` in a copy of that folder fetches its images, and `SKILL.md` and `references/` document the film format.

## Rights

- **Photographs:** only public domain and CC0 files are downloaded, and `reel.credits.md` lists each one with its source page. The preview's credits are in [docs/preview.credits.md](docs/preview.credits.md).
- **Fonts:** Source Serif 4, Newsreader and Geist, all under the SIL Open Font License, with each licence bundled beside its font.
- **Music:** bring your own. Don't reuse the soundtrack from someone else's launch film.

Not affiliated with or endorsed by Anthropic. The skill borrows the structure of their launch films, not their footage, music or marks.
