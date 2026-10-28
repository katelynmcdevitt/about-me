import { getCampStore } from "../../../server/camp-schedule/database";
import {
  campApiError,
  readJson,
  noCache,
} from "../../../server/camp-schedule/http";
import { validYear } from "../../../server/camp-schedule/validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return Response.json(getCampStore().getIndex(), { headers: noCache });
  } catch (error) {
    return campApiError(error);
  }
}
export async function PATCH(request: Request) {
  try {
    const body = (await readJson(request)) as { year?: unknown } | null;
    return Response.json(getCampStore().selectYear(validYear(body?.year)), {
      headers: noCache,
    });
  } catch (error) {
    return campApiError(error);
  }
}
