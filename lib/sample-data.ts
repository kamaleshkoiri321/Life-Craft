export interface SampleTask {
  id: string;
  title: string;
  category: 'Study' | 'Personal' | 'Career' | 'Wellness';
  timeBlock: string;
  completed: boolean;
  attachment?: string;
}

export interface SampleHabit {
  id: string;
  name: string;
  cadence: string;
  streakDays: number;
  weekDays: boolean[]; // Mon -> Sun (7 days)
}

export interface WeeklyProgressPoint {
  day: string;
  tasksCompleted: number;
  tasksPlanned: number;
  focusMinutes: number;
}

export interface SampleGoal {
  id: string;
  title: string;
  horizon: string;
  progressPercent: number;
  nextMilestone: string;
}

export interface SampleNote {
  id: string;
  title: string;
  type: 'Note' | 'Book PDF' | 'Journal';
  updatedAt: string;
  meta: string;
}

export interface CoreFeature {
  id: string;
  number: string;
  title: string;
  description: string;
  detail: string;
  imageSrc: string;
  imageAlt: string;
  highlights: string[];
}

export interface WorkflowStep {
  stepNumber: string;
  title: string;
  description: string;
  exampleContext: string;
  imageSrc: string;
  imageAlt: string;
}

export const INITIAL_SAMPLE_TASKS: SampleTask[] = [
  {
    id: 'task-1',
    title: 'Review cognitive psychology seminar notes (Ch. 4)',
    category: 'Study',
    timeBlock: '09:30',
    completed: true,
    attachment: 'CogPsych_Ch4_Notes.pdf',
  },
  {
    id: 'task-2',
    title: 'Finalize portfolio case study layout before afternoon critique',
    category: 'Career',
    timeBlock: '11:00',
    completed: true,
  },
  {
    id: 'task-3',
    title: 'Draft weekly reflection & reading synthesis',
    category: 'Personal',
    timeBlock: '14:30',
    completed: false,
    attachment: 'Deep_Work_Excerpts.pdf',
  },
  {
    id: 'task-4',
    title: 'Prepare meal prep grocery list for the week',
    category: 'Wellness',
    timeBlock: '17:30',
    completed: false,
  },
  {
    id: 'task-5',
    title: 'Outline internship application cover letter',
    category: 'Career',
    timeBlock: '19:00',
    completed: false,
  },
];

export const INITIAL_SAMPLE_HABITS: SampleHabit[] = [
  {
    id: 'habit-1',
    name: '25m morning reading before phone',
    cadence: 'Daily',
    streakDays: 6,
    weekDays: [true, true, true, true, true, false, true],
  },
  {
    id: 'habit-2',
    name: 'Evening journal & tomorrow top 3',
    cadence: 'Weekdays',
    streakDays: 4,
    weekDays: [true, true, false, true, true, false, false],
  },
  {
    id: 'habit-3',
    name: 'Hydration & 30m outdoor walk',
    cadence: 'Daily',
    streakDays: 5,
    weekDays: [true, true, true, true, true, false, false],
  },
];

export const SAMPLE_WEEKLY_PROGRESS: WeeklyProgressPoint[] = [
  { day: 'Mon', tasksCompleted: 5, tasksPlanned: 6, focusMinutes: 110 },
  { day: 'Tue', tasksCompleted: 6, tasksPlanned: 6, focusMinutes: 135 },
  { day: 'Wed', tasksCompleted: 4, tasksPlanned: 5, focusMinutes: 95 },
  { day: 'Thu', tasksCompleted: 5, tasksPlanned: 5, focusMinutes: 125 },
  { day: 'Fri', tasksCompleted: 2, tasksPlanned: 5, focusMinutes: 65 },
  { day: 'Sat', tasksCompleted: 0, tasksPlanned: 3, focusMinutes: 0 },
  { day: 'Sun', tasksCompleted: 0, tasksPlanned: 2, focusMinutes: 0 },
];

export const SAMPLE_UPCOMING_GOALS: SampleGoal[] = [
  {
    id: 'goal-1',
    title: 'Ship Spring UX Design Portfolio',
    horizon: 'Target · Nov 18',
    progressPercent: 68,
    nextMilestone: 'Complete mobile prototype walkthrough',
  },
  {
    id: 'goal-2',
    title: 'Read 12 Non-Fiction Books This Year',
    horizon: 'Target · Dec 31',
    progressPercent: 75,
    nextMilestone: 'Finish chapter 8 of The Creative Act',
  },
  {
    id: 'goal-3',
    title: 'Build Emergency Savings Buffer',
    horizon: 'Target · Jan 15',
    progressPercent: 52,
    nextMilestone: 'Automate monthly transfer from stipend',
  },
];

export const SAMPLE_NOTES_AND_FILES: SampleNote[] = [
  {
    id: 'note-1',
    title: 'Reading notes: Designing Calm Technology',
    type: 'Book PDF',
    updatedAt: 'Today · 08:45',
    meta: 'PDF attachment · 4.2 MB · Page 42 bookmarked',
  },
  {
    id: 'note-2',
    title: 'October evening reflection & energy log',
    type: 'Journal',
    updatedAt: 'Yesterday',
    meta: 'Personal journal · 480 words',
  },
  {
    id: 'note-3',
    title: 'Semester exam study schedule & key formulas',
    type: 'Note',
    updatedAt: 'Oct 22',
    meta: 'Linked to 3 tasks · 2 PDF handouts',
  },
];

