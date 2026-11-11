/**
 * Icon set.
 *
 * Inline SVG rather than an icon package: the portal needs about
 * thirty glyphs, and shipping a whole library for that is weight the
 * user pays for. One stroke width, one grid and one join style, so
 * they read as a set.
 */

import type { SVGProps } from "react";

export type IconName =
  | "dashboard"
  | "pages"
  | "text"
  | "programme"
  | "curriculum"
  | "stat"
  | "briefcase"
  | "users"
  | "inbox"
  | "media"
  | "shield"
  | "settings"
  | "history"
  | "search"
  | "plus"
  | "edit"
  | "trash"
  | "check"
  | "close"
  | "chevronLeft"
  | "chevronRight"
  | "chevronDown"
  | "chevronUp"
  | "menu"
  | "logout"
  | "eye"
  | "upload"
  | "download"
  | "external"
  | "globe"
  | "alert"
  | "info"
  | "clock"
  | "calendar"
  | "lock"
  | "unlock"
  | "archive"
  | "copy"
  | "mail"
  | "note"
  | "verified"
  | "database"
  | "image"
  | "video"
  | "file"
  | "refresh";

/** Path data only; the wrapper supplies the shared stroke attributes. */
const PATHS: Record<IconName, string> = {
  dashboard: "M3 3h7v7H3zM14 3h7v4h-7zM14 11h7v10h-7zM3 14h7v7H3z",
  pages: "M5 3h9l5 5v13H5zM14 3v5h5",
  text: "M4 6h16M4 12h16M4 18h10",
  programme: "M3 5l9-2 9 2v10l-9 2-9-2zM12 3v14",
  curriculum: "M4 5h16M4 10h16M4 15h10M4 20h6",
  stat: "M4 20V10M10 20V4M16 20v-8M22 20H2",
  briefcase: "M3 8h18v12H3zM8 8V5h8v3M3 13h18",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21c0-3.5 3.1-6 7-6s7 2.5 7 6M17 4.3a4 4 0 0 1 0 7.4M19 21c0-2.3-1-4.2-2.5-5.3",
  inbox: "M3 13h5l1 3h6l1-3h5M3 13l3-8h12l3 8v6H3z",
  media: "M3 5h18v14H3zM3 15l5-4 4 3 3-3 6 5",
  shield: "M12 3l8 3v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6zM9 12l2 2 4-4",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.5 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 14.2H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1.1z",
  history: "M3 12a9 9 0 1 0 3-6.7M3 4v4h4M12 8v4l3 2",
  search: "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5L21 21",
  plus: "M12 5v14M5 12h14",
  edit: "M4 20h4l10-10-4-4L4 16zM14 6l4 4M13 20h7",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6",
  check: "M4 12l5 5L20 6",
  close: "M6 6l12 12M18 6L6 18",
  chevronLeft: "M15 5l-7 7 7 7",
  chevronRight: "M9 5l7 7-7 7",
  chevronDown: "M5 9l7 7 7-7",
  chevronUp: "M5 15l7-7 7 7",
  menu: "M4 7h16M4 12h16M4 17h16",
  logout: "M9 5H5v14h4M15 8l4 4-4 4M19 12H9",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  upload: "M12 17V4M7 9l5-5 5 5M4 20h16",
  download: "M12 4v13M7 12l5 5 5-5M4 20h16",
  external: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.4 2.5 15.6 0 18M12 3c-2.5 2.4-2.5 15.6 0 18",
  alert: "M12 4l9 16H3zM12 10v4M12 17v.5",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 8v.5",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l4 2",
  calendar: "M4 6h16v15H4zM4 10h16M8 3v4M16 3v4",
  lock: "M5 11h14v10H5zM8 11V7a4 4 0 1 1 8 0v4",
  unlock: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 7.5-2",
  archive: "M3 4h18v4H3zM5 8v13h14V8M9 12h6",
  copy: "M8 8h12v12H8zM16 8V4H4v12h4",
  mail: "M3 6h18v12H3zM3 7l9 6 9-6",
  note: "M5 4h10l4 4v12H5zM15 4v4h4M9 13h6M9 17h4",
  verified: "M12 3l2.2 1.6 2.7-.3 1 2.5 2.4 1.3-.7 2.6.7 2.6-2.4 1.3-1 2.5-2.7-.3L12 21l-2.2-1.6-2.7.3-1-2.5L3.7 16l.7-2.6-.7-2.6 2.4-1.3 1-2.5 2.7.3zM9 12l2 2 4-4",
  database: "M12 8c4.4 0 8-1.1 8-2.5S16.4 3 12 3 4 4.1 4 5.5 7.6 8 12 8zM4 5.5v13C4 20 7.6 21 12 21s8-1 8-2.5v-13M4 12c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5",
  image: "M3 5h18v14H3zM8.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM3 16l5-4 4 3 3-2 6 4",
  video: "M3 6h12v12H3zM15 10l6-3v10l-6-3z",
  file: "M6 3h8l4 4v14H6zM14 3v4h4M9 13h6M9 17h6",
  refresh: "M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6",
};

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  /** Pixel size; defaults to 16, which suits body text and buttons. */
  size?: number;
}

export function Icon({ name, size = 16, className = "", ...rest }: IconProps) {
  return (
    <svg
      {...rest}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** The glyph that suits a media asset's kind. */
export const iconForKind = (kind?: string | null): IconName =>
  kind === "video" ? "video" : kind === "document" ? "file" : "image";
