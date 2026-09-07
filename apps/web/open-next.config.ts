import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// OpenNext Cloudflare adapter config (issue #29).
// Static-assets incremental cache is the zero-infra default.
export default defineCloudflareConfig({});
