// Design tokens. New UI should pull from here instead of hard-coding values

export const colors = {
  // Surfaces, from the screen background up
  background: "#141517",
  surface: "#1E1F22",
  surfaceRaised: "#2D2E30",
  surfaceHigh: "#363636",
  border: "#3A3B3E",

  // Text
  text: "#FFFFFF",
  textSecondary: "#9D9D9D",
  textMuted: "#797B7A",
  textDisabled: "#777777",

  // Brand
  accent: "#FFD33D",
  onAccent: "#000000",
  accentDeep: "#8A6A00",

  // Status
  danger: "#FF4A4A",
  dangerStrong: "#C62828",
  success: "#2E7D32",
  // A recipe saved in the cloud
  cloud: "#FF9F1C",

  overlay: "rgba(0, 0, 0, 0.75)",
  shadow: "#000000",
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 24,
  xl: 30,
  full: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const fonts = {
  regular: "Default",
  bold: "DefaultBold",
  code: "Code",
} as const;

export const shadows = {
  floating: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 12,
  },
} as const;
