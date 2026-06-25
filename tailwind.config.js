/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./*.html",
    "./Design/*.html",
    "./*.js"
  ],
  theme: {
    extend: {
      colors: {
        "tertiary-fixed-dim": "#ffba49",
        "surface-container-low": "var(--color-surface-container-low)",
        "inverse-primary": "#00677f",
        "on-primary-fixed": "#001f28",
        "on-secondary": "#303030",
        "primary-fixed": "#b7eaff",
        "on-error-container": "#ffdad6",
        "inverse-surface": "#e5e2e1",
        "tertiary-container": "#feb127",
        "outline": "#859399",
        "secondary": "#c8c6c5",
        "primary-container": "rgb(var(--color-primary-container-rgb, 0 209 255) / <alpha-value>)",
        "error": "#ffb4ab",
        "primary": "rgb(var(--color-primary-rgb, 164 230 255) / <alpha-value>)",
        "on-primary-container": "rgb(var(--color-on-primary-container-rgb, 0 86 106) / <alpha-value>)",
        "on-tertiary-fixed-variant": "#624000",
        "secondary-fixed": "#e5e2e1",
        "inverse-on-surface": "#313030",
        "surface-container-lowest": "var(--color-surface-container-lowest)",
        "surface-dim": "#131313",
        "surface-container-highest": "var(--color-surface-container-highest)",
        "on-tertiary-fixed": "#291800",
        "on-secondary-fixed": "#1b1b1c",
        "on-surface": "var(--color-on-surface)",
        "surface-container": "var(--color-surface-container)",
        "on-tertiary": "#442b00",
        "primary-fixed-dim": "rgb(var(--color-primary-fixed-dim-rgb, 76 214 255) / <alpha-value>)",
        "surface": "var(--color-surface)",
        "tertiary-fixed": "#ffddb1",
        "surface-bright": "#393939",
        "secondary-fixed-dim": "#c8c6c5",
        "on-error": "#690005",
        "on-secondary-container": "#b7b5b4",
        "secondary-container": "#474746",
        "outline-variant": "var(--color-outline-variant)",
        "on-surface-variant": "var(--color-on-surface-variant)",
        "tertiary": "#ffd59c",
        "on-background": "var(--color-on-background)",
        "surface-container-high": "var(--color-surface-container-high)",
        "error-container": "#93000a",
        "surface-tint": "rgb(var(--color-primary-fixed-dim-rgb, 76 214 255) / <alpha-value>)",
        "on-primary-fixed-variant": "#004e60",
        "on-primary": "rgb(var(--color-on-primary-rgb, 0 53 67) / <alpha-value>)",
        "on-secondary-fixed-variant": "#474746",
        "background": "var(--color-background)",
        "surface-variant": "var(--color-surface-variant)",
        "on-tertiary-container": "#6b4700"
      },
      borderRadius: {
        "DEFAULT": "0.25rem",
        "lg": "0.5rem",
        "xl": "0.75rem",
        "full": "9999px"
      },
      spacing: {
        "xs": "4px",
        "unit": "4px",
        "md": "16px",
        "container-padding": "16px",
        "lg": "24px",
        "sm": "8px",
        "gutter": "12px",
        "xl": "32px"
      },
      fontFamily: {
        "headline-lg-mobile": ["Inter"],
        "headline-lg": ["Inter"],
        "headline-md": ["Inter"],
        "body-lg": ["Inter"],
        "label-sm": ["Inter"],
        "body-md": ["Inter"]
      },
      fontSize: {
        "headline-lg-mobile": ["20px", { "lineHeight": "28px", "fontWeight": "700" }],
        "headline-lg": ["24px", { "lineHeight": "32px", "letterSpacing": "-0.02em", "fontWeight": "700" }],
        "headline-md": ["20px", { "lineHeight": "28px", "letterSpacing": "-0.01em", "fontWeight": "600" }],
        "body-lg": ["16px", { "lineHeight": "24px", "fontWeight": "400" }],
        "label-sm": ["12px", { "lineHeight": "16px", "letterSpacing": "0.05em", "fontWeight": "600" }],
        "body-md": ["14px", { "lineHeight": "20px", "fontWeight": "400" }]
      }
    }
  },
  plugins: [
    require('@tailwindcss/forms')
  ]
}
