import { redirect } from "next/navigation";
import { LabEditorClient } from "./LabEditorClient";

export default function LabEditorPage() {
  // Dev-only tool. E2E_TEST_MODE keeps it reachable in the production build
  // the Playwright suite runs against; it is never set on real deployments.
  if (process.env.NODE_ENV === "production" && process.env.E2E_TEST_MODE !== "1") redirect("/");
  return <LabEditorClient />;
}
