import { type RouteConfig } from "@react-router/dev/routes";

export default [
  { index: true, file: "routes/landing.tsx" },
  { path: "chat", file: "routes/chat.tsx" },
  { path: "kickoff", file: "routes/kickoff.tsx" }
] satisfies RouteConfig;
