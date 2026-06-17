# Channel Playbook

Use this reference when turning one source into multiple channel drafts.

## Channel Shapes

| Channel | Best Use | Draft Shape |
| --- | --- | --- |
| `blog` | Canonical long-form source or refreshed post | SEO title, meta description, outline, intro, sections, conclusion, CTA |
| `xiaohongshu` | Personal insight, tutorial, checklist, product story | 2-4 title options, hook, short paragraphs, bullets, carousel/image brief, hashtags |
| `wechat` | Thoughtful Chinese long-form or semi-formal announcement | Headline, opening scene, core argument, sections, soft CTA |
| `newsletter` | Relationship-driven update to subscribers | Subject lines, preview text, personal opening, main body, links/CTA |
| `linkedin` | Professional insight, lessons, founder/product narrative | Hook, context, 3-5 lessons, conversational CTA |
| `x` | Short point of view or thread | Single post or 5-8 post thread, each post self-contained |
| `instagram` | Visual-led summary | Caption, carousel slide outline, hashtags |
| `tiktok` | Short video script | Cold open, scene beats, on-screen text, voiceover, CTA |
| `youtube-short` | Short educational video | Hook, 3 beats, visual directions, closing line |

## Xiaohongshu Notes

Prioritize usefulness and felt specificity:

- Title: concrete result, mistake, checklist, comparison, or contrarian lesson.
- Opening: one-sentence reason the reader should care.
- Body: short paragraphs, bullets, practical steps, real examples.
- Carousel brief: 5-8 slide idea if visuals are expected.
- Hashtags: mix broad category, niche intent, and audience identity.

Avoid unsupported medical, financial, legal, or guaranteed-result claims. Avoid fake personal experience if the source does not support it.

## Repurposing Pattern

1. Canonical idea: one sentence that should stay true everywhere.
2. Angle per channel: why this audience cares here.
3. Proof: source quotes, data, examples, screenshots, or product facts.
4. Format: choose the channel shape above.
5. CTA: match reader readiness, from "save this" to "book a call".
6. Risk pass: remove unsupported claims and mark missing facts.

## Batch Item Fields

Use these optional fields for richer drafts:

- `channel`: platform or output type.
- `format`: post, thread, carousel, newsletter, video_script, seo_snippet.
- `title_options`: alternate titles or hooks.
- `hook`: opening line.
- `body`: final editable draft.
- `cta`: call to action.
- `hashtags`: array of hashtags without duplicates.
- `media_brief`: image, carousel, screenshot, or video guidance.
- `source_notes`: facts or source passages used.
- `risk`: terms such as `unsupported_claim`, `needs_link`, `regulated`, `brand_voice`, `missing_media`.
- `export_filename`: preferred output filename.
