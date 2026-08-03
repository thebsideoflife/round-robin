import type {
  AppData,
  Clinic,
  EscalationLevel,
  Person,
  Round,
  RoundedRole,
  Task,
  TaskPriority,
  TaskStatus,
} from "./types";
import { THEMES } from "./types";
import type { RoundWin, WinCategory } from "./types";

// Deterministic PRNG so the demo data is stable between server render and client.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260729);
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

// Fixed "today" keeps SSR and hydration identical.
export const TODAY = new Date("2026-07-29T09:00:00.000Z");
const day = 86400000;
const daysAgo = (n: number) => new Date(TODAY.getTime() - n * day).toISOString();
const daysAhead = (n: number) => new Date(TODAY.getTime() + n * day).toISOString();

const DIVISIONS = ["North Ambulatory", "Central Ambulatory", "South Ambulatory"];
const REGIONS: Record<string, string[]> = {
  "North Ambulatory": ["Lakeshore", "Riverbend", "Northgate"],
  "Central Ambulatory": ["Midtown", "University", "Westpark"],
  "South Ambulatory": ["Harbor", "Southfield"],
};

const SPECIALTIES = [
  "Cardiology",
  "Pediatrics",
  "Orthopedics",
  "Primary Care",
  "Endocrinology",
  "Dermatology",
  "Gastroenterology",
  "Neurology",
  "Women's Health",
  "Pulmonology",
  "Urology",
  "Behavioral Health",
];

const FIRST = [
  "Alicia","Marcus","Priya","Devon","Elena","Jordan","Nia","Ravi","Sofia","Grant",
  "Hannah","Theo","Camille","Owen","Maya","Isaac","Lena","Felix","Rosa","Damon",
  "Iris","Caleb","Yara","Miles","Dana","Aaron","Bianca","Cyrus","Farrah","Gideon",
];
const LAST = [
  "Whitfield","Alvarez","Nakamura","Boone","Petrov","Osei","Lindqvist","Chaudhry","Marsh","Delgado",
  "Kingsley","Okafor","Rivas","Sundberg","Hollis","Barrera","Ng","Fontaine","Ashby","Moreau",
];

let nameIdx = 0;
function personName() {
  const f = FIRST[nameIdx % FIRST.length];
  const l = LAST[Math.floor(nameIdx / FIRST.length + nameIdx * 7) % LAST.length];
  nameIdx++;
  return `${f} ${l}`;
}

const ROUNDED_ROLES: RoundedRole[] = ["Provider", "Clinical Staff", "Front Office Staff"];

const THEME_TEXT: Record<string, { barrier: string; action: string }> = {
  Staffing: {
    barrier: "We are down two medical assistants and rooms sit empty most afternoons.",
    action: "Backfill MA vacancies and approve float pool coverage",
  },
  "Patient Access": {
    barrier: "Third next available is out past six weeks and patients are calling repeatedly.",
    action: "Open additional new-patient slots and review template capacity",
  },
  Scheduling: {
    barrier: "Template rules do not match provider clinic days, so double bookings happen weekly.",
    action: "Rebuild scheduling templates with provider input",
  },
  "Referral Management": {
    barrier: "Outbound referrals sit in the work queue with no clear owner.",
    action: "Assign referral queue ownership and add a daily worklist review",
  },
  Technology: {
    barrier: "The check-in tablets drop connection and staff revert to paper.",
    action: "Escalate tablet connectivity ticket to IT with clinic impact documented",
  },
  Facilities: {
    barrier: "Exam room 4 has a broken table and the HVAC in the back hall is failing.",
    action: "Submit facilities work order and confirm completion date",
  },
  Safety: {
    barrier: "Medication refrigerator temperature logs were missed on two shifts.",
    action: "Reinstate daily temperature log audit and retrain staff",
  },
  Supplies: {
    barrier: "We routinely run out of specimen collection kits by midweek.",
    action: "Adjust par levels with supply chain",
  },
  Training: {
    barrier: "New front office hires have not completed insurance verification training.",
    action: "Schedule verification training cohort for new hires",
  },
  "Provider Retention": {
    barrier: "Two physicians raised burnout concerns tied to inbox volume.",
    action: "Pilot inbox pooling support and schedule retention conversations",
  },
};

