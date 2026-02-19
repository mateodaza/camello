import { defineConfig } from "@trigger.dev/sdk/v3";

export default defineConfig({
  project: "proj_camello", // Replace with actual Trigger.dev project ref after account setup
  runtime: "node",
  logLevel: "log",
  dirs: ["src/jobs"],
});
