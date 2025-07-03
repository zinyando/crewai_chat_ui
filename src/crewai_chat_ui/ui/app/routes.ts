// Define types locally since @react-router/dev/routes is not available
type RouteConfig = Array<{
  path?: string;
  component?: string;
  index?: boolean;
}>;

// Helper function to create index routes
const index = (component: string) => ({ index: true, component });

export default [
  index("routes/landing.tsx"),
  { path: "chat", component: "routes/chat.tsx" },
  { path: "kickoff", component: "routes/kickoff.tsx" }
] satisfies RouteConfig;