function buildOrg() {
  const people: Person[] = [];
  const cao: Person = {
    id: "p-cao",
    name: "Dr. Adaeze Okonkwo",
    title: "Chief Ambulatory Officer",
    role: "cao",
  };
  people.push(cao);

  const execs: Person[] = DIVISIONS.map((division, i) => ({
    id: `p-ed-${i + 1}`,
    name: personName(),
    title: "Executive Director, Ambulatory Operations",
    role: "executive_director" as const,
    managerId: cao.id,
    division,
  }));
  people.push(...execs);

  const directors: Person[] = [];
  execs.forEach((ed, ei) => {
    REGIONS[ed.division!].forEach((region, ri) => {
      directors.push({
        id: `p-dir-${ei + 1}-${ri + 1}`,
        name: personName(),
        title: "Director of Operations",
        role: "director",
        managerId: ed.id,
        division: ed.division,
        region,
      });
    });
  });
  people.push(...directors);

  const managers: Person[] = [];
  directors.forEach((dir, di) => {
    const count = di % 3 === 0 ? 3 : 2;
    for (let m = 0; m < count; m++) {
      managers.push({
        id: `p-mgr-${di + 1}-${m + 1}`,
        name: personName(),
        title: "Practice Manager",
        role: "manager",
        managerId: dir.id,
        division: dir.division,
        region: dir.region,
      });
    }
  });
  people.push(...managers);

  const clinics: Clinic[] = [];
  let c = 0;
  managers.forEach((mgr) => {
    const dir = directors.find((d) => d.id === mgr.managerId)!;
    const ed = execs.find((e) => e.id === dir.managerId)!;
    const clinicCount = int(1, 3);
    for (let i = 0; i < clinicCount; i++) {
      const specialty = SPECIALTIES[c % SPECIALTIES.length];
      clinics.push({
        id: `c-${c + 1}`,
        name: `${dir.region} ${specialty}`,
        specialty,
        site: `${dir.region} Medical Pavilion`,
        region: dir.region!,
        division: ed.division!,
        managerId: mgr.id,
        directorId: dir.id,
        executiveDirectorId: ed.id,
        providerCount: int(3, 14),
        staffCount: int(6, 28),
      });
      c++;
    }
  });

  return { people, clinics, managers };
}

const WIN_POOL: { text: string; category: WinCategory }[] = [
  {
    text: "The front office team cleared a 200-referral backlog in three weeks without adding overtime.",
    category: "Process Improvement",
  },
  {
    text: "An MA caught a medication list discrepancy before the patient left the room — great save.",
    category: "Safety Catch",
  },
  {
    text: "Providers volunteered to flex their templates to absorb the post-holiday surge.",
    category: "Teamwork",
  },
  {
    text: "Patient experience comments called out how warm and quick the check-in process feels now.",
    category: "Patient Experience",
  },
  {
    text: "The new rooming workflow cut average cycle time by eleven minutes.",
    category: "Process Improvement",
  },
  {
    text: "Staff covered two open shifts for a colleague on family leave without being asked.",
    category: "Teamwork",
  },
  {
    text: "Our newest scheduler trained the whole pod on the referral queue in her first month.",
    category: "Recognition",
  },
  {
    text: "A nurse escalated an abnormal vital reading immediately and the patient was seen same day.",
    category: "Safety Catch",
  },
  {
    text: "Same-day access slots are being filled consistently and patients are noticing the difference.",
    category: "Patient Experience",
  },
  {
    text: "The team redesigned the in-basket rotation and inbox turnaround is under 24 hours.",
    category: "Process Improvement",
  },
];

function buildWin(): RoundWin {
  const w = pick(WIN_POOL);
  return {
    text: w.text,
    category: w.category,
    recognized:
      rand() < 0.75
        ? `${FIRST[int(0, FIRST.length - 1)]} ${LAST[int(0, LAST.length - 1)]}`
        : undefined,
  };
}

