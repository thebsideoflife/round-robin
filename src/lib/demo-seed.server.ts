// Server-only demo environment generator. Creates a realistic, fully-populated
// ambulatory org so every dashboard, escalation, theme, win and PX report is
// visible. Imported dynamically inside server-function handlers only — never
// from client code. All demo rows are tagged via the email domain
// `@rnr-demo.org` and clinic membership so clearDemoData() can wipe them
// without touching the real admin account or any real data.

export const DEMO_DOMAIN = "rnr-demo.org";
export const DEMO_PASSWORD = "DemoRnR!2026";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type SupabaseAdmin = SupabaseClient<Database>;

const DAY = 86_400_000;

// Deterministic PRNG so a re-seed reproduces the same content.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260730);
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];
const int = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
const shuffle = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const daysAgoIso = (n: number) => new Date(Date.now() - n * DAY).toISOString();
const daysAgoDate = (n: number) => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);
const daysAheadDate = (n: number) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);

// ---------- Org definition ----------
interface SeedPerson {
  email: string;
  fullName: string;
  title: string;
  role: "manager" | "director" | "executive_director";
}
interface SeedClinic {
  name: string;
  specialty: string;
  site: string;
  region: string;
  division: string;
  providers: number;
  staff: number;
}

const DIVISIONS = ["North Ambulatory", "Central Ambulatory", "South Ambulatory"];

const CLINICS: SeedClinic[] = [
  { name: "Cardiology – Lakeshore", specialty: "Cardiology", site: "Lakeshore", region: "Lakeshore", division: "North Ambulatory", providers: 6, staff: 14 },
  { name: "Primary Care – Lakeshore", specialty: "Primary Care", site: "Lakeshore", region: "Lakeshore", division: "North Ambulatory", providers: 9, staff: 18 },
  { name: "Orthopedics – Riverbend", specialty: "Orthopedics", site: "Riverbend", region: "Riverbend", division: "North Ambulatory", providers: 5, staff: 11 },
  { name: "Dermatology – Riverbend", specialty: "Dermatology", site: "Riverbend", region: "Riverbend", division: "North Ambulatory", providers: 4, staff: 9 },
  { name: "Pediatrics – Northgate", specialty: "Pediatrics", site: "Northgate", region: "Northgate", division: "North Ambulatory", providers: 7, staff: 15 },
  { name: "Endocrinology – Northgate", specialty: "Endocrinology", site: "Northgate", region: "Northgate", division: "North Ambulatory", providers: 3, staff: 8 },
  { name: "Gastroenterology – Midtown", specialty: "Gastroenterology", site: "Midtown", region: "Midtown", division: "Central Ambulatory", providers: 5, staff: 12 },
  { name: "Neurology – Midtown", specialty: "Neurology", site: "Midtown", region: "Midtown", division: "Central Ambulatory", providers: 4, staff: 10 },
  { name: "Women's Health – University", specialty: "Women's Health", site: "University", region: "University", division: "Central Ambulatory", providers: 6, staff: 13 },
  { name: "Behavioral Health – University", specialty: "Behavioral Health", site: "University", region: "University", division: "Central Ambulatory", providers: 5, staff: 9 },
  { name: "Pulmonology – Westpark", specialty: "Pulmonology", site: "Westpark", region: "Westpark", division: "Central Ambulatory", providers: 4, staff: 10 },
  { name: "Urology – Harbor", specialty: "Urology", site: "Harbor", region: "Harbor", division: "South Ambulatory", providers: 3, staff: 7 },
  { name: "Primary Care – Southfield", specialty: "Primary Care", site: "Southfield", region: "Southfield", division: "South Ambulatory", providers: 8, staff: 16 },
];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "");

