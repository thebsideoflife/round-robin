export type RoleKey = "manager" | "director" | "executive_director" | "cao";

export interface Person {
  id: string;
  name: string;
  title: string;
  role: RoleKey;
  managerId?: string; // person they report to
  division?: string;
  region?: string;
}

export interface Clinic {
  id: string;
  name: string;
  specialty: string;
  site: string;
  region: string;
  division: string;
  managerId: string;
  directorId: string;
  executiveDirectorId: string;
  providerCount: number;
  staffCount: number;
}

export type RoundedRole = "Provider" | "Clinical Staff" | "Front Office Staff";

export interface RoundAnswers {
  workingWell: string;
  barriers: string;
  accessChallenges: string;
  workflowConcerns: string;
  safetyConcerns: string;
  leadershipSupport: string;
  additionalComments: string;
}

export const WIN_CATEGORIES = [
  "Patient Experience",
  "Teamwork",
  "Process Improvement",
  "Safety Catch",
  "Recognition",
] as const;

export type WinCategory = (typeof WIN_CATEGORIES)[number];

export interface RoundWin {
  text: string;
  recognized?: string;
  category: WinCategory;
}

export interface Round {
  id: string;
  clinicId: string;
  date: string; // ISO
  managerId: string;
  individual: string;
  individualRole: RoundedRole;
  notes: string;
  answers: RoundAnswers;
  themes: string[];
  safetyFlag: boolean;
  win?: RoundWin;
}

export type TaskStatus = "Open" | "In Progress" | "Pending Validation" | "Closed" | "Reopened";
export type TaskPriority = "Low" | "Medium" | "High" | "Critical";
export type EscalationLevel = "Manager Resolve" | "Director Review" | "Executive Review";

export interface Task {
  id: string;
  title: string;
  description: string;
  clinicId: string;
  roundId?: string;
  /** Origin of the item: "round_finding" | "px_opportunity" | "manual". */
  source?: string;
  /** PX report this item came from, when source is "px_opportunity". */
  reportId?: string;
  ownerId: string;
  priority: TaskPriority;
  dueDate: string; // ISO
  status: TaskStatus;
  escalation: EscalationLevel;
  escalationOverridden?: boolean;
  overrideReason?: string;
  theme: string;
  safetyRelated: boolean;
  createdAt: string;
  closedAt?: string;
  validationHistory: { date: string; resolved: boolean; roundId?: string; note?: string }[];
}

export interface AppData {
  people: Person[];
  clinics: Clinic[];
  rounds: Round[];
  tasks: Task[];
}

export const THEMES = [
  "Staffing",
  "Patient Access",
  "Scheduling",
  "Referral Management",
  "Technology",
  "Facilities",
  "Safety",
  "Supplies",
  "Training",
  "Provider Retention",
] as const;

export const ROLE_LABELS: Record<RoleKey, string> = {
  manager: "Manager",
  director: "Director",
  executive_director: "Executive Director",
  cao: "Chief Ambulatory Officer",
};