function buildRounds(clinics: Clinic[]): Round[] {
  const rounds: Round[] = [];
  let r = 0;
  clinics.forEach((clinic) => {
    const count = int(2, 9);
    // Some clinics are deliberately stale to drive the recommendation engine.
    const staleOffset = rand() < 0.25 ? int(30, 62) : int(0, 12);
    for (let i = 0; i < count; i++) {
      const theme = pick(THEMES);
      const role = ROUNDED_ROLES[(i + r) % 3];
      const safety = rand() < 0.14 || theme === "Safety";
      const offset = staleOffset + i * int(9, 20);
      if (offset > 130) continue;
      rounds.push({
        id: `r-${++r}`,
        clinicId: clinic.id,
        date: daysAgo(offset),
        managerId: clinic.managerId,
        individual:
          role === "Provider"
            ? `Dr. ${LAST[int(0, LAST.length - 1)]}`
            : `${FIRST[int(0, FIRST.length - 1)]} ${LAST[int(0, LAST.length - 1)]}`,
        individualRole: role,
        notes: `${THEME_TEXT[theme].barrier} The team is covering, but it is adding time to every visit and morale is starting to slip. ${
          safety ? "They also flagged a safety issue that needs follow-up this week." : ""
        }`,
        answers: {
          workingWell:
            "Team communication during huddles is strong and the new rooming workflow has helped visit flow.",
          barriers: THEME_TEXT[theme].barrier,
          accessChallenges:
            theme === "Patient Access" || theme === "Scheduling"
              ? "New patient wait times are stretching and reschedules are climbing."
              : "No new access issues beyond normal seasonal volume.",
          workflowConcerns:
            theme === "Technology" || theme === "Referral Management"
              ? THEME_TEXT[theme].barrier
              : "Workflow is stable; occasional bottleneck at check-out.",
          safetyConcerns: safety
            ? "Documented safety concern requiring leadership follow-up."
            : "None reported.",
          leadershipSupport: THEME_TEXT[theme].action,
          additionalComments:
            "Requested feedback on when a decision will be communicated back to the team.",
        },
        themes: [theme],
        safetyFlag: safety,
        win: rand() < 0.38 ? buildWin() : undefined,
      });
    }
  });
  return rounds;
}

function suggestSeedEscalation(
  priority: TaskPriority,
  safety: boolean,
  ageDays: number,
  status: TaskStatus,
): EscalationLevel {
  if (status === "Closed") return "Manager Resolve";
  const urgent = safety || priority === "Critical";
  // Items the manager is actively working never sit above director level.
  const capped = status === "In Progress" || status === "Pending Validation";
  if (!capped && (ageDays > 100 || (urgent && ageDays > 60))) return "Executive Review";
  if (ageDays > 45 || (urgent && ageDays > 21)) return "Director Review";
  return "Manager Resolve";

}


function buildTasks(rounds: Round[], clinics: Clinic[]): Task[] {
  const tasks: Task[] = [];
  let t = 0;
  rounds.forEach((round) => {
    const clinic = clinics.find((c) => c.id === round.clinicId)!;
    const count = int(0, 3);
    for (let i = 0; i < count; i++) {
      const theme = round.themes[0];
      const ageDays = Math.round((TODAY.getTime() - new Date(round.date).getTime()) / day);
      const safety = round.safetyFlag && i === 0;
      const priority: TaskPriority = safety
        ? pick(["High", "Critical"] as const)
        : pick(["Low", "Medium", "Medium", "High", "Critical"] as const);
      const roll = rand();
      let status: TaskStatus;
      if (roll < 0.34) status = "Closed";
      else if (roll < 0.5) status = "Pending Validation";
      else if (roll < 0.72) status = "In Progress";
      else if (roll < 0.92) status = "Open";
      else status = "Reopened";

      const dueOffset = int(-25, 30);
      tasks.push({
        id: `t-${++t}`,
        title: THEME_TEXT[theme].action,
        description: `${THEME_TEXT[theme].barrier} Raised during rounding with ${round.individualRole.toLowerCase()} at ${clinic.name}.`,
        clinicId: clinic.id,
        roundId: round.id,
        ownerId: clinic.managerId,
        priority,
        dueDate: dueOffset >= 0 ? daysAhead(dueOffset) : daysAgo(-dueOffset),
        status,
        escalation: suggestSeedEscalation(priority, safety, ageDays, status),
        theme,
        safetyRelated: safety,
        createdAt: round.date,
        closedAt: status === "Closed" ? daysAgo(Math.max(0, ageDays - int(2, 14))) : undefined,
        validationHistory:
          status === "Closed"
            ? [{ date: daysAgo(Math.max(0, ageDays - int(2, 14))), resolved: true }]
            : status === "Reopened"
              ? [{ date: daysAgo(int(1, 20)), resolved: false, note: "Issue recurred at next round." }]
              : [],
      });
    }
  });
  return tasks;
}

export function buildSeedData(): AppData {
  const { people, clinics } = buildOrg();
  const rounds = buildRounds(clinics);
  const tasks = buildTasks(rounds, clinics);
  return { people, clinics, rounds, tasks };
}

export const seedData: AppData = buildSeedData();
