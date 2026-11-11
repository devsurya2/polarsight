import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Icon, type IconName } from "./Icon";
import { Button, IconButton } from "./ui";

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  /** Hidden unless the user holds one of these. Empty means always shown. */
  any?: string[];
}

interface NavGroup {
  heading: string;
  items: NavItem[];
}

/**
 * Navigation, grouped by what someone is trying to do rather than by
 * which table it maps to. Each item declares the permissions that make
 * it useful; the API enforces the same rules, so hiding one is a
 * convenience, not the control.
 *
 * Every entry here manages something the public website actually
 * renders, because a screen that edits content nobody can see is
 * worse than no screen at all.
 */
const GROUPS: NavGroup[] = [
  {
    heading: "Overview",
    items: [{ to: "/", label: "Dashboard", icon: "dashboard" }],
  },
  {
    heading: "Website",
    items: [
      { to: "/pages", label: "Pages", icon: "pages", any: ["page:read"] },
      { to: "/content", label: "Content blocks", icon: "text", any: ["content:read"] },
      { to: "/programmes", label: "Programmes", icon: "programme", any: ["programme:read"] },
      { to: "/media", label: "Media library", icon: "media", any: ["media:read"] },
    ],
  },
  {
    heading: "Recruitment",
    items: [
      { to: "/jobs", label: "Job openings", icon: "briefcase", any: ["job:read"] },
      { to: "/applications", label: "Applications", icon: "users", any: ["application:read"] },
    ],
  },
  {
    heading: "Enquiries",
    items: [{ to: "/enquiries", label: "Contact enquiries", icon: "inbox", any: ["enquiry:read"] }],
  },
  {
    heading: "Administration",
    items: [
      { to: "/admin-users", label: "Administrators", icon: "shield", any: ["admin:read"] },
      { to: "/roles", label: "Roles", icon: "lock", any: ["role:read"] },
      { to: "/settings", label: "Settings", icon: "settings", any: ["setting:read"] },
      { to: "/audit", label: "Audit log", icon: "history", any: ["audit:read"] },
    ],
  },
];

const COLLAPSE_KEY = "ps.admin.sidebarCollapsed";

export function Layout() {
  const { user, signOut, canAny } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    // A per-browser convenience only; nothing depends on it, so a
    // blocked or empty store is fine.
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore: the sidebar simply will not remember its state */
    }
  }, [collapsed]);

  // Close the mobile drawer on navigation, or it covers what was opened.
  useEffect(() => {
    setDrawerOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const visible = GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.any || canAny(...i.any)),
  })).filter((g) => g.items.length > 0);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  const width = collapsed ? "w-16" : "w-60";

  return (
    <div className="flex min-h-screen">
      {/* ── Sidebar ─────────────────────────────────────── */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex ${width} shrink-0 flex-col border-r border-line bg-panel transition-transform duration-200 lg:static lg:translate-x-0 ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div
          className={`flex h-14 shrink-0 items-center border-b border-line ${
            collapsed ? "justify-center px-0" : "gap-2.5 px-5"
          }`}
        >
          <img src="/favicon.png" alt="" className="h-6 w-6 shrink-0 object-contain" />
          {!collapsed && (
            <span className="truncate text-sm font-semibold tracking-tight">
              POLARSIGHT
              <span className="ml-1.5 font-normal text-faint">Admin</span>
            </span>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">
          {visible.map((group) => (
            <div key={group.heading} className="mb-5">
              {collapsed ? (
                <div className="mx-2 mb-2 border-t border-line-soft" aria-hidden />
              ) : (
                <p className="label px-2 pb-2">{group.heading}</p>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.to === "/"}
                      title={collapsed ? item.label : undefined}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 rounded-inner px-3 py-2 text-sm transition-colors ${
                          collapsed ? "justify-center px-0" : ""
                        } ${
                          isActive
                            ? "bg-accent-soft text-accent-ice"
                            : "text-body hover:bg-raised hover:text-ink"
                        }`
                      }
                    >
                      <Icon name={item.icon} size={16} />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-line p-3">
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="hidden w-full items-center gap-2.5 rounded-inner px-3 py-2 text-xs text-faint transition-colors hover:bg-raised hover:text-ink lg:flex"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <Icon name={collapsed ? "chevronRight" : "chevronLeft"} size={15} />
            {!collapsed && "Collapse"}
          </button>
        </div>
      </aside>

      {drawerOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden
        />
      )}

      {/* ── Main column ─────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line bg-canvas/85 px-4 backdrop-blur sm:px-5">
          <IconButton
            icon="menu"
            label="Open navigation"
            className="lg:hidden"
            onClick={() => setDrawerOpen(true)}
          />

          <div className="ml-auto flex items-center gap-2">
            <a
              href={import.meta.env.VITE_WEB_URL ?? "http://localhost:3000"}
              target="_blank"
              rel="noreferrer"
              className="hidden items-center gap-1.5 rounded-inner px-2.5 py-1.5 text-xs text-body transition-colors hover:bg-raised hover:text-ink sm:flex"
            >
              <Icon name="globe" size={14} />
              View website
              <Icon name="external" size={12} className="opacity-60" />
            </a>

            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="flex items-center gap-2.5 rounded-inner px-2 py-1.5 transition-colors hover:bg-raised"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-raised text-[0.6875rem] font-semibold">
                  {initials(user?.name)}
                </span>
                <span className="hidden text-left sm:block">
                  <span className="block text-xs font-medium leading-tight">{user?.name}</span>
                  <span className="block text-[0.6875rem] leading-tight text-faint">
                    {user?.role}
                  </span>
                </span>
                <Icon name="chevronDown" size={13} className="text-faint" />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="panel absolute right-0 top-full z-30 mt-1.5 w-56 animate-in overflow-hidden p-1 shadow-xl"
                >
                  <div className="border-b border-line-soft px-3 py-2.5">
                    <p className="truncate text-xs font-medium">{user?.name}</p>
                    <p className="truncate text-[0.6875rem] text-faint">{user?.email}</p>
                  </div>
                  <NavLink
                    to="/account"
                    role="menuitem"
                    className="flex items-center gap-2 rounded-inner px-3 py-2 text-sm text-body transition-colors hover:bg-raised hover:text-ink"
                  >
                    <Icon name="users" size={15} />
                    Your account
                  </NavLink>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-2 rounded-inner px-3 py-2 text-left text-sm text-body transition-colors hover:bg-raised hover:text-ink"
                  >
                    <Icon name="logout" size={15} />
                    Sign out
                  </button>
                </div>
              )}
            </div>

            <Button size="sm" icon="logout" className="sm:hidden" onClick={handleSignOut}>
              <span className="sr-only">Sign out</span>
            </Button>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-5 lg:px-6">
          <div className="mx-auto max-w-[88rem]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

function initials(name?: string): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
