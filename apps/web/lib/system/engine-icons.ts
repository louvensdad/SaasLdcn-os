import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  BookOpen,
  BookText,
  Box,
  Boxes,
  Brain,
  CheckCheck,
  ClipboardCheck,
  ClipboardList,
  Cog,
  Compass,
  Cpu,
  DraftingCompass,
  Download,
  FileCode2,
  FileSearch,
  FileSignature,
  FileText,
  FolderCog,
  FolderSearch,
  GalleryVerticalEnd,
  Gauge,
  GitBranch,
  GitGraph,
  Globe,
  LayoutTemplate,
  Library,
  Lightbulb,
  ListChecks,
  Map as MapIcon,
  Microscope,
  MonitorCheck,
  Network,
  PackageCheck,
  RefreshCw,
  Rocket,
  ScanLine,
  SearchCode,
  Send,
  Server,
  ServerCog,
  Shapes,
  ShieldCheck,
  ShieldHalf,
  Share2,
  Sparkles,
  Tags,
  Target,
  TestTube,
  Users,
  Webhook,
  Workflow,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

export type SystemCategory = 'modules' | 'engines' | 'templates' | 'skills';

const MODULE_ICONS: Record<string, LucideIcon> = {
  api: Webhook,
  web: Globe,
  contracts: FileSignature,
  templates: LayoutTemplate,
  reports: BarChart3,
};

const ENGINE_ICONS: Record<string, LucideIcon> = {
  architect_engine: Compass,
  architectural_graph_engine: Network,
  auto_repair_engine: Wrench,
  backend_generation_engine: Server,
  blueprint_engine: DraftingCompass,
  codebase_analysis_engine: SearchCode,
  completeness_review_engine: ClipboardCheck,
  dependency_graph_engine: Workflow,
  engineering_readiness_engine: Gauge,
  gatekeeper_engine: ShieldHalf,
  generated_project_quality_engine: BadgeCheck,
  generation_handoff_engine: Send,
  generation_validation_engine: CheckCheck,
  git_export_engine: GitBranch,
  local_generation_engine: Cpu,
  modernization_engine: RefreshCw,
  modernization_plan_engine: ListChecks,
  modernize_analysis_engine: Microscope,
  orchestrator_engine: Cog,
  project_requirements_engine: ClipboardList,
  prompt_master_engine: Brain,
  prompt_master_md_engine: FileText,
  quality_gate_engine: ShieldCheck,
  roadmap_engine: MapIcon,
  skill_execution_engine: Sparkles,
  skill_registry_engine: BookOpen,
  system_design_visualization_engine: Shapes,
  system_status_engine: Activity,
  template_metadata_engine: Tags,
  template_registry_engine: Library,
  verification_engine: TestTube,
};

const TEMPLATE_ICONS: Record<string, LucideIcon> = {
  'docs-site': BookText,
  'landing-page': Rocket,
  portfolio: GalleryVerticalEnd,
  'static-site': FileCode2,
};

const SKILL_ICONS: Record<string, LucideIcon> = {
  analyze_readiness: Target,
  analyze_risks: AlertTriangle,
  inspect_architecture: ScanLine,
  inspect_architecture_graph: Share2,
  inspect_graph: GitGraph,
  review_blueprint: FileSearch,
  generate_local_project: FolderCog,
  inspect_generated_files: FolderSearch,
  prepare_download: Download,
  prepare_handoff: PackageCheck,
  estimate_team: Users,
  recommend_architecture: Lightbulb,
  recommend_framework: Boxes,
  diagnose_backend: ServerCog,
  diagnose_frontend: MonitorCheck,
  inspect_templates: LayoutTemplate,
};

const ICONS_BY_CATEGORY: Record<SystemCategory, Record<string, LucideIcon>> = {
  modules: MODULE_ICONS,
  engines: ENGINE_ICONS,
  templates: TEMPLATE_ICONS,
  skills: SKILL_ICONS,
};

const DEFAULT_ICON: Record<SystemCategory, LucideIcon> = {
  modules: Box,
  engines: Cog,
  templates: LayoutTemplate,
  skills: Sparkles,
};

/** Tint per category (drives the icon container background). Token-driven so it
 * stays in the Engineering Runtime palette. */
export const CATEGORY_COLOR: Record<SystemCategory, string> = {
  modules: 'var(--accent-2)',
  engines: 'var(--accent)',
  templates: 'var(--success)',
  skills: 'var(--accent-2)',
};

/** Returns the specific icon for an item, falling back to the category default
 * so an unknown id never renders without an icon. */
export function getSystemIcon(category: SystemCategory, id: string): LucideIcon {
  return ICONS_BY_CATEGORY[category][id] ?? DEFAULT_ICON[category];
}

/** Canonical list per category — used as a resilient fallback so the grid still
 * renders the known systems (as "unavailable") when the status API is down. */
export const SYSTEM_CATALOG: Record<SystemCategory, readonly string[]> = {
  modules: ['api', 'web', 'contracts', 'templates', 'reports'],
  engines: Object.keys(ENGINE_ICONS),
  templates: ['docs-site', 'landing-page', 'portfolio', 'static-site'],
  skills: Object.keys(SKILL_ICONS),
};
