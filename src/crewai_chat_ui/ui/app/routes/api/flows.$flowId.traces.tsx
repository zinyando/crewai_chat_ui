import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";

/**
 * GET /api/flows/:flowId/traces
 * Returns execution traces for a specific flow
 */
export async function loader({ request, params }: LoaderFunctionArgs) {
  const flowId = params.flowId;
  
  if (!flowId) {
    return json({ status: "error", detail: "Flow ID is required" }, { status: 400 });
  }

  try {
    const response = await fetch(`http://localhost:8000/api/flows/${flowId}/traces`);
    const data = await response.json();
    return json(data);
  } catch (error) {
    console.error(`Error fetching traces for flow ${flowId}:`, error);
    return json({ status: "error", detail: "Failed to fetch flow traces" }, { status: 500 });
  }
}
