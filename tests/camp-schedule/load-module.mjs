import { loadFile } from "../helpers/load-module.mjs";

export const load = (relative) =>
  loadFile(
    new URL(`../../src/features/camp-schedule/${relative}`, import.meta.url),
  );
