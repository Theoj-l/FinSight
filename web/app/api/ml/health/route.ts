import { NextResponse } from "next/server";
import { mlClient, MlServiceError } from "@/lib/ml-client";

/**
 * Example of the web -> ML contract: the browser calls this route, the server
 * proxies to the FastAPI service with the shared secret. Never call the ML
 * service directly from the client.
 */
export async function GET() {
  try {
    const health = await mlClient.health();
    return NextResponse.json(health);
  } catch (error) {
    const status = error instanceof MlServiceError ? 502 : 500;
    return NextResponse.json(
      { status: "error", message: (error as Error).message },
      { status },
    );
  }
}
