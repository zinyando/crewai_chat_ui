import { json } from "@remix-run/node";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";

/**
 * GET /api/flows
 * Returns a list of available flows
 */
export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const response = await fetch("http://localhost:8000/api/flows");
    const data = await response.json();
    return json(data);
  } catch (error) {
    console.error("Error fetching flows:", error);
    return json({ status: "error", detail: "Failed to fetch flows" }, { status: 500 });
  }
}

/**
 * POST /api/flows/:flowId/execute
 * Execute a flow with the provided inputs
 */
export async function action({ request, params }: ActionFunctionArgs) {
  const flowId = params.flowId;
  
  if (!flowId) {
    return json({ status: "error", detail: "Flow ID is required" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { inputs } = body;

    const response = await fetch(`http://localhost:8000/api/flows/${flowId}/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs }),
    });

    const data = await response.json();
    return json(data);
  } catch (error) {
    console.error(`Error executing flow ${flowId}:`, error);
    return json({ status: "error", detail: "Failed to execute flow" }, { status: 500 });
  }
}
