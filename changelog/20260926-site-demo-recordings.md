---
title: 2026-09-26 Demo Recordings On The Skill Pages
---

# Demo Recordings On The Skill Pages

Date: 2026-09-26
Author: AI Assistant
AI Agent: Claude

## Request

> 3 可以做视频位，参考 github.com/busabase/templates 的网站

The recordings for `kelly-email`, `kelly-support` and `kelly-homework-coach` were already deployed —
`https://kellychan.im/skills/demo-recordings/…` served the bytes as `video/mp4` — but no page linked to
them. A visitor could only reach one by knowing the URL.

## What Changed

### A poster card at the front of the gallery, and a player on click

Modelled on the Busabase template gallery (`busabase.com/templates/<name>`), which was inspected in a
real browser rather than copied from its source: the recording is one slide among the screenshots,
shown as a poster frame with a play button; **zero `.mp4` requests on page load**; the `<video>`
(`controls autoplay loop muted playsinline`, with the poster) is created only when the card is
clicked, in the site's existing lightbox.

Closing stops playback for real — a detached `<video>` keeps playing until it is garbage-collected, so
`closeLightbox` pauses it and drops its `src` — and returns focus to the card. Backdrop click, the
new × button and Escape all close it; a click on the video itself does not. The card is a `<button>`
with a language-aware `aria-label`, and the dialog carries `role="dialog"`.

Recordings are discovered from `docs/demo-recordings/<skill>/<skill>-<slug>-<zh-CN|en>.mp4`; a poster
is the same name ending `.webp`. The page has no `<video>` element until someone asks for one, and a
skill with two recordings (`kelly-email`) gets two cards. There is only a Chinese cut so far, so the
English page plays it and its caption says "Recorded in Simplified Chinese"; a future `-en.mp4` takes
over without any change here.

### The Pages check now understands recordings

`scripts/check-pages-assets.mjs` only scanned `<img>`, so a recording — referenced from
`data-video-*` — was invisible to it. It now also requires each referenced recording to be present in
the staged site, not an LFS pointer, and **an actual MP4** (an `ftyp` box at byte 4). The last is
stricter than the image rule on purpose: a pointer or an HTML error page served as `video.mp4` does
not 404. The page loads, the poster shows, and the player opens onto a black frame.

### Two hosts, and they are not interchangeable

`media.githubusercontent.com` serves **only** LFS objects — a plain file 404s. `raw.githubusercontent.com`
serves plain files and returns the *pointer text* for an LFS object. The first draft sent the posters
through the media host, as the screenshots are; testing it showed the 404. The videos (LFS) now go
through media and the posters (plain) through raw, in the checked-in docs. `tests/site-recordings.test.mjs`
pins this, including the two facts it silently depends on — `.mp4` is LFS and `.webp` is not.

## Files

- `scripts/build-site.mjs` — recording discovery (a misnamed recording fails the build), the card,
  the player, styles. The regenerated `docs/` (78 skill pages, index) differ only by the shared
  CSS/JS, plus the video card on three pages.
- `scripts/check-pages-assets.mjs`, `tests/pages-assets.test.mjs`, `tests/site-recordings.test.mjs`
- `docs/demo-recordings/**/*.webp` — four posters, 30–48 KB, each at its video's own aspect ratio
  (`kelly-email` is 16:9; the others 16:10)
- `skills/kelly-app-skill-creator/references/demo-recording.md` — the naming and poster convention

## Verification

- `node --test`: `tests/pages-assets.test.mjs` 5/5 (3 new — a staged recording is accepted and counted;
  missing / LFS pointer / not-an-MP4 are each rejected; a GitHub-host recording URL is rejected) and
  `tests/site-recordings.test.mjs` 5/5. Each new guard was **mutation-checked**: pointing the poster
  at the media host, marking posters LFS, and putting a `<video>` in the markup each turn a test red.
- The CI Pages step was replicated locally (`--asset-mode=pages-local`, copy `docs/`, copy screenshots,
  `check-pages-assets.mjs`): `82 HTML files, 629 local images, 4 local videos` OK, no GitHub host left.
- Real Google Chrome (the bundled Chromium has no H.264 decoder and would fail every playback),
  driving the staged site over HTTP: 0 `.mp4` requests on load and no `<video>` element; poster loads;
  click creates the player and it really plays (`currentTime` advancing, `readyState` 4, duration
  49.6 s = `ffprobe`); Escape / backdrop / × close it, remove the element and stop further requests;
  focus returns to the card; Enter opens it from the keyboard; the ordinary screenshot lightbox still
  opens an image, not a video; the English page shows the language note and `aria-label`, and
  `mkSetLang('zh')` swaps both live; `kelly-email` shows its two cards in order; at 390×844 there is no
  horizontal overflow, the poster is the same width as its sibling screenshot cards, and the player
  fits the screen.
- `npm run lint`, `npm run typecheck`.

## Not Covered

- Only Chrome was driven. The player uses only standard `<video>` behaviour, but Safari and Firefox
  were not run.
- The repository-mode URLs (`media.` / `raw.githubusercontent.com` under `main`) can only be exercised
  once the files are on `main`; what was verified beforehand is the host behaviour itself (media 404s a
  plain file, raw returns a pointer for an LFS object) and that the generated URLs follow that split.
  The deployed site does not use them.