// Executive Directors (one per division)
const EDS: SeedPerson[] = [
  { email: `elena.vasquez@${DEMO_DOMAIN}`, fullName: "Elena Vasquez", title: "Executive Director, North Ambulatory", role: "executive_director" },
  { email: `marcus.bell@${DEMO_DOMAIN}`, fullName: "Marcus Bell", title: "Executive Director, Central Ambulatory", role: "executive_director" },
  { email: `priya.nair@${DEMO_DOMAIN}`, fullName: "Priya Nair", title: "Executive Director, South Ambulatory", role: "executive_director" },
];
// Directors (region-scoped)
const DIRECTORS: { person: SeedPerson; regions: string[]; division: string }[] = [
  { person: { email: `jordan.walsh@${DEMO_DOMAIN}`, fullName: "Jordan Walsh", title: "Director, Lakeshore & Riverbend", role: "director" }, regions: ["Lakeshore", "Riverbend"], division: "North Ambulatory" },
  { person: { email: `devon.park@${DEMO_DOMAIN}`, fullName: "Devon Park", title: "Director, Northgate", role: "director" }, regions: ["Northgate"], division: "North Ambulatory" },
  { person: { email: `sofia.reyes@${DEMO_DOMAIN}`, fullName: "Sofia Reyes", title: "Director, Midtown & University", role: "director" }, regions: ["Midtown", "University"], division: "Central Ambulatory" },
  { person: { email: `hannah.kim@${DEMO_DOMAIN}`, fullName: "Hannah Kim", title: "Director, Westpark", role: "director" }, regions: ["Westpark"], division: "Central Ambulatory" },
  { person: { email: `ravi.patel@${DEMO_DOMAIN}`, fullName: "Ravi Patel", title: "Director, Harbor & Southfield", role: "director" }, regions: ["Harbor", "Southfield"], division: "South Ambulatory" },
];

// Managers (one per clinic)
const MANAGER_NAMES = [
  "Alicia Reyes", "Marcus Chen", "Priya Singh", "Devon Brooks", "Nia Carter",
  "Owen Schmidt", "Sofia Marino", "Grant Hill", "Hannah Lee", "Theo Park",
  "Lena Ortiz", "Felix Tan", "Rosa Diaz",
];

// ---------- Content pools ----------
const THEMES = [
  "Staffing", "Patient Access", "Scheduling", "Referral Management", "Technology",
  "Facilities", "Safety", "Supplies", "Training", "Provider Retention",
] as const;

const NOTES_POOL = [
  "Staff report consistent delays in room turnover during the morning block.",
  "Team noted intermittent EHR slowness affecting check-in throughput.",
  "Front office raised concerns about patient call-back wait times.",
  "Specialty trays running low; reorder process is unclear to new staff.",
  "Provider mentioned burnout risk from back-to-back double-booked slots.",
  "Referral queue backing up; handoff between PCP and specialty is manual.",
  "Waiting room overflow noted twice this week around midday.",
  "Team flagged a broken exam chair and a leaking hand-washing station.",
  "New MAs need a structured onboarding checklist; current one is informal.",
  "Patient portal adoption is low; staff asked for printed instructions.",
  "Lab result follow-up slips through cracks without a closed-loop process.",
  "Winter staffing crunch: two MAs out, float pool not covering the gap.",
  "Scheduling template does not block enough buffer time for complex visits.",
  "Team praised the new check-in kiosk but it drops insurance scans sometimes.",
];

const ANSWERS = {
  workingWell: [
    "Team morale is solid; staff support each other during surge days.",
    "Recently rolled out a huddle that improved morning start times.",
    "Patient compliments are up since the new front-office greeting script.",
    "Workflow is stable and the team is cross-trained on intake.",
  ],
  barriers: [
    "EHR lag and room turnover are the main throughput barriers.",
    "Float-pool coverage gaps block consistent staffing.",
    "Manual referral entry creates rework and delays.",
  ],
  accessChallenges: [
    "Next-available appointment for new patients is over three weeks out.",
    "Portal self-scheduling not enabled; phones bottleneck access.",
  ],
  workflowConcerns: [
    "Lab result follow-up lacks a closed loop; tasks get lost.",
    "Double-booking pressure creates rushed visits and rework.",
  ],
  safetyConcerns: [
    "Hand hygiene audits dipped this month; reinforcement needed.",
    "Specimen labeling error caught at the last step this week.",
  ],
  leadershipSupport: [
    "Leadership is responsive to supply and staffing requests.",
    "Would value more visible rounding presence from director level.",
  ],
  additionalComments: [
    "Team appreciated the recent recognition board in the break room.",
    "Interested in a process-improvement project around room turnover.",
  ],
};

