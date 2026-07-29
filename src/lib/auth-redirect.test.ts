import { describe, expect, it } from "vitest";
import { adminLoginPath, safeAdminReturnPath } from "@/lib/auth-redirect";

describe("safeAdminReturnPath", () => {
  it("accepts /admin paths including their query string", () => {
    expect(safeAdminReturnPath("/admin")).toBe("/admin");
    expect(safeAdminReturnPath("/admin/tickets")).toBe("/admin/tickets");
    expect(safeAdminReturnPath("/admin/tickets?ticket=registration:abc&status=all")).toBe(
      "/admin/tickets?ticket=registration:abc&status=all",
    );
  });

  it("rejects external, protocol-relative, and non-admin targets", () => {
    expect(safeAdminReturnPath("https://evil.example/admin")).toBeNull();
    expect(safeAdminReturnPath("//evil.example/admin")).toBeNull();
    expect(safeAdminReturnPath("/register")).toBeNull();
    expect(safeAdminReturnPath("/administrator")).toBeNull();
    expect(safeAdminReturnPath("")).toBeNull();
    expect(safeAdminReturnPath(null)).toBeNull();
  });

  it("rejects the login page itself so login can never loop", () => {
    expect(safeAdminReturnPath("/admin/login")).toBeNull();
    expect(safeAdminReturnPath("/admin/login?error=no_access")).toBeNull();
  });
});

describe("adminLoginPath", () => {
  it("preserves a deep link's full path and query through the redirect", () => {
    const path = adminLoginPath("/admin/tickets?ticket=registration:abc");
    expect(path).toBe("/admin/login?next=%2Fadmin%2Ftickets%3Fticket%3Dregistration%3Aabc");
    const next = new URLSearchParams(path.split("?")[1]).get("next");
    expect(next).toBe("/admin/tickets?ticket=registration:abc");
  });

  it("falls back to the bare login page for missing or unsafe targets", () => {
    expect(adminLoginPath()).toBe("/admin/login");
    expect(adminLoginPath(null)).toBe("/admin/login");
    expect(adminLoginPath("https://evil.example/admin")).toBe("/admin/login");
  });
});
