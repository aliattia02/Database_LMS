export const LMS_CONFIG = {
  appName: 'LMS Platform',
  storagePrefix: 'lms',

  // Phase 6 — controls default module visibility when a user has no
  // per-user access document (see access.js → getVisibleModules).
  //   'open'       → all modules visible by default; explicit `false` hides one
  //   'controlled' → all modules hidden by default; explicit `true` shows one
  accessControl: {
    mode: 'open'
  },

  welcome: {
    heading: 'Your learning platform',
    body: 'Select a module on the left, then select a lesson to begin.'
  },

  fields: [
    {
      id: 'backend',
      title: 'Backend Development',
      subtitle: 'Databases, server logic, and infrastructure',
      icon: '🗄️',
      theme: { accent: '#2563eb', accentSoft: '#dbeafe' },
      moduleIds: ['database', 'python']
    },
    {
      id: 'frontend',
      title: 'Frontend Development',
      subtitle: 'Web components, state management, and mobile',
      icon: '⚛️',
      theme: { accent: '#0369a1', accentSoft: '#e0f2fe' },
      moduleIds: ['react', 'react-native', 'python']
      // python appears here AND in backend — its progress is shared either way
    },
    {
      id: 'career',
      title: 'Career & Onboarding',
      subtitle: 'Interview prep, job start, and workplace German',
      icon: '🎯',
      theme: { accent: '#b45309', accentSoft: '#fef3c7' },
      moduleIds: ['interview', 'ukm-prep']
    }
  ],

  modules: [
    {
      id: 'database',
      title: 'Database Engineering',
      subtitle: 'SQL, MariaDB, Galera, MaxScale',
      theme: { accent: '#2563eb', accentSoft: '#dbeafe' },
      lessons: [
        {
          id: 'db-masterplan',
          title: 'Masterplan',
          subtitle: 'Full track overview',
          route: 'lms/modules/database/lessons/db-masterplan-v2.html',
          progress: { type: 'untracked', total: 0 }
        },
        {
          id: 'db-overview',
          title: 'DB Overview',
          subtitle: 'Big picture and roadmap',
          route: 'lms/modules/database/lessons/phase-00-db-overview.html',
          progress: { type: 'untracked', total: 0 }
        },
        {
          id: 'db-linux',
          title: 'Linux & RedHat',
          subtitle: 'DBA foundation',
          route: 'lms/modules/database/lessons/phase-00-linux-redhat.html',
          progress: { type: 'checklist', storageKey: 'phase_00_linux_done', total: 9, ignoreKeys: ['home'] }
        },
        {
          id: 'db-sql-mysql',
          title: 'SQL & MySQL',
          subtitle: 'Core SQL track',
          route: 'lms/modules/database/lessons/phase-01-sql-mysql.html',
          progress: { type: 'checklist', storageKey: 'phase_01_done', total: 12, ignoreKeys: ['home'] }
        },
        {
          id: 'db-design',
          title: 'Database Design',
          subtitle: 'Modeling and ERDs',
          route: 'lms/modules/database/lessons/phase-02-db-design.html',
          progress: { type: 'checklist', storageKey: 'phase_02_done', total: 5, ignoreKeys: ['home'] }
        },
        {
          id: 'db-advanced-sql',
          title: 'Advanced SQL',
          subtitle: 'Complex query patterns',
          route: 'lms/modules/database/lessons/phase-03-advanced-sql.html',
          progress: { type: 'checklist', storageKey: 'phase_03_done', total: 6, ignoreKeys: ['home'] }
        },
        {
          id: 'db-internals',
          title: 'DB Internals',
          subtitle: 'Storage and engine internals',
          route: 'lms/modules/database/lessons/phase-04-db-internals.html',
          progress: { type: 'checklist', storageKey: 'phase_04_done', total: 5, ignoreKeys: ['home'] }
        },
        {
          id: 'db-admin',
          title: 'MariaDB Admin',
          subtitle: 'Operations and production workflows',
          route: 'lms/modules/database/lessons/phase-05-mariadb-admin.html',
          progress: { type: 'checklist', storageKey: 'phase_05_done', total: 8, ignoreKeys: ['home'] }
        },
        {
          id: 'db-galera',
          title: 'Galera Cluster',
          subtitle: 'High availability and replication',
          route: 'lms/modules/database/lessons/phase-06-Galera.html',
          progress: { type: 'checklist', storageKey: 'phase_06_done', total: 7, ignoreKeys: ['home'] }
        },
        {
          id: 'db-maxscale',
          title: 'MaxScale',
          subtitle: 'Traffic control and scaling',
          route: 'lms/modules/database/lessons/phase-07-maxscale.html',
          progress: { type: 'checklist', storageKey: 'phase_07_done', total: 7, ignoreKeys: ['home'] }
        }
      ]
    },
    {
      id: 'python',
      title: 'Basic Python',
      subtitle: 'Syntax, control flow, and functions',
      theme: { accent: '#0f766e', accentSoft: '#ccfbf1' },
      lessons: [
        {
          id: 'py-basics',
          title: 'Python Fundamentals',
          subtitle: 'Variables, types, and operators',
          route: 'lms/modules/python/lessons/01-fundamentals.html',
          progress: { type: 'checklist', storageKey: 'lms_python_01_done', total: 6, ignoreKeys: ['home'] }
        },
        {
          id: 'py-flow',
          title: 'Control Flow',
          subtitle: 'Conditionals and loops',
          route: 'lms/modules/python/lessons/02-control-flow.html',
          progress: { type: 'checklist', storageKey: 'lms_python_02_done', total: 6, ignoreKeys: ['home'] }
        },
        {
          id: 'py-functions',
          title: 'Functions & Modules',
          subtitle: 'Reusable logic and packaging',
          route: 'lms/modules/python/lessons/03-functions-modules.html',
          progress: { type: 'checklist', storageKey: 'lms_python_03_done', total: 6, ignoreKeys: ['home'] }
        }
      ]
    },
    {
      id: 'react',
      title: 'Basic React',
      subtitle: 'Components, state, and effects',
      theme: { accent: '#0369a1', accentSoft: '#dbeafe' },
      lessons: [
        {
          id: 'react-components',
          title: 'Components & JSX',
          subtitle: 'Building blocks of React apps',
          route: 'lms/modules/react/lessons/01-components-jsx.html',
          progress: { type: 'checklist', storageKey: 'lms_react_01_done', total: 6, ignoreKeys: ['home'] }
        },
        {
          id: 'react-state',
          title: 'State & Events',
          subtitle: 'Interactive UI patterns',
          route: 'lms/modules/react/lessons/02-state-events.html',
          progress: { type: 'checklist', storageKey: 'lms_react_02_done', total: 6, ignoreKeys: ['home'] }
        },
        {
          id: 'react-effects',
          title: 'Effects & Data Fetching',
          subtitle: 'Side-effects and lifecycle',
          route: 'lms/modules/react/lessons/03-effects-data.html',
          progress: { type: 'checklist', storageKey: 'lms_react_03_done', total: 6, ignoreKeys: ['home'] }
        }
      ]
    },
    {
      id: 'interview',
      title: 'Interview Prep',
      subtitle: 'Medical informatics, governance, and leadership topics',
      theme: { accent: '#b45309', accentSoft: '#fef3c7' },
      lessons: [
        {
          id: 'interview-general',
          title: 'General Overview',
          subtitle: 'Introduction and orientation',
          route: 'lms/modules/Interview-main/general.html',
          progress: { type: 'untracked', total: 0 }
        },
        {
          id: 'interview-mindmap',
          title: 'Mind Map',
          subtitle: 'Full topic overview',
          route: 'lms/modules/Interview-main/topic0-mindmap.html',
          progress: { type: 'untracked', total: 0 }
        },
        {
          id: 'interview-gics',
          title: 'GICS / GPAs',
          subtitle: 'Governance and performance structures',
          route: 'lms/modules/Interview-main/topic1-gics-gpas.html',
          progress: { type: 'untracked', total: 0 }
        },
        {
          id: 'interview-mii',
          title: 'MII / MIRACUM / NUM',
          subtitle: 'Medical informatics initiatives',
          route: 'lms/modules/Interview-main/topic2-mii-miracum-num-1.html',
          progress: { type: 'untracked', total: 0 }
        },
        {
          id: 'interview-hdsig',
          title: 'HDSIG',
          subtitle: 'Health data standards and interoperability',
          route: 'lms/modules/Interview-main/topic3-hdsig.html',
          progress: { type: 'untracked', total: 0 }
        },
        {
          id: 'interview-din',
          title: 'DIN 62304 / 14971',
          subtitle: 'Medical software and risk management standards',
          route: 'lms/modules/Interview-main/topic4-din62304-14971.html',
          progress: { type: 'untracked', total: 0 }
        },
        {
          id: 'interview-leitung',
          title: 'Academic Leadership',
          subtitle: 'Leading within academic institutions',
          route: 'lms/modules/Interview-main/topic5-leitung-academic-institution.html',
          progress: { type: 'untracked', total: 0 }
        },
        {
          id: 'interview-register',
          title: 'German Leadership Register',
          subtitle: 'Leadership structures and registration',
          route: 'lms/modules/Interview-main/topic6-german-leadership-register.html',
          progress: { type: 'untracked', total: 0 }
        }
      ]
    },
    {
      id: 'ukm-prep',
      title: 'UKM Job Start',
      subtitle: 'Contract signing, onboarding, and first weeks at UKM Münster',
      theme: { accent: '#0284c7', accentSoft: '#e0f9ff' },
      lessons: [
        {
          id: 'ukm-hoffmann',
          title: 'Meeting: Frau Hoffmann',
          subtitle: 'Contract signing & §16 TV-L Stufe request',
          route: 'lms/modules/UKM/topic1-meeting-hoffmann.html',
          progress: { type: 'untracked', total: 0 }
        }
        // Add new UKM lessons here as the module grows
      ]
    },
    {
      id: 'react-native',
      title: 'Basic React Native',
      subtitle: 'Mobile components, navigation, state',
      theme: { accent: '#9333ea', accentSoft: '#f3e8ff' },
      lessons: [
        {
          id: 'rn-ui',
          title: 'Native UI Primitives',
          subtitle: 'View, Text, and styling model',
          route: 'lms/modules/react-native/lessons/01-ui-primitives.html',
          progress: { type: 'checklist', storageKey: 'lms_rn_01_done', total: 6, ignoreKeys: ['home'] }
        },
        {
          id: 'rn-navigation',
          title: 'Navigation Basics',
          subtitle: 'Screen transitions and stacks',
          route: 'lms/modules/react-native/lessons/02-navigation.html',
          progress: { type: 'checklist', storageKey: 'lms_rn_02_done', total: 6, ignoreKeys: ['home'] }
        },
        {
          id: 'rn-state',
          title: 'State & Async Data',
          subtitle: 'Hooks and API integration',
          route: 'lms/modules/react-native/lessons/03-state-async.html',
          progress: { type: 'checklist', storageKey: 'lms_rn_03_done', total: 6, ignoreKeys: ['home'] }
        }
      ]
    }
  ]
};

// Derived constants — computed once here so every file imports the same value
// rather than hardcoding strings like 'lms_lang' independently.
export const LANG_KEY = `${LMS_CONFIG.storagePrefix}_lang`;