const INDIVIDUALS = [
  { name: "Dr. Patel", role: "Provider" },
  { name: "Maria Gomez", role: "Clinical Staff" },
  { name: "James Lee", role: "Clinical Staff" },
  { name: "Dana White", role: "Front Office Staff" },
  { name: "Dr. Okafor", role: "Provider" },
  { name: "Sam Rivera", role: "Front Office Staff" },
];

const WINS: { text: string; recognized: string; category: string }[] = [
  { text: "Hit 100% on-time chart closure for the third straight week.", recognized: "Maria Gomez, MA", category: "Process Improvement" },
  { text: "Caught a mislabeled specimen before it left the clinic — patient safety win.", recognized: "James Lee, MA", category: "Safety Catch" },
  { text: "New warm-handoff script cut front-desk complaints in half.", recognized: "Front Office Team", category: "Patient Experience" },
  { text: "Volunteered to train two new hires and built an onboarding checklist.", recognized: "Sam Rivera", category: "Teamwork" },
  { text: "Recognized by a patient family in a handwritten thank-you note.", recognized: "Dr. Okafor", category: "Recognition" },
  { text: "Reorganized supply room and cut tray shortages to zero this month.", recognized: "Dana White", category: "Process Improvement" },
];

const TASK_TITLES: Record<string, [string, string][]> = {
  Staffing: [
    ["Backfill two open MA positions", "Float pool is not covering the gap; recruit and onboard two MAs."],
    ["Build a float-pool coverage plan for holiday weeks", "Define which clinics get priority coverage and a call-out protocol."],
  ],
  "Patient Access": [
    ["Cut new-patient wait time below 3 weeks", "Open template slots and enable portal self-scheduling for low-complexity visits."],
    ["Stand up a call-back queue for portal messages", "Messages are slipping; assign ownership and a 24-hour SLA."],
  ],
  Scheduling: [
    ["Add buffer time to complex-visit templates", "Double-booking is driving rushed visits and rework."],
    ["Audit no-show patterns and add reminders", "No-shows cluster midday; implement a two-step reminder cadence."],
  ],
  "Referral Management": [
    ["Digitize the PCP-to-specialty referral handoff", "Manual entry causes rework and dropped referrals."],
    ["Track referral-to-appointment time as a KPI", "Currently unmeasured; define target and weekly reporting."],
  ],
  Technology: [
    ["Resolve EHR check-in lag with IT", "Intermittent slowness is hurting front-office throughput."],
    ["Fix insurance-scan drops on the kiosk", "Kiosk occasionally drops uploaded insurance images."],
  ],
  Facilities: [
    ["Repair leaking hand-washing station in exam 4", "Placed a work order; follow up on completion."],
    ["Replace broken exam chair in room 2", "Staff using a backup; order replacement."],
  ],
  Safety: [
    ["Reinforce hand-hygiene audits after dip", "Audit compliance fell this month; add daily huddle check."],
    ["Close the loop on specimen labeling near-miss", "Standardize two-person verification at labeling."],
  ],
  Supplies: [
    ["Clarify specialty-tray reorder process", "New staff unsure how to reorder; document and post."],
    ["Set par levels for high-use consumables", "Stockouts recurring; establish par levels and weekly counts."],
  ],
  Training: [
    ["Build a structured MA onboarding checklist", "Onboarding is informal; create and standardize a checklist."],
    ["Roll out patient-portal instruction cards", "Adoption is low; print and distribute step-by-step cards."],
  ],
  "Provider Retention": [
    ["Review double-booking load with providers", "Burnout risk flagged; rebalance templates for next quarter."],
    ["Plan recognition and growth path for senior MAs", "Retention feedback cited limited advancement visibility."],
  ],
};

