export const LMS_CONFIG = {
  appName: 'LMS Platform',
  storagePrefix: 'lms',
  modules: [
    {
      id: 'database',
      title: 'Database Engineering',
      subtitle: 'Existing DB track migrated as module pack',
      theme: { accent: '#2563eb', accentSoft: '#dbeafe' },
      lessons: [
        {
          id: 'db-overview',
          title: 'DB Overview',
          subtitle: 'Big picture and roadmap',
          route: 'phase-00-db-overview.html',
          progress: { type: 'untracked', total: 0 }
        },
        {
          id: 'db-linux',
          title: 'Linux & RedHat',
          subtitle: 'DBA foundation',
          route: 'phase-00-linux-redhat.html',
          progress: { type: 'checklist', storageKey: 'phase_00_linux_done', total: 9, ignoreKeys: ['home'] }
        },
        {
          id: 'db-sql-mysql',
          title: 'SQL & MySQL',
          subtitle: 'Core SQL track',
          route: 'phase-01-sql-mysql.html',
          progress: { type: 'checklist', storageKey: 'phase_01_done', total: 12, ignoreKeys: ['home'] }
        },
        {
          id: 'db-design',
          title: 'Database Design',
          subtitle: 'Modeling and ERDs',
          route: 'phase-02-db-design.html',
          progress: { type: 'checklist', storageKey: 'phase_02_done', total: 5, ignoreKeys: ['home'] }
        },
        {
          id: 'db-advanced-sql',
          title: 'Advanced SQL',
          subtitle: 'Complex query patterns',
          route: 'phase-03-advanced-sql.html',
          progress: { type: 'checklist', storageKey: 'phase_03_done', total: 6, ignoreKeys: ['home'] }
        },
        {
          id: 'db-internals',
          title: 'DB Internals',
          subtitle: 'Storage and engine internals',
          route: 'phase-04-db-internals.html',
          progress: { type: 'checklist', storageKey: 'phase_04_done', total: 5, ignoreKeys: ['home'] }
        },
        {
          id: 'db-admin',
          title: 'MariaDB Admin',
          subtitle: 'Operations and production workflows',
          route: 'phase-05-mariadb-admin.html',
          progress: { type: 'checklist', storageKey: 'phase_05_done', total: 8, ignoreKeys: ['home'] }
        },
        {
          id: 'db-galera',
          title: 'Galera Cluster',
          subtitle: 'High availability and replication',
          route: 'phase-06-Galera.html',
          progress: { type: 'checklist', storageKey: 'phase_07_done', total: 7, ignoreKeys: ['home'] }
        },
        {
          id: 'db-maxscale',
          title: 'MaxScale',
          subtitle: 'Traffic control and scaling',
          route: 'phase-07-maxscale.html',
          progress: { type: 'checklist', storageKey: 'phase_06_done', total: 7, ignoreKeys: ['home'] }
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
