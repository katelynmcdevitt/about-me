import { getCampStore } from "../../../../server/camp-schedule/database";
import {
  campApiError,
  readJson,
  noCache,
} from "../../../../server/camp-schedule/http";
import { validYear } from "../../../../server/camp-schedule/validation";
import type { CampCommand } from "../../../../features/camp-schedule/contracts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ year: string }> };
export async function GET(_request: Request, { params }: Context) {
  try {
    return Response.json(
      getCampStore().getSeason(validYear((await params).year)),
      { headers: noCache },
    );
  } catch (error) {
    return campApiError(error);
  }
}
export async function PATCH(request: Request, { params }: Context) {
  try {
    const body = await readJson(request);
    return Response.json(
      getCampStore().mutate(
        validYear((await params).year),
        body as CampCommand,
      ),
      { headers: noCache },
    );
  } catch (error) {
    return campApiError(error);
  }
}