const PRIORITIES = ["low", "medium", "medium", "high", "critical"] as const;

// ---------- Idempotency helpers ----------
async function listDemoUserIds(sa: SupabaseAdmin): Promise<string[]> {
  const ids: string[] = [];
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const { data } = await sa.auth.admin.listUsers({ page, perPage: 1000 });
    const users = data?.users ?? [];
    for (const u of users) if (u.email?.endsWith(`@${DEMO_DOMAIN}`)) ids.push(u.id);
    hasMore = users.length === 1000;
    page++;
  }
  return ids;
}

/** Remove every demo row (tagged via @rnr-demo.org email + clinic membership). */
export async function clearDemoData(sa: SupabaseAdmin): Promise<{ cleared: boolean }> {
  const demoUserIds = await listDemoUserIds(sa);

  // Demo clinics = clinics that have any assignment to a demo user.
  let demoClinicIds: string[] = [];
  if (demoUserIds.length) {
    const { data: assigns } = await sa
      .from("clinic_assignments")
      .select("clinic_id")
      .in("user_id", demoUserIds);
    demoClinicIds = [...new Set((assigns ?? []).map((a) => a.clinic_id))];
  }

  // Deleting clinics cascades rounds/findings/wins/tasks/task_events/assignments.
  if (demoClinicIds.length) {
    await sa.from("clinics").delete().in("id", demoClinicIds);
  }
  // Reports owned by demo users cascade their children.
  if (demoUserIds.length) {
    await sa.from("reports").delete().in("user_id", demoUserIds);
    await sa.from("pending_users").delete().in("user_id", demoUserIds);
  }
  // Finally remove demo auth accounts (cascades profiles, user_roles, assignments).
  for (const id of demoUserIds) {
    try {
      await sa.auth.admin.deleteUser(id);
    } catch {
      /* ignore */
    }
  }
  return { cleared: true };
}

export async function getDemoStatus(sa: SupabaseAdmin): Promise<{
  loaded: boolean;
  users: number;
  clinics: number;
  tasks: number;
  rounds: number;
}> {
  const demoUserIds = await listDemoUserIds(sa);
  let clinics = 0;
  let tasks = 0;
  let rounds = 0;
  if (demoUserIds.length) {
    const { data: assigns } = await sa
      .from("clinic_assignments")
      .select("clinic_id")
      .in("user_id", demoUserIds);
    const clinicIds = [...new Set((assigns ?? []).map((a) => a.clinic_id))];
    clinics = clinicIds.length;
    if (clinicIds.length) {
      const { count: tc } = await sa
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .in("clinic_id", clinicIds);
      const { count: rc } = await sa
        .from("rounds")
        .select("id", { count: "exact", head: true })
        .in("clinic_id", clinicIds);
      tasks = tc ?? 0;
      rounds = rc ?? 0;
    }
  }
  return { loaded: demoUserIds.length > 0, users: demoUserIds.length, clinics, tasks, rounds };
}

// ---------- Seed ----------
async function ensureUser(sa: SupabaseAdmin, p: SeedPerson): Promise<string> {
  // createUser triggers handle_new_profile, inserting a profile row.
  const { data, error } = await sa.auth.admin.createUser({
    email: p.email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: p.fullName },
  });
  if (data?.user) return data.user.id;
  // Already exists — look it up.
  if (error) {
    const { data: list } = await sa.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const found = (list?.users ?? []).find((u) => u.email === p.email);
    if (found) return found.id;
    throw new Error(`Failed to create demo user ${p.email}: ${error.message}`);
  }
  throw new Error(`Failed to create demo user ${p.email}`);
}

