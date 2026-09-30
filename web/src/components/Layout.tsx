// The navy header and page frame shared by every logged-in screen.
import type { ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router";
import { useAuth } from "../lib/useAuth.ts";
import { HeaderPattern } from "./ui.tsx";

const NAV = {
  STUDENT: [
    ["/student", "My Dashboard"],
    ["/courses", "Courses"],
    ["/student/lectures", "Lectures"],
    ["/student/feedback", "Feedback"],
  ],
  TEACHER: [
    ["/teacher", "My Classes"],
    ["/teacher/lectures", "Lectures"],
  ],
  ADMIN: [
    ["/admin", "Admin"],
    ["/courses", "Catalog"],
    ["/teacher", "Classes"],
  ],
} as const;

export function Layout({ subtitle, greeting, children }: { subtitle: string; greeting?: { title: string; text?: string }; children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const links = user ? NAV[user.role] : [["/courses", "Courses"] as const];

  return (
    <>
      <header className="header">
        <HeaderPattern />
        <div className="header-inner">
          <Link to="/" className="brand">
            <img src="/favicon.svg" alt="" width={40} height={40} />
            <span>
              <span className="brand-name">Siraat tul Jannah</span>
              <span className="brand-sub" style={{ display: "block" }}>{subtitle}</span>
            </span>
          </Link>
          <nav className="header-nav" aria-label="Main">
            {links.map(([to, label]) => (
              <NavLink key={to} to={to} end>
                {label}
              </NavLink>
            ))}
            {user ? (
              <a
                href="/login"
                onClick={async (e) => {
                  e.preventDefault();
                  await logout();
                  navigate("/login");
                }}
              >
                Log out
              </a>
            ) : (
              <NavLink to="/login">Log in</NavLink>
            )}
          </nav>
        </div>
        {greeting && (
          <div className="header-greeting">
            <h1>{greeting.title}</h1>
            {greeting.text && <p>{greeting.text}</p>}
          </div>
        )}
      </header>
      <main className="page">{children}</main>
    </>
  );
}
