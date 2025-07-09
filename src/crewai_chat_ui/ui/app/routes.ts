import { type RouteConfig } from "@react-router/dev/routes";

export default [
  { index: true, file: "routes/landing.tsx" },
  { path: "chat", file: "routes/chat.tsx" },
  { path: "kickoff", file: "routes/kickoff.tsx" },
  { path: "kickoff/traces", file: "routes/kickoff.traces.tsx" },
  { path: "tools", file: "routes/tools.tsx" },
  { path: "flow", file: "routes/flow.tsx" },
  { path: "flow/traces", file: "routes/flow.traces.tsx" },
] satisfies RouteConfig;
