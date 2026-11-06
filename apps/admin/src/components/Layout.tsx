import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Button } from "./ui";

interface NavItem {
  to: string;
  label: string;
  /** Hidden unless the user holds one of these. Empty means always shown. */
  any?: string[];
}

interface NavGroup {
  heading: string;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    heading: "Overview",
    items: [{ to: "/", label: "Dashboard" }],
  },
  {
    heading: "Website",
    items: [
      { to: "/content", label: "Page content", any: ["content:read"] },
      { to: "/programmes", label: "Programmes", any: ["programme:read"] },
      { to: "/faqs", label: "FAQs", any: ["faq:read"] },
      { to: "/statistics", label: "Statistics", any: ["statistic:read"] },
      { to: "/audiences", label: "Who we serve", any: ["audience:read"] },
      { to: "/career", label: "Careers", any: ["career:read"] },
      { to: "/media", label: "Media", any: ["media:read"] },
    ],
  },
  {
    heading: "Enquiries",
    items: [{ to: "/enquiries", label: "Contact enquiries", any: ["enquiry:read"] }],
  },
  {
    heading: "Administration",
    items: [
      { to: "/admin-users", label: "Administrators", any: ["admin:read"] },
      { to: "/roles", label: "Roles", any: ["role:read"] },
      { to: "/audit", label: "Audit log", any: ["audit:read"] },
    ],
  },
];

export function Layout() {
  const { user, signOut, canAny } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const visible = GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.any || canAny(...i.any)),
  })).filter((g) => g.items.length > 0);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-60 shrink-0 overflow-y-auto border-r border-line bg-panel transition-transform lg:static lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-14 items-center gap-2.5 border-b border-line px-5">
          <img src="/favicon.png" alt="" className="h-6 w-auto object-contain" />
          <span className="text-sm font-semibold tracking-tight">
            POLARSIGHT
            <span className="ml-1.5 font-normal text-faint">Admin</span>
          </span>
        </div>

        <nav className="px-3 py-4" aria-label="Main">
          {visible.map((group) => (
            <div key={group.heading} className="mb-5">
              <p className="label px-2 pb-2">{group.heading}</p>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.to === "/"}
                      onClick={() => setOpen(false)}
                      className={({ isActive }) =>
                        `block rounded-inner px-3 py-2 text-sm transition-colors ${
                          isActive
                            ? "bg-accent-soft text-accent-ice"
                            : "text-body hover:bg-raised hover:text-ink"
                        }`
                      }
                    >
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-b border-line bg-canvas/85 px-5 backdrop-blur">
          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle navigation"
          >
            ☰
          </Button>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-xs font-medium leading-tight">{user?.name}</p>
              <p className="text-[0.6875rem] leading-tight text-faint">{user?.role}</p>
            </div>
            <NavLink
              to="/account"
              className="rounded-inner px-2 py-1 text-xs text-body transition-colors hover:bg-raised hover:text-ink"
            >
              Account
            </NavLink>
            <Button size="sm" onClick={handleSignOut}>Sign out</Button>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-5 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
