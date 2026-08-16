import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type {
  AppData,
  EscalationLevel,
  Person,
  Round,
  Task,
  TaskPriority,
  TaskStatus,
} from "@/data/types";
import { buildScope, type Scope } from "@/lib/domain/permissions";
import type { OrgGraph } from "@/lib/domain/org";
import { getScope } from "@/lib/clinics.functions";
import { createRound as createRoundFn, closeRound as closeRoundFn } from "@/lib/rounds.functions";
import {
  createTask as createTaskFn,
  updateTaskStatus as updateTaskStatusFn,
  updateTask as updateTaskFn,
  setEscalation as setEscalationFn,
  closeTask as closeTaskFn,
  validateTask as validateTaskFn,
} from "@/lib/tasks.functions";
import { listEscalationSettings } from "@/lib/settings.functions";
import {
  DEFAULT_ESCALATION_SETTINGS,
  settingsFor,
  type EscalationSettings,
} from "@/lib/domain/policy";

const SCOPE_KEY = ["scope"] as const;

interface StoreValue {
  data: AppData;
  currentUser: Person;
  /** The actually signed-in user (unchanged by the "View as role" switcher). */
  realUser: Person;
  /** People an admin/CAO may preview the app as. */
  viewAsOptions: Person[];
  viewAsId: string | null;
  setViewAsId: (id: string | null) => void;
  canViewAs: boolean;
  /** True when the signed-in account holds the admin role. */
  isAdmin: boolean;
  isViewingAs: boolean;
  scope: Scope;
  /** Org graph for the loaded dataset (top-down rollup + bottom-up routing). */
  graph: OrgGraph;
  /** Escalation thresholds, per division, with the system default included. */
  escalationSettings: EscalationSettings[];
  /** The thresholds that apply to a given clinic. */
  settingsForClinic: (clinicId: string) => EscalationSettings;
  /** Owner marks work done; it moves to Pending validation. */
  closeTask: (id: string, note?: string) => Promise<void>;
  /** Someone else confirms or rejects the claimed fix. */
  validateTask: (id: string, confirmed: boolean, note?: string) => Promise<void>;
  today: Date;
  isLoading: boolean;
  personById: (id: string) => Person | undefined;
  clinicById: (id: string) => AppData["clinics"][number] | undefined;
  addRound: (round: Omit<Round, "id">) => Promise<Round>;
  addTask: (task: Omit<Task, "id" | "validationHistory">) => Promise<Task>;
  updateTaskStatus: (
    id: string,
    status: TaskStatus,
    note?: string,
    roundId?: string,
  ) => Promise<void>;
  updateTask: (id: string, patch: Partial<Task>) => Promise<void>;
  setEscalation: (
    id: string,
    level: EscalationLevel,
    overridden: boolean,
    reason?: string,
  ) => Promise<void>;
}


const EMPTY_DATA: AppData = { people: [], clinics: [], rounds: [], tasks: [] };

const ROLE_RANK: Record<Person["role"], number> = {
  manager: 0,
  director: 1,
  executive_director: 2,
  cao: 3,
};


