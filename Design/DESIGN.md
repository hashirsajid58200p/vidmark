---
name: VidMark
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#393939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#bbc9cf'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#859399'
  outline-variant: '#3c494e'
  surface-tint: '#4cd6ff'
  primary: '#a4e6ff'
  on-primary: '#003543'
  primary-container: '#00d1ff'
  on-primary-container: '#00566a'
  inverse-primary: '#00677f'
  secondary: '#c8c6c5'
  on-secondary: '#303030'
  secondary-container: '#474746'
  on-secondary-container: '#b7b5b4'
  tertiary: '#ffd59c'
  on-tertiary: '#442b00'
  tertiary-container: '#feb127'
  on-tertiary-container: '#6b4700'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#b7eaff'
  primary-fixed-dim: '#4cd6ff'
  on-primary-fixed: '#001f28'
  on-primary-fixed-variant: '#004e60'
  secondary-fixed: '#e5e2e1'
  secondary-fixed-dim: '#c8c6c5'
  on-secondary-fixed: '#1b1b1c'
  on-secondary-fixed-variant: '#474746'
  tertiary-fixed: '#ffddb1'
  tertiary-fixed-dim: '#ffba49'
  on-tertiary-fixed: '#291800'
  on-tertiary-fixed-variant: '#624000'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 28px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  container-padding: 16px
  gutter: 12px
---

## Brand & Style
The design system for this product centers on a "Technical Minimalism" aesthetic, optimized for high-performance video bookmarking. It targets power users, creators, and researchers who require a tool that feels integrated into the browser yet distinct enough to manage complex media libraries.

The visual narrative combines a deep, immersive **Dark Mode** foundation with **Glassmorphism** to create a sense of depth and focus. The emotional response is one of precision, efficiency, and modern utility. By utilizing subtle translucency and vibrant cyan accents, the UI guides the user's eye toward critical actions without cluttering the viewing experience.

## Colors
The palette is engineered for a low-eye-strain environment, essential for users interacting with video content.

- **Primary (#00D1FF):** An electric cyan used exclusively for primary calls to action, active states, and playhead indicators. It provides high contrast against the dark base.
- **Surface Layer 1 (#121212):** The core background color. Deep charcoal that provides a true dark-mode experience.
- **Surface Layer 2 (#1E1E1E):** The primary container color. Used for cards and sidebars to create a subtle separation from the background.
- **Accents:** Use white for primary labels and a muted grey (#A0A0A0) for metadata and secondary information to maintain visual hierarchy.

## Typography
This design system utilizes **Inter** for its exceptional legibility in small-scale browser environments. The typographic scale is tight and functional.

- **Headlines:** Use Bold weights with slight negative letter-spacing to give a modern, compact feel.
- **Body Text:** Use Regular weight for high readability. 
- **Labels:** Small labels for timestamps or tags use SemiBold weight and uppercase styling to distinguish technical metadata from user-generated content.
- **Scalability:** For the extension popup, prioritize `body-md` and `label-sm` to maximize information density.

## Layout & Spacing
The layout follows a strict **4px baseline grid** to ensure geometric alignment across the extension and dashboard.

- **Extension Popup:** Uses a fixed-width layout (360px to 400px) with 16px safe margins.
- **Dashboard:** Uses a fluid grid system. Components are organized into a masonry or standard grid with 12px gutters.
- **Rhythm:** Vertical spacing between cards should be consistent at 16px (`md`), while internal card padding should be 12px to keep elements tight and cohesive.

## Elevation & Depth
Depth is communicated through **Tonal Layering** and **Glassmorphism**, rather than traditional heavy shadows.

- **Level 0 (Background):** Deep Charcoal (#121212).
- **Level 1 (Cards/Panels):** Dark Grey (#1E1E1E) with a subtle 1px border (#FFFFFF 10% opacity).
- **Level 2 (Overlays/Modals):** Glassmorphism effect. Background blur of 12px-16px with a 60% opacity fill of the Surface Layer 2.
- **Shadows:** Use a single, highly diffused "Ambient Glow" for the active primary button: `0px 4px 20px rgba(0, 209, 255, 0.3)`.

## Shapes
The shape language is geometric and friendly. 

- **Standard Radius:** 8px (`0.5rem`) for standard buttons and input fields.
- **Large Radius:** 16px (`1rem`) for video thumbnail cards and main container sections.
- **Icons:** Use a consistent 2px stroke weight for all icons to match the technical precision of the typography.

## Components
- **Buttons:** 
  - *Primary:* Cyan fill, black text, 8px radius.
  - *Ghost:* No fill, 1px cyan border, cyan text.
- **Cards:** Use a 16px radius. Video thumbnails should have a 0.5s hover transition that increases the border-opacity from 10% to 40%. Include a "Play" icon overlay on hover.
- **Inputs:** Dark grey fill (#1E1E1E), 8px radius, cyan bottom-border (2px) on focus.
- **Chips/Tags:** Used for categorizing bookmarks. 4px radius, subtle cyan tint background (10% opacity) with cyan text at `label-sm`.
- **Lists:** Clean dividers using 1px lines at 5% white opacity. High-density padding (8px top/bottom).
- **Scrollbars:** Custom slim-line scrollbars in muted grey to avoid visual clutter in the extension view.