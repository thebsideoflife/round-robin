/**
 * @deprecated Replaced by the unified Today route.
 *
 * The four role-specific dashboards (Manager / Director / ExecutiveDirector /
 * Cao) were ~690 lines of near-duplicate roll-up markup. They are now a single
 * role-adaptive drilldown driven by the org graph. This file only remains as a
 * redirect for any straggling import and can be deleted once none are left.
 */
export { OrgDrilldown } from "@/components/org-overview";
export { StatusBadge as StatusLegend } from "@/components/status";
