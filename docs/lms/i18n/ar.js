// lms/i18n/ar.js
// Arabic overrides — only keys that differ from the English default.
// English is the source of truth; it lives in the HTML/JS files directly.
// To add a new language: create lms/i18n/<lang>.js with the same shape.

export const translations = {
  // ── Fields landing ──────────────────────────────────────────────────────
  'fields.tagline':        'معظم الدورات مصممة لمتعلم متوسط. SkillMap يستمع أولاً، ثم يبني الدورة التي تحتاجها بالفعل.',
  'fields.by':              'بواسطة',
  'fields.sectionLabel':    'اختر مسار تعلّمك',

  // ── Feature pills (hero) ──────────────────────────────────────────────────
  'fields.pill.access':       '🔐 تحكم في الوصول لكل مستخدم',
  'fields.pill.progress':     '📈 مزامنة التقدم في الوقت الحقيقي',
  'fields.pill.personalized': '✨ خطط دروس مخصصة لك',
  'fields.pill.languages':    '🌍 دروس: EN · AR · DE',

  // ── Feature strip (hero) ──────────────────────────────────────────────────
  'fields.feature.tracks.title':         'مسارات جاهزة',
  'fields.feature.tracks.body':          'مسارات منسقة تغطي SQL وبايثون وReact وReact Native والتحضير للمقابلات — كل واحدة بتقدم قابل للقياس على مستوى الدرس.',
  'fields.feature.personalized.title':   'دروس مخصصة',
  'fields.feature.personalized.body':    'أخبرنا بما تريد تعلّمه، ومن أين تبدأ، وما تحتاج إنجازه وبحلول متى. سنحوّل ذلك إلى درس مصمم خصيصاً لك.',
  'fields.feature.cloud.title':          'تقدم متزامن عبر السحابة',
  'fields.feature.cloud.body':           'سجّل الدخول بـ Google أو البريد الإلكتروني لمزامنة تقدمك عبر الأجهزة باستخدام Firestore. يتم تطبيق صلاحيات الوصول لكل مستخدم على مستوى قاعدة البيانات.',
  'fields.feature.multilingual.title':   'محتوى متعدد اللغات',
  'fields.feature.multilingual.body':    'الدروس متوفرة بالإنجليزية والألمانية والعربية. يتم حفظ تفضيل اللغة لكل مستخدم وتطبيقه فوراً.',

  // ── Footer ──────────────────────────────────────────────────────────────
  'fields.footer.builtBy':  'بُني بواسطة',
  'fields.footer.tagline':  'دورة واحدة تناسبك تساوي أكثر من مئة لا تناسبك',

  // ── Field card labels (used via t() in renderFieldsLanding) ─────────────
  'field.modules':         'وحدات',
  'field.complete':        'مكتمل',
  'field.locked':          'لا يوجد وصول',
  'field.lessons':         'دروس',
  'field.chooseModule':    'اختر وحدة للبدء',

  // ── Shell sidebar ────────────────────────────────────────────────────────
  'shell.backToFields':    'مسارات',
  'shell.backToModules':   'الوحدات',
  'shell.modulesTitle':    'الوحدات',
  'shell.lessonsTitle':    'الدروس',
  'shell.currentModule':   'الوحدة الحالية',
  'shell.globalLMS':       'التقدم الكلي',
  'shell.resetButton':     'إعادة تعيين جميع التقدم',
  'shell.chooseModule':    'اختر وحدة',
  'shell.chooseModuleSub': 'ابدأ بقاعدة البيانات أو انتقل إلى مسار الواجهة الأمامية أو الجوال.',

  // ── Welcome panel ────────────────────────────────────────────────────────
  'welcome.heading':       'منصة التعلم الخاصة بك',
  'welcome.body':          'اختر وحدة من القائمة اليسرى، ثم اختر درساً للبدء.',

  // ── Auth panel (Phase 3) ─────────────────────────────────────────────────
  'auth.signInTitle':      'سجّل الدخول لمزامنة التقدم',
  'auth.googleButton':     'الاستمرار باستخدام Google',
  'auth.orDivider':        'أو',
  'auth.signInButton':     'تسجيل الدخول',
  'auth.signUpButton':     'إنشاء حساب',
  'auth.adminPanel':       'لوحة الإدارة ↗',
  'auth.signOut':          'تسجيل الخروج',

  // ── Lesson nav labels ────────────────────────────────────────────────────
  'lesson.referenceLabel': 'مرجع',

  // ── Progress labels ──────────────────────────────────────────────────────
  'progress.complete':     '٪ مكتمل',

  // ── Module card labels ───────────────────────────────────────────────────
  'module.lessons':        'دروس',
  'shell.backToField':     'الوحدات',
  'shell.chooseLesson':    'اختر درساً',

  // ── Personalized Lessons entry (fields-landing card) ─────────────────────
  'pl.fieldTitle':         'دروس مخصصة',
  'pl.fieldSubtitle':      'دروس مصممة خصيصاً لك',
  'pl.signInRequired':     'تسجيل الدخول مطلوب',
  'pl.lessonsReady':       'دروس جاهزة',


  // ── Field titles & subtitles (registry) ──────────────────────────────────
  'field.backend.title':            'تطوير الواجهة الخلفية',
  'field.backend.subtitle':         'قواعد البيانات، ومنطق الخادم، والبنية التحتية',
  'field.frontend.title':           'تطوير الواجهة الأمامية',
  'field.frontend.subtitle':        'مكونات الويب، وإدارة الحالة، والتطبيقات المحمولة',
  'field.career.title':             'المهنة والتأهيل',
  'field.career.subtitle':          'التحضير للمقابلات، وبدء العمل، والألمانية في بيئة العمل',

  // ── Module titles & subtitles (registry) ─────────────────────────────────
  'module.database.title':          'هندسة قواعد البيانات',
  'module.database.subtitle':       'SQL و MariaDB و Galera و MaxScale',
  'module.python.title':            'بايثون للمبتدئين',
  'module.python.subtitle':         'البنية، والتحكم في التدفق، والدوال',
  'module.react.title':             'React للمبتدئين',
  'module.react.subtitle':          'المكونات، والحالة، والتأثيرات',
  'module.react-native.title':      'React Native للمبتدئين',
  'module.react-native.subtitle':   'مكونات الجوال، والتنقل، والحالة',
  'module.interview.title':         'التحضير للمقابلة',
  'module.interview.subtitle':      'المعلوماتية الطبية، والحوكمة، ومواضيع القيادة',
  'module.ukm-prep.title':          'بدء العمل في UKM',
  'module.ukm-prep.subtitle':       'توقيع العقد، والتأهيل، والأسابيع الأولى في UKM مونستر',

  // ── Lesson titles & subtitles — Database module ───────────────────────────
  'lesson.db-masterplan.title':     'الخطة الرئيسية',
  'lesson.db-masterplan.subtitle':  'نظرة عامة كاملة على المسار',
  'lesson.db-overview.title':       'نظرة عامة على قواعد البيانات',
  'lesson.db-overview.subtitle':    'الصورة الكبيرة وخارطة الطريق',
  'lesson.db-linux.title':          'Linux و RedHat',
  'lesson.db-linux.subtitle':       'الأساس لإدارة قواعد البيانات',
  'lesson.db-sql-mysql.title':      'SQL و MySQL',
  'lesson.db-sql-mysql.subtitle':   'المسار الأساسي لـ SQL',
  'lesson.db-design.title':         'تصميم قواعد البيانات',
  'lesson.db-design.subtitle':      'النمذجة والمخططات العلائقية',
  'lesson.db-advanced-sql.title':   'SQL المتقدم',
  'lesson.db-advanced-sql.subtitle':'أنماط الاستعلامات المعقدة',
  'lesson.db-internals.title':      'الداخليات لقواعد البيانات',
  'lesson.db-internals.subtitle':   'التخزين والمحركات الداخلية',
  'lesson.db-admin.title':          'إدارة MariaDB',
  'lesson.db-admin.subtitle':       'العمليات وسير العمل في الإنتاج',
  'lesson.db-galera.title':         'مجموعة Galera',
  'lesson.db-galera.subtitle':      'التوافر العالي والنسخ المتماثل',
  'lesson.db-maxscale.title':       'MaxScale',
  'lesson.db-maxscale.subtitle':    'التحكم في حركة المرور والتوسع',

  // ── Lesson titles & subtitles — Python module ─────────────────────────────
  'lesson.py-basics.title':         'أساسيات بايثون',
  'lesson.py-basics.subtitle':      'المتغيرات، والأنواع، والعمليات',
  'lesson.py-flow.title':           'التحكم في التدفق',
  'lesson.py-flow.subtitle':        'الشروط والحلقات',
  'lesson.py-functions.title':      'الدوال والوحدات',
  'lesson.py-functions.subtitle':   'المنطق القابل لإعادة الاستخدام والتغليف',

  // ── Lesson titles & subtitles — React module ──────────────────────────────
  'lesson.react-components.title':    'المكونات و JSX',
  'lesson.react-components.subtitle': 'اللبنات الأساسية لتطبيقات React',
  'lesson.react-state.title':         'الحالة والأحداث',
  'lesson.react-state.subtitle':      'أنماط واجهة المستخدم التفاعلية',
  'lesson.react-effects.title':       'التأثيرات وجلب البيانات',
  'lesson.react-effects.subtitle':    'الآثار الجانبية ودورة الحياة',

  // ── Lesson titles & subtitles — React Native module ───────────────────────
  'lesson.rn-ui.title':           'العناصر الأصلية لواجهة المستخدم',
  'lesson.rn-ui.subtitle':        'View و Text ونموذج التصميم',
  'lesson.rn-navigation.title':   'أساسيات التنقل',
  'lesson.rn-navigation.subtitle':'انتقالات الشاشة والمكدسات',
  'lesson.rn-state.title':        'الحالة والبيانات غير المتزامنة',
  'lesson.rn-state.subtitle':     'الخطافات وتكامل واجهات API',

  // ── Lesson titles & subtitles — Interview module ──────────────────────────
  'lesson.interview-general.title':           'نظرة عامة',
  'lesson.interview-general.subtitle':        'مقدمة وتوجيه',
  'lesson.interview-mindmap.title':           'الخريطة الذهنية',
  'lesson.interview-mindmap.subtitle':        'نظرة شاملة على الموضوعات',
  'lesson.interview-gics.title':              'GICS / GPAs',
  'lesson.interview-gics.subtitle':           'هياكل الحوكمة والأداء',
  'lesson.interview-mii.title':               'MII / MIRACUM / NUM',
  'lesson.interview-mii.subtitle':            'مبادرات المعلوماتية الطبية',
  'lesson.interview-hdsig.title':             'HDSIG',
  'lesson.interview-hdsig.subtitle':          'معايير البيانات الصحية وقابلية التشغيل البيني',
  'lesson.interview-din.title':               'DIN 62304 / 14971',
  'lesson.interview-din.subtitle':            'معايير البرمجيات الطبية وإدارة المخاطر',
  'lesson.interview-leitung.title':           'القيادة الأكاديمية',
  'lesson.interview-leitung.subtitle':        'القيادة داخل المؤسسات الأكاديمية',
  'lesson.interview-register.title':          'سجل القيادة الألماني',
  'lesson.interview-register.subtitle':       'هياكل القيادة والتسجيل',

  // ── Lesson titles & subtitles — UKM module ───────────────────────────────
  'lesson.ukm-hoffmann.title':             'اجتماع: فراو هوفمان',
  'lesson.ukm-hoffmann.subtitle':          'توقيع العقد وطلب §16 TV-L Stufe',
  'lesson.ukm-self-introduction.title':    'تقديم النفس',
  'lesson.ukm-self-introduction.subtitle': 'كيفية تقديم نفسك في UKM',
  'lesson.ukm-hoffmann-questions.title':   'فراو هوفمان — جانبها',
  'lesson.ukm-hoffmann-questions.subtitle':'أسئلتها، وطلبات الوثائق، واللحظات الصعبة',
};