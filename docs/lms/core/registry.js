export const LMS_CONFIG = {
  appName: 'SkillMap LMS',
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
      moduleIds: ['database', 'python', 'python-unaided', 'python-starter']
    },
    {
      id: 'frontend',
      title: 'Frontend Development',
      subtitle: 'Web components, state management, and mobile',
      icon: '⚛️',
      theme: { accent: '#0369a1', accentSoft: '#e0f2fe' },
      moduleIds: ['html-starter', 'react', 'react-native']
    },
    {
      id: 'career',
      title: 'Career & Onboarding',
      subtitle: 'Interview prep, job start, and workplace German',
      icon: '🎯',
      theme: { accent: '#b45309', accentSoft: '#fef3c7' },
      moduleIds: ['interview', 'github']
    },
    {
      // ── Personalized Local Courses ──────────────────────────────────────
      // Serves static HTML files from lms/personalied_modules/ — same
      // mechanism as the normal modules/ folder, just a separate directory
      // so hand-customised variants don't mix with the shared course content.
      // Add new personalised module ids to moduleIds as the folder grows.
      // Completely independent of the Firestore-based Personalized Lessons
      // field (activeFieldId === 'personalized'), which lives in app.js state.
      id: 'local-prep',
      title: 'My Prep Materials',
      subtitle: 'Personalised local courses tailored for you',
      icon: '🧑‍💻',
      theme: { accent: '#7c3aed', accentSoft: '#ede9fe' },
      moduleIds: ['database-pers', 'interview-local']
    }
  ],

  // Optional per-module field: `indexRoute`.
  //   When set, it points at a static HTML page (same shape as a lesson
  //   `route`) that's shown in the lesson iframe the moment a module is
  //   selected but before any specific lesson has been opened — replacing
  //   the generic #welcome-panel text with a real course overview / table
  //   of contents. See renderModuleLanding() in app.js.
  //   Omit it entirely for modules that should keep the plain welcome
  //   panel (the default, unchanged behaviour).
  modules: [
    {
      id: 'database',
      title: 'Database Engineering',
      subtitle: 'SQL, MariaDB, Galera, MaxScale',
      theme: { accent: '#2563eb', accentSoft: '#dbeafe' },
      indexRoute: 'lms/modules/database/db-masterplan-v2.html',
      lessons: [
        {
          id: 'db-masterplan',
          title: 'Masterplan',
          subtitle: 'Full track overview',
          route: 'lms/modules/database/db-masterplan-v2.html',
          progress: { type: 'untracked', total: 0 }
        },
        {
          id: 'db-overview',
          title: 'DB Overview',
          subtitle: 'Big picture and roadmap',
          route: 'lms/modules/database/phase-00-db-overview.html',
          progress: { type: 'checklist', storageKey: 'phase_00_overview_done', total: 16, ignoreKeys: ['home'] }
        },
        {
          id: 'db-linux',
          title: 'Linux & RedHat',
          subtitle: 'DBA foundation',
          route: 'lms/modules/database/phase-00-linux-redhat.html',
          progress: { type: 'checklist', storageKey: 'phase_00_linux_done', total: 15, ignoreKeys: ['home'] }
        },
        {
          id: 'db-sql-mysql',
          title: 'SQL & MySQL',
          subtitle: 'Core SQL track',
          route: 'lms/modules/database/phase-01-sql-mysql.html',
          progress: { type: 'checklist', storageKey: 'phase_01_done', total: 17, ignoreKeys: ['home'] }
        },
        {
          id: 'db-design',
          title: 'Database Design',
          subtitle: 'Modeling and ERDs',
          route: 'lms/modules/database/phase-02-db-design.html',
          progress: { type: 'checklist', storageKey: 'phase_02_done', total: 41, ignoreKeys: ['home'] }
        },
        {
          id: 'db-advanced-sql',
          title: 'Advanced SQL',
          subtitle: 'Complex query patterns',
          route: 'lms/modules/database/phase-03-advanced-sql.html',
          progress: { type: 'checklist', storageKey: 'phase_03_done', total: 51, ignoreKeys: ['home'] }
        },
        {
          id: 'db-internals',
          title: 'DB Internals',
          subtitle: 'Storage and engine internals',
          route: 'lms/modules/database/phase-04-db-internals.html',
          progress: { type: 'checklist', storageKey: 'phase_04_done', total: 39, ignoreKeys: ['home'] }
        },
        {
          id: 'db-admin',
          title: 'MariaDB Admin',
          subtitle: 'Operations and production workflows',
          route: 'lms/modules/database/phase-05-mariadb-admin.html',
          progress: { type: 'checklist', storageKey: 'phase_05_done', total: 71, ignoreKeys: ['home'] }
        },
        {
          id: 'db-galera',
          title: 'Galera Cluster',
          subtitle: 'High availability and replication',
          route: 'lms/modules/database/phase-06-Galera.html',
          progress: { type: 'checklist', storageKey: 'phase_06_done', total: 20, ignoreKeys: ['home'] }
        },
        {
          id: 'db-maxscale',
          title: 'MaxScale',
          subtitle: 'Traffic control and scaling',
          route: 'lms/modules/database/phase-07-maxscale.html',
          progress: { type: 'checklist', storageKey: 'phase_07_done', total: 23, ignoreKeys: ['home'] }
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
          route: 'lms/modules/python/01-fundamentals.html',
          progress: { type: 'checklist', storageKey: 'lms_python_01_done', total: 6, ignoreKeys: ['home'] }
        },
        {
          id: 'py-flow',
          title: 'Control Flow',
          subtitle: 'Conditionals and loops',
          route: 'lms/modules/python/02-control-flow.html',
          progress: { type: 'checklist', storageKey: 'lms_python_02_done', total: 6, ignoreKeys: ['home'] }
        },
        {
          id: 'py-functions',
          title: 'Functions & Modules',
          subtitle: 'Reusable logic and packaging',
          route: 'lms/modules/python/03-functions-modules.html',
          progress: { type: 'checklist', storageKey: 'lms_python_03_done', total: 6, ignoreKeys: ['home'] }
        }
      ]
    },
    {
      id: 'python-unaided',
      title: 'Python Unaided Coding',
      subtitle: 'Write, read, and debug Python by hand — no AI assist',
      theme: { accent: '#0f766e', accentSoft: '#ccfbf1' },
      indexRoute: 'lms/modules/python-unaided/masterplan.html',
      lessons: [
        {
          id: 'python-unaided-masterplan',
          title: 'Masterplan',
          subtitle: 'Full track overview',
          route: 'lms/modules/python-unaided/masterplan.html',
          progress: { type: 'untracked', total: 0 }
        },
        {
          id: 'python-unaided-general',
          title: 'General Overview',
          subtitle: 'Introduction and orientation',
          route: 'lms/modules/python-unaided/general.html',
          progress: { type: 'untracked', total: 0 }
        },
        {
          id: 'python-unaided-mindmap',
          title: 'Mind Map',
          subtitle: 'Full topic overview',
          route: 'lms/modules/python-unaided/topic0-mindmap.html',
          progress: { type: 'untracked', total: 0 }
        },
        {
          id: 'python-unaided-topic1',
          title: 'Manual Function Writing',
          subtitle: 'Write small, correct functions from memory — no AI, no libraries',
          route: 'lms/modules/python-unaided/topic1-manual-functions.html',
          progress: { type: 'checklist', storageKey: 'lms_python_unaided_01_done', total: 5, ignoreKeys: ['home'] }
        },
        {
          id: 'python-unaided-topic2',
          title: 'Reading Code & Spotting Bugs',
          subtitle: 'Trace broken functions by hand and find the root cause',
          route: 'lms/modules/python-unaided/topic2-reading-bugs.html',
          progress: { type: 'checklist', storageKey: 'lms_python_unaided_02_done', total: 6, ignoreKeys: ['home'] }
        },
        {
          id: 'python-unaided-topic3',
          title: 'Debugging: Print Statements & Breakpoints',
          subtitle: 'Build a systematic workflow for "runs but wrong" bugs',
          route: 'lms/modules/python-unaided/topic3-debugging.html',
          progress: { type: 'checklist', storageKey: 'lms_python_unaided_03_done', total: 5, ignoreKeys: ['home'] }
        },
        {
          id: 'python-unaided-topic4',
          title: 'Exception Handling',
          subtitle: 'Write code that fails gracefully, not code that crashes',
          route: 'lms/modules/python-unaided/topic4-exceptions.html',
          progress: { type: 'checklist', storageKey: 'lms_python_unaided_04_done', total: 5, ignoreKeys: ['home'] }
        },
        {
          id: 'python-unaided-topic5',
          title: 'Refactor a Real Module',
          subtitle: 'Port your own DiaTwin/Morafek logic into clean, unaided Python',
          route: 'lms/modules/python-unaided/topic5-refactor.html',
          progress: { type: 'checklist', storageKey: 'lms_python_unaided_05_done', total: 5, ignoreKeys: ['home'] }
        }
      ]
    },
    {
      id: 'python-starter',
      title: 'Python Course',
      subtitle: 'Core Python syntax and structures for backend development',
      theme: { accent: '#0f766e', accentSoft: '#ccfbf1' },
      indexRoute: 'lms/modules/python-starter/masterplan.html',
      lessons: [
        {
          id: 'python-starter-masterplan',
          title: 'Masterplan',
          subtitle: 'Full track overview',
          route: 'lms/modules/python-starter/masterplan.html',
          progress: { type: 'untracked', total: 0 }
        },
        {
          id: 'python-starter-general',
          title: 'General Overview',
          subtitle: 'Introduction and orientation',
          route: 'lms/modules/python-starter/general.html',
          progress: { type: 'untracked', total: 0 }
        },
        {
          id: 'python-starter-mindmap',
          title: 'Mind Map',
          subtitle: 'Full topic overview',
          route: 'lms/modules/python-starter/topic0-mindmap.html',
          progress: { type: 'untracked', total: 0 }
        },
        {
          id: 'python-starter-topic1',
          title: 'Variables & Data Types',
          subtitle: 'Variables, numbers, strings, booleans, and type conversion',
          route: 'lms/modules/python-starter/topic1-variables-types.html',
          progress: { type: 'checklist', storageKey: 'lms_python-starter_01_done', total: 7, ignoreKeys: ['home'] }
        },
        {
          id: 'python-starter-topic2',
          title: 'Control Flow',
          subtitle: 'Conditionals and loops that handle edge cases correctly',
          route: 'lms/modules/python-starter/topic2-control-flow.html',
          progress: { type: 'checklist', storageKey: 'lms_python-starter_02_done', total: 7, ignoreKeys: ['home'] }
        },
        {
          id: 'python-starter-topic3',
          title: 'Functions',
          subtitle: 'Arguments, return values, and scope',
          route: 'lms/modules/python-starter/topic3-functions.html',
          progress: { type: 'checklist', storageKey: 'lms_python-starter_03_done', total: 6, ignoreKeys: ['home'] }
        },
        {
          id: 'python-starter-topic4',
          title: 'Data Structures',
          subtitle: 'Lists, tuples, dictionaries, and sets',
          route: 'lms/modules/python-starter/topic4-data-structures.html',
          progress: { type: 'checklist', storageKey: 'lms_python-starter_04_done', total: 7, ignoreKeys: ['home'] }
        },
        {
          id: 'python-starter-topic5',
          title: 'Modules & File I/O',
          subtitle: 'Organizing code and reading/writing files safely',
          route: 'lms/modules/python-starter/topic5-modules-file-io.html',
          progress: { type: 'checklist', storageKey: 'lms_python-starter_05_done', total: 5, ignoreKeys: ['home'] }
        }
      ]
    },
    // ── HTML Starter ──────────────────────────────────────────────────────────
    // Five-topic course covering document structure, text elements, links &
    // images, forms, and semantic HTML. Lives in lms/modules/HTML-starter/.
    // storageKey convention: lms_html-starter_<nn>_done
    // NOTE: topic `total` values default to 6 (matching github/react starter
    // pattern). Adjust each value once you've counted the actual q-cards in
    // the topic HTML files.
    {
      id: 'html-starter',
      title: 'HTML Starter',
      subtitle: 'Document structure, elements, links, forms, and semantic HTML',
      theme: { accent: '#ea580c', accentSoft: '#fff7ed' },
      indexRoute: 'lms/modules/HTML-starter/masterplan.html',
      lessons: [
        {
          id: 'html-starter-masterplan',
          title: 'Masterplan',
          subtitle: 'Full track overview',
          route: 'lms/modules/HTML-starter/masterplan.html',
          progress: { type: 'untracked', total: 0 }
        },
        {
          id: 'html-starter-general',
          title: 'General Overview',
          subtitle: 'What HTML is and how it fits into the web platform',
          route: 'lms/modules/HTML-starter/general.html',
          progress: { type: 'untracked', total: 0 }
        },
        {
          id: 'html-starter-topic1',
          title: 'HTML Basics',
          subtitle: 'Document structure, void elements, and attributes',
          route: 'lms/modules/HTML-starter/topic1-html-basics.html',
          progress: { type: 'checklist', storageKey: 'lms_html-starter_01_done', total: 6, ignoreKeys: ['home'] }
        },
        {
          id: 'html-starter-topic2',
          title: 'Text Elements',
          subtitle: 'Headings, paragraphs, lists, and inline formatting',
          route: 'lms/modules/HTML-starter/topic2-text-elements.html',
          progress: { type: 'checklist', storageKey: 'lms_html-starter_02_done', total: 6, ignoreKeys: ['home'] }
        },
        {
          id: 'html-starter-topic3',
          title: 'Links & Images',
          subtitle: 'Anchors, relative vs. absolute paths, and embedding media',
          route: 'lms/modules/HTML-starter/topic3-links-images.html',
          progress: { type: 'checklist', storageKey: 'lms_html-starter_03_done', total: 6, ignoreKeys: ['home'] }
        },
        {
          id: 'html-starter-topic4',
          title: 'Forms',
          subtitle: 'Inputs, labels, validation attributes, and form structure',
          route: 'lms/modules/HTML-starter/topic4-forms.html',
          progress: { type: 'checklist', storageKey: 'lms_html-starter_04_done', total: 6, ignoreKeys: ['home'] }
        },
        {
          id: 'html-starter-topic5',
          title: 'Semantic HTML',
          subtitle: 'Meaningful structure for accessibility and SEO',
          route: 'lms/modules/HTML-starter/topic5-semantic-html.html',
          progress: { type: 'checklist', storageKey: 'lms_html-starter_05_done', total: 6, ignoreKeys: ['home'] }
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
          route: 'lms/modules/react/01-components-jsx.html',
          progress: { type: 'checklist', storageKey: 'lms_react_01_done', total: 6, ignoreKeys: ['home'] }
        },
        {
          id: 'react-state',
          title: 'State & Events',
          subtitle: 'Interactive UI patterns',
          route: 'lms/modules/react/02-state-events.html',
          progress: { type: 'checklist', storageKey: 'lms_react_02_done', total: 6, ignoreKeys: ['home'] }
        },
        {
          id: 'react-effects',
          title: 'Effects & Data Fetching',
          subtitle: 'Side-effects and lifecycle',
          route: 'lms/modules/react/03-effects-data.html',
          progress: { type: 'checklist', storageKey: 'lms_react_03_done', total: 6, ignoreKeys: ['home'] }
        }
      ]
    },
    {
      id: 'interview',
      title: 'Interview Prep',
      subtitle: 'Medical informatics, governance, and leadership topics',
      theme: { accent: '#b45309', accentSoft: '#fef3c7' },
      indexRoute: 'lms/modules/Interview-main/lesson_index.html',
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
      id: 'github',
      title: 'GitHub & Team Workflows',
      subtitle: 'Branches, pull requests, conflicts, and collaboration',
      theme: { accent: '#1d4ed8', accentSoft: '#dbeafe' },
      indexRoute: 'lms/modules/github/lesson_index.html',
      lessons: [
        {
          id: 'github-general',
          title: 'General Overview',
          subtitle: 'Introduction and orientation',
          route: 'lms/modules/github/general.html',
          progress: { type: 'untracked', total: 0 }
        },
        {
          id: 'github-mindmap',
          title: 'Mind Map',
          subtitle: 'Full topic overview',
          route: 'lms/modules/github/topic0-mindmap.html',
          progress: { type: 'untracked', total: 0 }
        },
        {
          id: 'github-branches',
          title: 'Branches',
          subtitle: 'Creating and managing branches',
          route: 'lms/modules/github/topic1-branches.html',
          progress: { type: 'checklist', storageKey: 'lms_github_01_done', total: 6, ignoreKeys: ['home'] }
        },
        {
          id: 'github-pull-requests',
          title: 'Pull Requests',
          subtitle: 'Opening, reviewing, and merging PRs',
          route: 'lms/modules/github/topic2-pull-requests.html',
          progress: { type: 'checklist', storageKey: 'lms_github_02_done', total: 6, ignoreKeys: ['home'] }
        },
        {
          id: 'github-merge-conflicts',
          title: 'Merge Conflicts',
          subtitle: 'Identifying and resolving conflicts',
          route: 'lms/modules/github/topic3-merge-conflicts.html',
          progress: { type: 'checklist', storageKey: 'lms_github_03_done', total: 6, ignoreKeys: ['home'] }
        },
        {
          id: 'github-undo',
          title: 'Undoing Changes',
          subtitle: 'Revert, reset, and restore strategies',
          route: 'lms/modules/github/topic4-undo.html',
          progress: { type: 'checklist', storageKey: 'lms_github_04_done', total: 6, ignoreKeys: ['home'] }
        },
        {
          id: 'github-team-workflow',
          title: 'Team Workflow',
          subtitle: 'Collaboration patterns and best practices',
          route: 'lms/modules/github/topic5-team-workflow.html',
          progress: { type: 'checklist', storageKey: 'lms_github_05_done', total: 6, ignoreKeys: ['home'] }
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
          route: 'lms/modules/react-native/01-ui-primitives.html',
          progress: { type: 'checklist', storageKey: 'lms_rn_01_done', total: 6, ignoreKeys: ['home'] }
        },
        {
          id: 'rn-navigation',
          title: 'Navigation Basics',
          subtitle: 'Screen transitions and stacks',
          route: 'lms/modules/react-native/02-navigation.html',
          progress: { type: 'checklist', storageKey: 'lms_rn_02_done', total: 6, ignoreKeys: ['home'] }
        },
        {
          id: 'rn-state',
          title: 'State & Async Data',
          subtitle: 'Hooks and API integration',
          route: 'lms/modules/react-native/03-state-async.html',
          progress: { type: 'checklist', storageKey: 'lms_rn_03_done', total: 6, ignoreKeys: ['home'] }
        }
      ]
    },

    // ── Personalised Local Courses ────────────────────────────────────────────
    // Modules below live in lms/personalied_modules/ (note: folder name kept as-
    // is to match the existing directory). They are served exactly like any static
    // module — the shell loads routes into the lesson iframe in the normal way.
    // lesson_index.html is registered as indexRoute so the module landing page
    // appears immediately when the module is selected (same pattern as 'interview').
    //
    // Path convention: lms/personalied_modules/<FolderName>/<file>.html
    // storageKey convention: lms_local_<slug>_done  (namespace avoids collisions
    //   with identically-named files that might exist in lms/modules/).
    {
      id: 'database-pers',
      title: 'Database Engineering (Personal)',
      subtitle: 'Your customised SQL, MariaDB, Galera, and MaxScale track',
      theme: { accent: '#2563eb', accentSoft: '#dbeafe' },
      lessons: [
        {
          id: 'dp-masterplan',
          title: 'Masterplan',
          subtitle: 'Full track overview',
          route: 'lms/personalied_modules/database_pers/db-masterplan-v2.html',
          progress: { type: 'untracked', total: 0 }
        },
        {
          id: 'dp-overview',
          title: 'DB Overview',
          subtitle: 'Big picture and roadmap',
          route: 'lms/personalied_modules/database_pers/phase-00-db-overview.html',
          progress: { type: 'checklist', storageKey: 'lms_local_db_phase_00_overview_done', total: 16, ignoreKeys: ['home'] }
        },
        {
          id: 'dp-linux',
          title: 'Linux & RedHat',
          subtitle: 'DBA foundation',
          route: 'lms/personalied_modules/database_pers/phase-00-linux-redhat.html',
          progress: { type: 'checklist', storageKey: 'lms_local_db_phase_00_linux_done', total: 15, ignoreKeys: ['home'] }
        },
        {
          id: 'dp-sql-mysql',
          title: 'SQL & MySQL',
          subtitle: 'Core SQL track',
          route: 'lms/personalied_modules/database_pers/phase-01-sql-mysql.html',
          progress: { type: 'checklist', storageKey: 'lms_local_db_phase_01_done', total: 17, ignoreKeys: ['home'] }
        },
        {
          id: 'dp-design',
          title: 'Database Design',
          subtitle: 'Modeling and ERDs',
          route: 'lms/personalied_modules/database_pers/phase-02-db-design.html',
          progress: { type: 'checklist', storageKey: 'lms_local_db_phase_02_done', total: 41, ignoreKeys: ['home'] }
        },
        {
          id: 'dp-advanced-sql',
          title: 'Advanced SQL',
          subtitle: 'Complex query patterns',
          route: 'lms/personalied_modules/database_pers/phase-03-advanced-sql.html',
          progress: { type: 'checklist', storageKey: 'lms_local_db_phase_03_done', total: 51, ignoreKeys: ['home'] }
        },
        {
          id: 'dp-internals',
          title: 'DB Internals',
          subtitle: 'Storage and engine internals',
          route: 'lms/personalied_modules/database_pers/phase-04-db-internals.html',
          progress: { type: 'checklist', storageKey: 'lms_local_db_phase_04_done', total: 39, ignoreKeys: ['home'] }
        },
        {
          id: 'dp-admin',
          title: 'MariaDB Admin',
          subtitle: 'Operations and production workflows',
          route: 'lms/personalied_modules/database_pers/phase-05-mariadb-admin.html',
          progress: { type: 'checklist', storageKey: 'lms_local_db_phase_05_done', total: 71, ignoreKeys: ['home'] }
        },
        {
          id: 'dp-galera',
          title: 'Galera Cluster',
          subtitle: 'High availability and replication',
          route: 'lms/personalied_modules/database_pers/phase-06-Galera.html',
          progress: { type: 'checklist', storageKey: 'lms_local_db_phase_06_done', total: 20, ignoreKeys: ['home'] }
        },
        {
          id: 'dp-maxscale',
          title: 'MaxScale',
          subtitle: 'Traffic control and scaling',
          route: 'lms/personalied_modules/database_pers/phase-07-maxscale.html',
          progress: { type: 'checklist', storageKey: 'lms_local_db_phase_07_done', total: 23, ignoreKeys: ['home'] }
        }
      ]
    },
    {
      id: 'interview-local',
      title: 'Interview Prep (Personal)',
      subtitle: 'Your customised interview preparation track',
      theme: { accent: '#7c3aed', accentSoft: '#ede9fe' },
      indexRoute: 'lms/personalied_modules/Interview_pers/lesson_index.html',
      lessons: [
        {
          id: 'il-general',
          title: 'General Overview',
          subtitle: 'Introduction and orientation',
          route: 'lms/personalied_modules/Interview_pers/general.html',
          progress: { type: 'untracked', total: 0 }
        },
        {
          id: 'il-mindmap',
          title: 'Mind Map',
          subtitle: 'Full topic overview',
          route: 'lms/personalied_modules/Interview_pers/topic0-mindmap.html',
          progress: { type: 'untracked', total: 0 }
        },
        {
          id: 'il-gics',
          title: 'GICS / GPAs',
          subtitle: 'Governance and performance structures',
          route: 'lms/personalied_modules/Interview_pers/topic1-gics-gpas.html',
          progress: { type: 'checklist', storageKey: 'lms_local_il_gics_done', total: 7, ignoreKeys: ['home'] }
        },
        {
          id: 'il-mii',
          title: 'MII / MIRACUM / NUM',
          subtitle: 'Medical informatics initiatives',
          route: 'lms/personalied_modules/Interview_pers/topic2-mii-miracum-num-1.html',
          progress: { type: 'checklist', storageKey: 'lms_local_il_mii_done', total: 8, ignoreKeys: ['home'] }
        },
        {
          id: 'il-hdsig',
          title: 'HDSIG',
          subtitle: 'Health data standards and interoperability',
          route: 'lms/personalied_modules/Interview_pers/topic3-hdsig.html',
          progress: { type: 'checklist', storageKey: 'lms_local_il_hdsig_done', total: 8, ignoreKeys: ['home'] }
        },
        {
          id: 'il-din',
          title: 'DIN 62304 / 14971',
          subtitle: 'Medical software and risk management standards',
          route: 'lms/personalied_modules/Interview_pers/topic4-din62304-14971.html',
          progress: { type: 'checklist', storageKey: 'lms_local_il_din_done', total: 8, ignoreKeys: ['home'] }
        },
        {
          id: 'il-leitung',
          title: 'Academic Leadership',
          subtitle: 'Leading within academic institutions',
          route: 'lms/personalied_modules/Interview_pers/topic5-leitung-academic-institution.html',
          progress: { type: 'checklist', storageKey: 'lms_local_il_leitung_done', total: 8, ignoreKeys: ['home'] }
        },
        {
          id: 'il-register',
          title: 'German Leadership Register',
          subtitle: 'Leadership structures and registration',
          route: 'lms/personalied_modules/Interview_pers/topic6-german-leadership-register.html',
          progress: { type: 'checklist', storageKey: 'lms_local_il_register_done', total: 8, ignoreKeys: ['home'] }
        }
      ]
    }
  ]
};

// Derived constants — computed once here so every file imports the same value
// rather than hardcoding strings like 'lms_lang' independently.
export const LANG_KEY = `${LMS_CONFIG.storagePrefix}_lang`;