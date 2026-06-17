export type Step = "input" | "review" | "confirm";

export const STEP_ORDER: Step[] = ["input", "review", "confirm"];

export const pageTitles: Record<Step, string> = {
  input: "Company Onboarding",
  review: "Review your details",
  confirm: "Confirm details",
};
