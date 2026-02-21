# Camello Illustration Guide

How to generate consistent camel mascot illustrations for camello.xyz.

## Tool

**Nano Banana Pro** (gemini-3-pro-image-preview) on [Google AI Studio](https://aistudio.google.com)

## Settings (exact)

| Setting | Value |
|---------|-------|
| Model | Nano Banana Pro (`gemini-3-pro-image-preview`) |
| Temperature | `0.4` |
| Aspect ratio | `1:1` |
| Resolution | `1K` |
| Top P | `0.95` |
| Output length | `32768` |

## System Instructions

Paste this into the **System Instructions** field (top-left panel, above the chat area). It persists for the entire session — don't close the tab between generations.

```
You are an illustration studio specializing in mid-century modern graphic
design. Every image you create MUST follow these rules strictly:

STYLE: Mid-century modern UPA animation style crossed with Saul Bass movie
poster design. Paper cut-out collage texture. Flat geometric abstraction.

CHARACTER: An anthropomorphic camel standing upright. Sand-colored fur.
Confident half-lidded eyes with a slightly smug expression. Simplified
geometric features — no realistic fur texture. Clean silhouette readable
at any size.

RENDERING RULES:
- Thick black outlines on ALL shapes (minimum visible weight)
- Bold flat color fills ONLY — absolutely NO gradients, NO shading, NO
  highlights, NO 3D effects
- Paper cut-out texture with slightly rough edges (not digitally smooth)
- Maximum 4 colors per illustration (always include sand #F4E8D6 and
  charcoal #16161D)
- Solid single-color backgrounds
- No text, no watermarks, no logos in the image

COMPOSITION: Centered subject, generous negative space around the character.
The character should occupy roughly 60-70% of the frame height. Square format.
```

## Reference Image

**`camel-base.jpeg`** — the character reference sheet (3-pose: front, side, 3/4 view). Upload this as an attachment for EVERY role-specific prompt to maintain character consistency.

## Color Palette

| Name | Hex | Usage |
|------|-----|-------|
| Sand | `#F4E8D6` | Camel fur, light backgrounds |
| Charcoal | `#16161D` | Suit, dark backgrounds |
| Teal | `#00897B` | Accent (screens, buttons) |
| Burnt Orange | `#E8613C` | Accent (charts, megaphones, energy) |
| Gold | `#C9A84C` | Accent (data, wisdom, premium) |

Each illustration uses sand + charcoal + 2 accent colors max.

## Workflow

1. Open AI Studio, select Nano Banana Pro
2. Set temperature 0.4, aspect 1:1, resolution 1K
3. Paste system instructions (once per session)
4. Attach `camel-base.jpeg` as reference image
5. Paste the role prompt (see below)
6. If style drifts, append: "Match the exact style of the reference image."
7. Download PNG, name per convention below

## Prompts by Role

### Sales Camel (`camel-sales.png`) — dark bg, hero illustration
```
Using the attached character as reference, generate: The camel mascot
confidently presenting to an invisible audience, one hand gesturing toward
a rising bar chart graphic. Wearing the same black suit. Dynamic pose,
leaning slightly forward. Solid charcoal (#16161D) background. Add burnt
orange (#E8613C) accent color on the chart. Same flat style, thick outlines,
sticker edge. Square format.
```

### Support Camel (`camel-support.png`) — sand bg, features card
```
Using the attached character as reference, generate: The camel mascot
wearing a headset over one ear, sitting at a minimalist geometric desk
with a computer screen shape. One hand raised in a friendly wave. Wearing
black vest instead of full suit jacket. Solid sand (#F4E8D6) background.
Teal (#00897B) accent on the screen. Same flat style, thick outlines,
sticker edge. Square format.
```

### Marketing Camel (`camel-marketing.png`) — sand bg, features card
```
Using the attached character as reference, generate: The camel mascot in
a black turtleneck holding a megaphone in one hand. Surrounded by floating
geometric shapes — speech bubbles, stars, exclamation marks. Creative
energetic pose. Solid sand (#F4E8D6) background. Burnt orange (#E8613C)
accent on the megaphone and shapes. Same flat style, thick outlines,
sticker edge. Square format.
```

### Analytics Camel (`camel-analytics.png`) — sand bg, features card
```
Using the attached character as reference, generate: The camel mascot
wearing round glasses, holding a clipboard, studying a large geometric
bar chart. Slightly hunched forward, studious expression. Same black suit.
Solid sand (#F4E8D6) background. Gold (#C9A84C) accent on the chart bars
and glasses. Same flat style, thick outlines, sticker edge. Square format.
```

### Knowledge Camel (`camel-knowledge.png`) — sand bg, features card
```
Using the attached character as reference, generate: The camel mascot
wearing reading glasses and a black cardigan, surrounded by floating open
books and document shapes. One hand holding a glowing lightbulb. Wise calm
expression. Solid sand (#F4E8D6) background. Burnt orange (#E8613C) and
gold (#C9A84C) accents on the books and lightbulb. Same flat style, thick
outlines, sticker edge. Square format.
```

## Silhouette Variant (Mad Men Energy)

The silhouette style produces dramatic, high-contrast camels — entirely black figure
on a colored background. These work best on hero sections, OG images, pricing
sections, and anywhere you want cinematic punch.

### Single silhouette (square, 1:1)
```
Using the attached character as reference, generate: The camel mascot as a
bold black silhouette — entire figure is solid charcoal (#16161D) with a thin
cream (#FAF5ED) sticker edge outline. No fur color, no facial detail, just a
clean recognizable silhouette shape. [Action/pose]. [Props as silhouette shapes].
Solid [background color] background. Same flat style, thick outlines.
1960s movie title sequence aesthetic. Square format.
```

### Multi-panel banner (wide, 16:9 — for OG images/banners)
```
Using the attached character as reference, generate: A wide banner split
into 4 color-blocked panels side by side, like a comic strip or TV show
title card. Panel 1 (teal #00897B background): the camel in a suit
gesturing confidently. Panel 2 (charcoal #16161D background): the camel
with a headset at a desk. Panel 3 (sand #F4E8D6 background): the camel
with a megaphone. Panel 4 (burnt orange #E8613C background): the camel
with glasses studying a chart. Each panel shows only the camel in a
different pose, silhouette style. No floating icons, no text. Same flat
style, thick outlines, sticker edge. Wide cinematic format. Bold graphic
design like a 1960s movie title sequence.
```

### Silhouette examples by role
```
# Sales silhouette on teal
Using the attached character as reference, generate: The camel mascot as a
bold black silhouette with thin cream sticker edge. Confidently leaning on
a rising bar chart (also silhouette). Solid teal (#00897B) background.
1960s Saul Bass movie poster aesthetic. Square format.

# Support silhouette on charcoal
Using the attached character as reference, generate: The camel mascot as a
bold black silhouette with thin cream sticker edge. Wearing headset, sitting
at a desk with computer screen shape. Solid charcoal (#16161D) background
with teal (#00897B) accent only on the screen. 1960s movie title sequence
aesthetic. Square format.

# Marketing silhouette on burnt orange
Using the attached character as reference, generate: The camel mascot as a
bold black silhouette with thin cream sticker edge. Holding a megaphone,
dynamic pose. Floating speech bubble silhouettes. Solid burnt orange
(#E8613C) background. 1960s Saul Bass movie poster aesthetic. Square format.
```

**Tips for silhouettes:**
- The key phrase is "bold black silhouette — entire figure is solid charcoal"
- Add "thin cream (#FAF5ED) sticker edge outline" to maintain the cut-out feel
- Props should also be silhouettes (not colored) unless you want one accent pop
- These look best on teal, burnt orange, or gold backgrounds (high contrast)
- The 4-panel banner format is the strongest — directly mirrors the PPG intro

## Adding New Characters

To create a new role camel (colored version):

1. Stay in the same session (or re-paste system instructions + re-upload reference)
2. Follow the prompt pattern:
   ```
   Using the attached character as reference, generate: The camel mascot
   [outfit change]. [Action/pose]. [Props]. Solid [background color] background.
   [Accent color] accent on [specific elements]. Same flat style, thick outlines,
   sticker edge. Square format.
   ```
3. Keep to the 4-color max (sand + charcoal + 2 accents)
4. Name: `camel-{role}.jpeg`

## File Naming Convention

```
apps/web/public/illustrations/
├── camel-base.jpeg        # Reference sheet (3-pose)
├── camel-sales.jpeg       # Hero illustration (dark bg)
├── camel-support.jpeg     # Features card
├── camel-marketing.jpeg   # Features card
├── camel-analytics.jpeg   # Features card
├── camel-knowledge.jpeg   # Features card
├── camel-logo.jpeg        # Logomark (square, teal bg)
└── ILLUSTRATION_GUIDE.md  # This file

apps/web/public/
└── og-image.jpeg          # OG metatag preview (16:9, 4-panel)
```

## Style Reference

- **UPA Animation** — flat shapes, geometric figures, bold color fields (1950s)
- **Saul Bass** — limited palette, bold reduction, silhouettes, paper cut-out
- **Powerpuff Girls intro** — color-blocked panels, angular characters
- **Mad Men title sequence** — silhouetted figures, architectural geometry, paper texture

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Model adds gradients/3D | Append: "Strictly flat colors, no shading whatsoever, like a screen-printed poster" |
| Camel looks too realistic | Append: "Abstract geometric simplification, NOT realistic animal anatomy" |
| Colors drift from palette | Re-specify hex codes in the prompt |
| Style inconsistent | Re-upload `camel-base.jpeg` and add: "Match the exact style of the reference image" |
| Session lost | Re-paste system instructions, re-upload reference, set all parameters again |