export const CORE_FEATURES: CoreFeature[] = [
  {
    id: 'plan-day',
    number: '01',
    title: 'Plan your day',
    description:
      'Map out daily priorities alongside classes, deep work blocks, and personal errands without clutter.',
    detail:
      'Group tasks by context, set gentle time intentions, and focus on what actually fits into a single day.',
    imageSrc: '/images/feature-plan-day.jpg',
    imageAlt:
      'Close-up of a student writing daily priorities and checkboxes in a paper planner',
    highlights: [
      'Focused daily agenda with realistic time blocks',
      'Clear separation between must-do priorities and backlog',
      'Quick keyboard-friendly capture when new tasks come up',
    ],
  },
  {
    id: 'build-habits',
    number: '02',
    title: 'Build better habits',
    description:
      'Turn small daily intentions, like reading, movement, or evening planning, into steady routines.',
    detail:
      'Flexible weekly check-ins designed for real schedules rather than rigid all-or-nothing streak pressure.',
    imageSrc: '/images/feature-habits-routine.jpg',
    imageAlt:
      'Person meditating peacefully on a mountain summit at sunrise above a sea of clouds',
    highlights: [
      'Visual 7-day rhythm tracker right beside your daily tasks',
      'Custom cadences for weekdays, study days, or weekends',
      'Calm consistency view that encourages recovery over guilt',
    ],
  },
  {
    id: 'track-goals',
    number: '03',
    title: 'Track your goals',
    description:
      'Connect long-term ambitions to the concrete milestones and daily steps that move them forward.',
    detail:
      'Break semester projects, career transitions, and personal growth targets into manageable chapters.',
    imageSrc: '/images/feature-goals-studying.jpg',
    imageAlt:
      'Wooden blocks with progressive upward arrows stepping toward a bullseye target',
    highlights: [
      'Milestone-driven progress bars tied to real deliverables',
      'Clear target horizons for semester, quarterly, or annual goals',
      'Direct links between upcoming goals and today’s action list',
    ],
  },
  {
    id: 'thoughts-resources',
    number: '04',
    title: 'Keep your thoughts and resources together',
    description:
      'Store lecture notes, journal entries, reading lists, and reference PDFs right where you plan your work.',
    detail:
      'No more hunting across five tabs for a syllabus, book chapter, or reflection entry when you sit down to focus.',
    imageSrc: '/images/feature-thoughts-resources.jpg',
    imageAlt:
      'Handwriting reflective notes with a fountain pen in a lined journal',
    highlights: [
      'Structured notes and personal reflections in one calm space',
      'Organized space for books, syllabi, and reference PDFs',
      'Context-aware links between notes, goals, and daily tasks',
    ],
  },
];

export const HOW_IT_WORKS_STEPS: WorkflowStep[] = [
  {
    stepNumber: '01',
    title: 'Organize what matters.',
    description:
      'Bring your tasks, upcoming deadlines, reading materials, and personal goals into one structured workspace so nothing slips through the cracks.',
    exampleContext: 'Tasks · Goals · Notes & PDFs',
    imageSrc: '/images/step-organize.jpg',
    imageAlt:
      'Neatly organized wooden desk with a spiral notebook, pens, coffee cup, and laptop',
  },
  {
    stepNumber: '02',
    title: 'Build routines that fit your life.',
    description:
      'Shape morning and evening rhythms around your actual energy and schedule, whether you are balancing lectures, shifts, or creative projects.',
    exampleContext: 'Daily agenda · Flexible habits',
    imageSrc: '/images/step-routines.jpg',
    imageAlt:
      'Whimsical illustration of waking up refreshed in bed surrounded by morning routine icons and plants',
  },
  {
    stepNumber: '03',
    title: 'Reflect on your progress and improve.',
    description:
      'Review your weekly momentum, see where your time went, and gently adjust your pace for the week ahead without burnout.',
    exampleContext: 'Weekly review · Calm insights',
    imageSrc: '/images/step-reflect.jpg',
    imageAlt:
      'Open reflection notebook with handwritten notes and reading glasses on a desk',
  },
];

export function calculateTaskSummary(tasks: SampleTask[]): {
  completedCount: number;
  totalCount: number;
  completionPercentage: number;
} {
  const totalCount = tasks.length;
  if (totalCount === 0) {
    return { completedCount: 0, totalCount: 0, completionPercentage: 0 };
  }
  const completedCount = tasks.filter((t) => t.completed).length;
  const completionPercentage = Math.round((completedCount / totalCount) * 100);
  return { completedCount, totalCount, completionPercentage };
}

export function filterSampleTasks(
  tasks: SampleTask[],
  category: 'All' | SampleTask['category']
): SampleTask[] {
  if (category === 'All') {
    return tasks;
  }
  return tasks.filter((t) => t.category === category);
}

export function calculateWeeklyCompletionRate(
  points: WeeklyProgressPoint[]
): {
  completedTotal: number;
  plannedTotal: number;
  ratePercent: number;
  totalFocusHours: string;
} {
  const completedTotal = points.reduce((sum, p) => sum + p.tasksCompleted, 0);
  const plannedTotal = points.reduce((sum, p) => sum + p.tasksPlanned, 0);
  const totalMinutes = points.reduce((sum, p) => sum + p.focusMinutes, 0);
  const ratePercent =
    plannedTotal > 0 ? Math.round((completedTotal / plannedTotal) * 100) : 0;
  const totalFocusHours = (totalMinutes / 60).toFixed(1);
  return { completedTotal, plannedTotal, ratePercent, totalFocusHours };
}