const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const fetchScope = useServerFn(getScope);
  const doCreateRound = useServerFn(createRoundFn);
  const doCloseRound = useServerFn(closeRoundFn);
  const doCreateTask = useServerFn(createTaskFn);
  const doUpdateTaskStatus = useServerFn(updateTaskStatusFn);
  const doUpdateTask = useServerFn(updateTaskFn);
  const doSetEscalation = useServerFn(setEscalationFn);

  const query = useQuery({
    queryKey: SCOPE_KEY,
    queryFn: () => fetchScope(),
  });

  const fetchSettings = useServerFn(listEscalationSettings);
  const settingsQuery = useQuery({
    queryKey: ["escalation-settings"],
    queryFn: () => fetchSettings(),
    // Thresholds change rarely; no need to refetch them constantly.
    staleTime: 5 * 60_000,
  });
  const escalationSettings = settingsQuery.data ?? [DEFAULT_ESCALATION_SETTINGS];

  const data: AppData = query.data?.data ?? EMPTY_DATA;
  const realUser: Person = query.data?.currentUser ?? {
    id: "",
    name: "",
    title: "",
    role: "manager",
  };

  const [viewAsId, setViewAsId] = useState<string | null>(null);
  // Admin is its own role. A CAO sees every clinic but doesn't necessarily
  // administer accounts, so the two gates are kept separate.
  const isAdmin = query.data?.isAdmin === true;
  const canViewAs = isAdmin || realUser.role === "cao";
  const viewAsOptions = useMemo(
    () =>
      canViewAs
        ? data.people
            .filter((p) => p.id !== realUser.id)
            .slice()
            .sort(
              (a, b) =>
                ROLE_RANK[b.role] - ROLE_RANK[a.role] || a.name.localeCompare(b.name),
            )
        : [],
    [canViewAs, data.people, realUser.id],
  );
  const viewAs = canViewAs && viewAsId ? data.people.find((p) => p.id === viewAsId) : undefined;
  const currentUser = viewAs ?? realUser;
  const scope = useMemo(() => buildScope(data, currentUser), [data, currentUser]);


  const invalidate = useCallback(
    () => qc.invalidateQueries({ queryKey: SCOPE_KEY }),
    [qc],
  );

  const addRound = useCallback(
    async (round: Omit<Round, "id">) => {
      const { round: created } = await doCreateRound({ data: round as never });
      void invalidate();
      return created;
    },
    [doCreateRound, invalidate],
  );

  const addTask = useCallback(
    async (task: Omit<Task, "id" | "validationHistory">) => {
      const { task: created } = await doCreateTask({ data: task as never });
      void invalidate();
      return created;
    },
    [doCreateTask, invalidate],
  );

  const updateTaskStatus = useCallback(
    async (id: string, status: TaskStatus, note?: string, roundId?: string) => {
      await doUpdateTaskStatus({ data: { id, status, note, roundId } });
      void invalidate();
    },
    [doUpdateTaskStatus, invalidate],
  );

  const updateTask = useCallback(
    async (id: string, patch: Partial<Task>) => {
      await doUpdateTask({ data: { id, ...patch } as never });
      void invalidate();
    },
    [doUpdateTask, invalidate],
  );

  const doCloseTask = useServerFn(closeTaskFn);
  const doValidateTask = useServerFn(validateTaskFn);

  const closeTask = useCallback(
    async (id: string, note?: string) => {
      await doCloseTask({ data: { id, note } });
      void invalidate();
    },
    [doCloseTask, invalidate],
  );

  const validateTask = useCallback(
    async (id: string, confirmed: boolean, note?: string) => {
      await doValidateTask({ data: { id, confirmed, note } });
      void invalidate();
    },
    [doValidateTask, invalidate],
  );

  const setEscalation = useCallback(
    async (
      id: string,
      level: EscalationLevel,
      _overridden: boolean,
      reason?: string,
    ) => {
      await doSetEscalation({ data: { id, level, reason } });
      void invalidate();
    },
    [doSetEscalation, invalidate],
  );

  const value: StoreValue = {
    data,
    currentUser,
    realUser,
    viewAsOptions,
    viewAsId: canViewAs ? viewAsId : null,
    setViewAsId,
    canViewAs,
    isAdmin,
    isViewingAs: !!viewAs,
    scope,
    graph: scope.graph,
    escalationSettings,
    settingsForClinic: (clinicId: string) =>
      settingsFor(escalationSettings, data.clinics.find((c) => c.id === clinicId)?.division),
    closeTask,
    validateTask,

    today: new Date(),
    isLoading: query.isLoading,
    personById: (id) => data.people.find((p) => p.id === id),
    clinicById: (id) => data.clinics.find((c) => c.id === id),
    addRound,
    addTask,
    updateTaskStatus,
    updateTask,
    setEscalation,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}

export { closeRoundFn as closeRoundServerFn };
export type { TaskPriority };
