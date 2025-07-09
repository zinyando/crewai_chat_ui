import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";

/**
 * GET /api/flows/:flowId/initialize
 * Returns initialization data for a specific flow, including required inputs
 */
export async function loader({ request, params }: LoaderFunctionArgs) {
  const flowId = params.flowId;
  
  if (!flowId) {
    return json({ status: "error", detail: "Flow ID is required" }, { status: 400 });
  }

  try {
    const response = await fetch(`http://localhost:8000/api/flows/${flowId}/initialize`);
    const data = await response.json();
    return json(data);
  } catch (error) {
    console.error(`Error initializing flow ${flowId}:`, error);
    return json({ status: "error", detail: "Failed to initialize flow" }, { status: 500 });
  }
}
