export type { AppDomain, AppDomainProfile, ClassifyAppDomainInput } from "./types";
export {
  classifyAppDomain,
  isPuzzleGridDomain,
  isPuzzleGridSource,
} from "./classify";
export { deriveProjectFacts, type ProjectFact } from "./capabilities";
export {
  suggestNextSteps,
  suggestNextImprovements,
  suggestComposerExamples,
  postCreatePlaceholderText,
  displayNameFromPrompt,
  type SuggestionRequest,
} from "./suggestions";
