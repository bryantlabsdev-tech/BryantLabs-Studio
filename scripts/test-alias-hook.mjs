import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./test-alias-resolve.mjs", import.meta.url);
