import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let mockPathname = "/dashboard";
const logoutMock = vi.fn();

const translations: Record<string, string> = {
  "menu-nav": "Navigation",
  "menu-audit": "Handover Engine",
  "menu-deadlines": "Deadline Calculator",
  "menu-cases": "Cases",
  "menu-vault": "Tech Vault",
  "menu-settings": "Settings",
  "menu-logout": "Log out",
  "mobile-nav-dashboard": "Dashboard",
  "mobile-nav-open-aria": "Open navigation menu",
  "mobile-nav-close-aria": "Close navigation menu",
  "mobile-nav-dialog-aria": "Dashboard navigation",
  "mobile-nav-menu": "Menu",
};

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: {
      name: "Max Muster",
      email: "max@example.ch",
    },
    logout: logoutMock,
  }),
}));

vi.mock("@/context/LanguageContext", () => ({
  useLanguage: () => ({
    lang: "en",
    t: (key: string) => translations[key] ?? key,
  }),
}));

import Sidebar from "@/components/dashboard/Sidebar";
import MobileNav from "@/components/dashboard/MobileNav";

describe("dashboard navigation Tech Vault item", () => {
  beforeEach(() => {
    mockPathname = "/dashboard";
    logoutMock.mockClear();
    document.body.style.overflow = "";
  });

  it("renders a desktop Sidebar link to Tech Vault", () => {
    render(<Sidebar />);

    expect(screen.getByRole("link", { name: "Tech Vault" }).getAttribute("href")).toBe(
      "/dashboard/vault"
    );
  });

  it("uses Tech Vault as the mobile active title and includes its link in the opened menu", () => {
    mockPathname = "/dashboard/vault";
    render(<MobileNav />);

    expect(screen.getByText("Tech Vault")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }));

    const dialog = screen.getByRole("dialog", { name: "Dashboard navigation" });
    expect(within(dialog).getByRole("link", { name: "Tech Vault" }).getAttribute("href")).toBe(
      "/dashboard/vault"
    );
  });
});