async function insertRole(sa: SupabaseAdmin, userId: string, role: SeedPerson["role"]) {
  await sa.from("user_roles").upsert(
    { user_id: userId, role },
    { onConflict: "user_id,role" },
  );
}

export async function seedDemoData(sa: SupabaseAdmin): Promise<{
  users: number;
  clinics: number;
  rounds: number;
  tasks: number;
}> {
  await clearDemoData(sa);

  // ---- People ----
  const edIds: string[] = [];
  for (const ed of EDS) edIds.push(await ensureUser(sa, ed));
  for (let i = 0; i < EDS.length; i++) {
    await sa.from("profiles").upsert({ user_id: edIds[i], full_name: EDS[i].fullName, title: EDS[i].title });
    await insertRole(sa, edIds[i], EDS[i].role);
  }

  const dirByDivision: Record<string, { id: string; regions: string[] }>[] = [];
  const directorIds: string[] = [];
  for (const d of DIRECTORS) {
    const id = await ensureUser(sa, d.person);
    directorIds.push(id);
    await sa.from("profiles").upsert({ user_id: id, full_name: d.person.fullName, title: d.person.title });
    await insertRole(sa, id, d.person.role);
    dirByDivision.push({ [d.division]: { id, regions: d.regions } });
  }
  const directorFor = (division: string, region: string): string => {
    const entry = dirByDivision.find((d) => d[division]);
    return entry?.[division]?.regions.includes(region) ? entry[division].id : "";
  };
  const edFor = (division: string): string => edIds[DIVISIONS.indexOf(division)];

  const managerIds: string[] = [];
  for (let i = 0; i < CLINICS.length; i++) {
    const name = MANAGER_NAMES[i % MANAGER_NAMES.length];
    const p: SeedPerson = {
      email: `${slug(name)}@${DEMO_DOMAIN}`,
      fullName: name,
      title: `Manager, ${CLINICS[i].name}`,
      role: "manager",
    };
    const id = await ensureUser(sa, p);
    managerIds.push(id);
    await sa.from("profiles").upsert({ user_id: id, full_name: p.fullName, title: p.title });
    await insertRole(sa, id, p.role);
  }

  // ---- Clinics + assignments ----
  const clinicIds: string[] = [];
  for (let i = 0; i < CLINICS.length; i++) {
    const c = CLINICS[i];
    const { data, error } = await sa
      .from("clinics")
      .insert({
        name: c.name,
        specialty: c.specialty,
        location: c.site,
        region: c.region,
        division: c.division,
        provider_count: c.providers,
        staff_count: c.staff,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`Failed to create clinic ${c.name}: ${error?.message}`);
    const clinicId = data.id;
    clinicIds.push(clinicId);

    const assignments = [
      { clinic_id: clinicId, user_id: managerIds[i], role: "manager" },
      { clinic_id: clinicId, user_id: directorFor(c.division, c.region), role: "director" },
      { clinic_id: clinicId, user_id: edFor(c.division), role: "executive_director" },
    ].filter((a) => a.user_id);
    await sa.from("clinic_assignments").insert(assignments as never);
  }

  // ---- Rounds ----
  const roundIdsByClinic: string[][] = CLINICS.map(() => []);
  let roundsCount = 0;
  for (let i = 0; i < CLINICS.length; i++) {
    const clinicId = clinicIds[i];
    const leaderId = managerIds[i];
    const offsets = shuffle([4, 17, 31, 46]).slice(0, int(3, 4));
    for (const off of offsets) {
      const ind = pick(INDIVIDUALS);
      const themes = shuffle([...THEMES]).slice(0, int(1, 3));
      const safety = rng() < 0.18;
      const isOpen = off <= 5;
      const answers: Record<string, string> = {
        workingWell: pick(ANSWERS.workingWell),
        barriers: pick(ANSWERS.barriers),
        accessChallenges: pick(ANSWERS.accessChallenges),
        workflowConcerns: pick(ANSWERS.workflowConcerns),
        safetyConcerns: safety ? pick(ANSWERS.safetyConcerns) : "",
        leadershipSupport: pick(ANSWERS.leadershipSupport),
        additionalComments: pick(ANSWERS.additionalComments),
      };
      const { data: rrow, error: rerr } = await sa
        .from("rounds")
        .insert({
          clinic_id: clinicId,
          leader_id: leaderId,
          round_date: daysAgoDate(off),
          status: isOpen ? "open" : "closed",
          individual: ind.name,
          individual_role: ind.role,
          notes: pick(NOTES_POOL),
          answers: answers as never,
          themes,
          safety_flag: safety,
        })
        .select("id")
        .single();
      if (rerr || !rrow) throw new Error(`Failed to create round: ${rerr?.message}`);
      const roundId = rrow.id;
      roundIdsByClinic[i].push(roundId);
      roundsCount++;

      await sa.from("round_findings").insert(
        themes.map((theme) => ({
          round_id: roundId,
          theme,
          severity: safety && theme === "Safety" ? "high" : pick(["low", "moderate", "moderate", "high"]),
          finding_text: pick(NOTES_POOL),
        })) as never,
      );

      if (rng() < 0.45) {
        const win = pick(WINS);
        await sa.from("round_wins").insert({
          round_id: roundId,
          win_text: win.text,
          recognized_person: win.recognized,
          category: win.category,
        } as never);
      }
    }
  }

  // ---- PX report (completed, linked to a clinic) ----
  const pxClinicIndex = 6; // Gastroenterology – Midtown
  const pxClinicId = clinicIds[pxClinicIndex];
  const { data: adminRow } = await sa
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin")
    .limit(1);
  const reportOwner = adminRow?.[0]?.user_id ?? managerIds[pxClinicIndex];
  const { data: repRow, error: repErr } = await sa
    .from("reports")
    .insert({
      user_id: reportOwner,
      clinic_id: pxClinicId,
      site_name: "Gastroenterology – Midtown",
      facility_name: "Midtown Ambulatory Center",
      service_line: "Gastroenterology",
      time_frame: "Q2 2026",
      overall_top_box: 88.4,
      overall_percentile: 72,
      n: 312,
      trends: [
        { period: "Q4 2025", n: 298, top_box: 84.1, percentile: 61 },
        { period: "Q1 2026", n: 305, top_box: 86.0, percentile: 66 },
        { period: "Q2 2026", n: 312, top_box: 88.4, percentile: 72 },
      ] as never,
      raw_extraction: {} as never,
      exec_summary:
        "Gastroenterology – Midtown improved top-box to 88.4% (72nd percentile) this quarter. Access and communication are the strongest drivers; wait-time and front-office courtesy are the top opportunities.",
      insights: [
        { type: "strength", text: "Access to care scores above the 80th percentile." },
        { type: "opportunity", text: "Front-office courtesy dropped 4 points this quarter." },
      ] as never,
      status: "completed",
    })
    .select("id")
    .single();
  if (repErr || !repRow) throw new Error(`Failed to create PX report: ${repErr?.message}`);
  const reportId = repRow.id;

  await sa.from("report_sections").insert(
    [
      { report_id: reportId, name: "Access to Care", n: 312, top_box: 91.2, percentile: 84 },
      { report_id: reportId, name: "Front-Office Courtesy", n: 308, top_box: 79.5, percentile: 48 },
      { report_id: reportId, name: "Wait Time", n: 300, top_box: 76.1, percentile: 41 },
      { report_id: reportId, name: "Provider Communication", n: 311, top_box: 92.0, percentile: 78 },
      { report_id: reportId, name: "Care Coordination", n: 290, top_box: 85.3, percentile: 69 },
      { report_id: reportId, name: "Overall Visit", n: 312, top_box: 88.4, percentile: 72 },
    ] as never,
  );
  await sa.from("report_providers").insert(
    [
      { report_id: reportId, name: "Dr. A. Chen", n: 104, top_box: 94.1, percentile: 86, tier: "Top" },
      { report_id: reportId, name: "Dr. B. Okafor", n: 88, top_box: 90.0, percentile: 74, tier: "Top" },
      { report_id: reportId, name: "Dr. C. Rivera", n: 70, top_box: 82.0, percentile: 52, tier: "Watch" },
      { report_id: reportId, name: "Dr. D. Miles", n: 50, top_box: 74.0, percentile: 33, tier: "Improve" },
    ] as never,
  );
  await sa.from("report_priority_index").insert(
    [
      { report_id: reportId, rank: 1, question: "Wait time at this visit", percentile: 41, correlation: 0.62 },
      { report_id: reportId, rank: 2, question: "Front-office courtesy", percentile: 48, correlation: 0.55 },
      { report_id: reportId, rank: 3, question: "Ease of scheduling", percentile: 58, correlation: 0.47 },
      { report_id: reportId, rank: 4, question: "Information about delays", percentile: 52, correlation: 0.44 },
      { report_id: reportId, rank: 5, question: "Care coordination", percentile: 69, correlation: 0.39 },
      { report_id: reportId, rank: 6, question: "Provider communication", percentile: 78, correlation: 0.36 },
    ] as never,
  );
  const oppRows = [
    { rank: 1, title: "Reduce visit wait time", opp_type: "process", reason: "Wait time is the top driver and sits at the 41st percentile.", target_metric: "Wait time top-box", current_value: 76.1, target_value: 86, goal: "Lift wait-time top-box above 86% within two quarters.", drivers: ["Room turnover", "Double-booking"] as never, timeline_30: "Audit room-turnover workflow and post standard steps.", timeline_60: "Pilot a midday huddle and buffer slots.", timeline_90: "Measure wait time and adjust templates.", owner_role: "manager", actions: ["Add buffer slots", "Daily huddle"] as never },
    { rank: 2, title: "Improve front-office courtesy", opp_type: "service", reason: "Courtesy dropped 4 points; front office is the first touchpoint.", target_metric: "Courtesy top-box", current_value: 79.5, target_value: 88, goal: "Restore courtesy scores to the 70th percentile.", drivers: ["Greeting script", "Phone etiquette"] as never, timeline_30: "Refresh greeting and phone scripts.", timeline_60: "Coach two lowest performers with shadowing.", timeline_90: "Re-survey and recognize gains.", owner_role: "manager", actions: ["Refresh scripts", "Shadowing"] as never },
    { rank: 3, title: "Coach the lowest-performing provider", opp_type: "coaching", reason: "One provider sits at the 33rd percentile with a meaningful gap.", target_metric: "Provider communication top-box", current_value: 74.0, target_value: 85, goal: "Lift provider to the 60th percentile via structured coaching.", drivers: ["Bedside manner", "Wait communication"] as never, timeline_30: "Shadow and baseline gap.", timeline_60: "Introduce scripts and checkpoints.", timeline_90: "Re-measure and reassess.", owner_role: "director", actions: ["Shadow visit", "Scripts", "Checkpoint"] as never },
  ];
  const { data: insertedOpps } = await sa.from("opportunities").insert(oppRows as never).select("id, rank");
  await sa.from("coaching_plans").insert({
    report_id: reportId,
    provider_name: "Dr. D. Miles",
    gap_summary: "Wait-time communication and bedside manner gaps pulling the provider to the 33rd percentile.",
    shadow_recommendation: "Shadow three visits focused on wait communication and visit framing.",
    scripts: ["Acknowledge wait at check-in", "Set expectations mid-visit"] as never,
    checkpoints: ["Week 2: shadow recap", "Week 6: re-survey"] as never,
  } as never);

  // ---- Tasks (~70) ----
  // Build a fixed distribution to guarantee ladder/status visibility.
  const escalations = shuffle([
    ...Array(28).fill("manager"),
    ...Array(35).fill("director"),
    ...Array(7).fill("executive"),
  ]);
  const statuses = shuffle([
    ...Array(22).fill("open"),
    ...Array(15).fill("in_progress"),
    ...Array(8).fill("pending_validation"),
    ...Array(18).fill("closed"),
    ...Array(7).fill("reopened"),
  ]);
  let tasksCount = 0;
  const total = 70;
  // PX-opportunity tasks for the report's clinic
  const pxOpps = (insertedOpps ?? []).slice(0, 2);

  for (let t = 0; t < total; t++) {
    const ci = t % CLINICS.length;
    const clinicId = clinicIds[ci];
    const theme = THEMES[t % THEMES.length];
    const titlePool = TASK_TITLES[theme] ?? TASK_TITLES.Staffing;
    const [title, desc] = titlePool[t % titlePool.length];
    const esc = escalations[t] as "manager" | "director" | "executive";
    const status = statuses[t] as string;
    const ageDays = int(3, 110);
    const priority = pick(PRIORITIES) as string;
    const safety = rng() < 0.16;

    let source = "manual";
    let sourceId: string | null = null;
    let reportRef: string | null = null;
    if (ci === pxClinicIndex && pxOpps.length && t < pxOpps.length * 3) {
      source = "px_opportunity";
      const opp = pxOpps[t % pxOpps.length];
      sourceId = opp.id;
      reportRef = reportId;
    } else if (roundIdsByClinic[ci].length && rng() < 0.7) {
      source = "round_finding";
      sourceId = pick(roundIdsByClinic[ci]);
    }

    const closed = status === "closed";
    const dueDate = closed ? daysAgoDate(int(0, ageDays - 1)) : daysAheadDate(int(3, 30));

    const { data: taskRow, error: taskErr } = await sa
      .from("tasks")
      .insert({
        clinic_id: clinicId,
        source,
        source_id: sourceId,
        report_id: reportRef,
        name: title,
        description: desc,
        theme,
        owner_id: managerIds[ci],
        due_date: dueDate,
        status,
        escalation_level: esc,
        priority,
        safety_related: safety,
        closed_at: closed ? daysAgoIso(int(0, ageDays - 1)) : null,
        created_at: daysAgoIso(ageDays),
      })
      .select("id, created_at")
      .single();
    if (taskErr || !taskRow) throw new Error(`Failed to create task: ${taskErr?.message}`);
    tasksCount++;

    // task_events: created + a transition for non-open items
    const events: Record<string, unknown>[] = [
      {
        task_id: taskRow.id,
        event_type: "created",
        to_status: "open",
        actor_id: managerIds[ci],
        note: "Identified during rounding.",
        created_at: daysAgoIso(ageDays),
      },
    ];
    if (status !== "open") {
      const fromStatus = status === "closed" ? "in_progress" : "open";
      events.push({
        task_id: taskRow.id,
        event_type: "status_change",
        from_status: fromStatus,
        to_status: status,
        actor_id: esc === "manager" ? managerIds[ci] : directorFor(CLINICS[ci].division, CLINICS[ci].region),
        note: status === "closed" ? "Resolved and validated." : "Moved forward in the pipeline.",
        created_at: daysAgoIso(int(1, Math.max(1, ageDays - 1))),
      });
    }
    if (esc !== "manager") {
      events.push({
        task_id: taskRow.id,
        event_type: "escalation",
        from_level: "manager",
        to_level: esc,
        actor_id: managerIds[ci],
        note: esc === "executive" ? "Aged past Director threshold; escalated." : "Escalated to Director for support.",
        created_at: daysAgoIso(int(2, Math.max(2, ageDays - 1))),
      });
    }
    await sa.from("task_events").insert(events as never);
  }

  return {
    users: EDS.length + DIRECTORS.length + MANAGER_NAMES.length,
    clinics: CLINICS.length,
    rounds: roundsCount,
    tasks: tasksCount,
  };
}
