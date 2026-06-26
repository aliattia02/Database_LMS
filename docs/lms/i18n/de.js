// lms/i18n/de.js
// German overrides — only keys that differ from the English default.
// English is the source of truth; it lives in the HTML/JS files directly.
// To add a new language: create lms/i18n/<lang>.js with the same shape.

export const translations = {

  // ── Fields landing ──────────────────────────────────────────────────────
  'fields.tagline':        'Die meisten Kurse sind für einen durchschnittlichen Lerner gemacht. SkillMap hört zuerst zu und erstellt dann genau den Kurs, der dir fehlt.',
  'fields.by':              'von',
  'fields.sectionLabel':    'Wähle deinen Lernpfad',

  // ── Feature pills (hero) ──────────────────────────────────────────────────
  'fields.pill.access':       '🔐 Zugriffskontrolle pro Nutzer',
  'fields.pill.progress':     '📈 Echtzeit-Fortschrittssynchronisierung',
  'fields.pill.personalized': '✨ Personalisierte Lektionspläne',
  'fields.pill.languages':    '🌍 Lektionen: EN · AR · DE',

  // ── Feature strip (hero) ──────────────────────────────────────────────────
  'fields.feature.tracks.title':         'Fertige Lernpfade',
  'fields.feature.tracks.body':          'Kuratierte Pfade zu SQL, Python, React, React Native und Interview-Vorbereitung — jeweils mit messbarem Fortschritt auf Lektionsebene.',
  'fields.feature.personalized.title':   'Personalisierte Lektionen',
  'fields.feature.personalized.body':    'Sag uns, was du lernen willst, wo du gerade stehst und bis wann du es brauchst. Wir machen daraus eine Lektion, die genau auf dich zugeschnitten ist.',
  'fields.feature.cloud.title':          'Cloud-synchronisierter Fortschritt',
  'fields.feature.cloud.body':           'Melde dich mit Google oder per E-Mail an, um deinen Fortschritt geräteübergreifend über Firestore zu synchronisieren. Der Zugriff wird pro Nutzer auf Datenbankebene durchgesetzt.',
  'fields.feature.multilingual.title':   'Mehrsprachige Inhalte',
  'fields.feature.multilingual.body':    'Lektionen verfügbar auf Englisch, Deutsch und Arabisch. Die Sprachpräferenz wird pro Nutzer gespeichert und sofort angewendet.',

  // ── Footer ──────────────────────────────────────────────────────────────
  'fields.footer.builtBy':  'Entwickelt von',
  'fields.footer.tagline':  'Ein Kurs, der zu dir passt, ist mehr wert als hundert, die es nicht tun',

  // ── Field card labels ────────────────────────────────────────────────────
  'field.modules':         'Module',
  'field.complete':        'abgeschlossen',
  'field.locked':          'Kein Zugriff',
  'field.lessons':         'Lektionen',
  'field.chooseModule':    'Wähle ein Modul zum Starten',

  // ── Field titles & subtitles (registry) ─────────────────────────────────
  'field.backend.title':    'Backend-Entwicklung',
  'field.backend.subtitle': 'Datenbanken, Serverlogik und Infrastruktur',

  'field.frontend.title':    'Frontend-Entwicklung',
  'field.frontend.subtitle': 'Webkomponenten, State-Management und Mobile',

  'field.career.title':    'Karriere & Einarbeitung',
  'field.career.subtitle': 'Interview-Vorbereitung, Jobstart und Deutsch am Arbeitsplatz',

  // ── Module titles & subtitles (registry) ─────────────────────────────────
  'module.database.title':    'Datenbankentwicklung',
  'module.database.subtitle': 'SQL, MariaDB, Galera, MaxScale',

  'module.python.title':    'Python-Grundlagen',
  'module.python.subtitle': 'Syntax, Kontrollstrukturen und Funktionen',

  'module.react.title':    'React-Grundlagen',
  'module.react.subtitle': 'Komponenten, State und Effekte',

  'module.react-native.title':    'React Native Grundlagen',
  'module.react-native.subtitle': 'Mobile Komponenten, Navigation, State',

  'module.interview.title':    'Interview-Vorbereitung',
  'module.interview.subtitle': 'Medizininformatik, Governance und Leadership-Themen',

  'module.ukm-prep.title':    'UKM-Jobstart',
  'module.ukm-prep.subtitle': 'Vertragsunterzeichnung, Einarbeitung und erste Wochen am UKM Münster',

  // ── Lesson titles & subtitles — Database ────────────────────────────────
  'lesson.db-masterplan.title':    'Masterplan',
  'lesson.db-masterplan.subtitle': 'Überblick über den gesamten Lernpfad',

  'lesson.db-overview.title':    'DB-Überblick',
  'lesson.db-overview.subtitle': 'Gesamtbild und Roadmap',

  'lesson.db-linux.title':    'Linux & RedHat',
  'lesson.db-linux.subtitle': 'DBA-Grundlagen',

  'lesson.db-sql-mysql.title':    'SQL & MySQL',
  'lesson.db-sql-mysql.subtitle': 'Grundlegender SQL-Lernpfad',

  'lesson.db-design.title':    'Datenbankdesign',
  'lesson.db-design.subtitle': 'Modellierung und ERDs',

  'lesson.db-advanced-sql.title':    'Fortgeschrittenes SQL',
  'lesson.db-advanced-sql.subtitle': 'Komplexe Abfragemuster',

  'lesson.db-internals.title':    'DB-Interna',
  'lesson.db-internals.subtitle': 'Speicher- und Engine-Interna',

  'lesson.db-admin.title':    'MariaDB-Administration',
  'lesson.db-admin.subtitle': 'Betrieb und Produktions-Workflows',

  'lesson.db-galera.title':    'Galera Cluster',
  'lesson.db-galera.subtitle': 'Hochverfügbarkeit und Replikation',

  'lesson.db-maxscale.title':    'MaxScale',
  'lesson.db-maxscale.subtitle': 'Traffic-Steuerung und Skalierung',

  // ── Lesson titles & subtitles — Python ──────────────────────────────────
  'lesson.py-basics.title':    'Python-Grundlagen',
  'lesson.py-basics.subtitle': 'Variablen, Typen und Operatoren',

  'lesson.py-flow.title':    'Kontrollstrukturen',
  'lesson.py-flow.subtitle': 'Bedingungen und Schleifen',

  'lesson.py-functions.title':    'Funktionen & Module',
  'lesson.py-functions.subtitle': 'Wiederverwendbare Logik und Pakete',

  // ── Lesson titles & subtitles — React ───────────────────────────────────
  'lesson.react-components.title':    'Komponenten & JSX',
  'lesson.react-components.subtitle': 'Bausteine von React-Apps',

  'lesson.react-state.title':    'State & Events',
  'lesson.react-state.subtitle': 'Interaktive UI-Muster',

  'lesson.react-effects.title':    'Effekte & Datenabruf',
  'lesson.react-effects.subtitle': 'Seiteneffekte und Lebenszyklus',

  // ── Lesson titles & subtitles — React Native ────────────────────────────
  'lesson.rn-ui.title':    'Native UI-Primitive',
  'lesson.rn-ui.subtitle': 'View, Text und das Styling-Modell',

  'lesson.rn-navigation.title':    'Navigation Grundlagen',
  'lesson.rn-navigation.subtitle': 'Bildschirmübergänge und Stacks',

  'lesson.rn-state.title':    'State & Async-Daten',
  'lesson.rn-state.subtitle': 'Hooks und API-Integration',

  // ── Lesson titles & subtitles — Interview Prep ──────────────────────────
  'lesson.interview-general.title':    'Allgemeiner Überblick',
  'lesson.interview-general.subtitle': 'Einführung und Orientierung',

  'lesson.interview-mindmap.title':    'Mind Map',
  'lesson.interview-mindmap.subtitle': 'Gesamtübersicht aller Themen',

  'lesson.interview-gics.title':    'GICS / GPAs',
  'lesson.interview-gics.subtitle': 'Governance- und Performance-Strukturen',

  'lesson.interview-mii.title':    'MII / MIRACUM / NUM',
  'lesson.interview-mii.subtitle': 'Medizininformatik-Initiativen',

  'lesson.interview-hdsig.title':    'HDSIG',
  'lesson.interview-hdsig.subtitle': 'Gesundheitsdatenstandards und Interoperabilität',

  'lesson.interview-din.title':    'DIN 62304 / 14971',
  'lesson.interview-din.subtitle': 'Medizinsoftware- und Risikomanagementnormen',

  'lesson.interview-leitung.title':    'Akademische Führung',
  'lesson.interview-leitung.subtitle': 'Führung in akademischen Einrichtungen',

  'lesson.interview-register.title':    'Deutsches Führungsregister',
  'lesson.interview-register.subtitle': 'Führungsstrukturen und Registrierung',

  // ── Lesson titles & subtitles — UKM Job Start ───────────────────────────
  'lesson.ukm-hoffmann.title':    'Meeting: Frau Hoffmann',
  'lesson.ukm-hoffmann.subtitle': 'Vertragsunterzeichnung & §16 TV-L Stufenantrag',

  'lesson.ukm-self-introduction.title':    'Selbstvorstellung',
  'lesson.ukm-self-introduction.subtitle': 'Wie man sich am UKM vorstellt',

  'lesson.ukm-hoffmann-questions.title':    'Frau Hoffmann — Ihre Seite',
  'lesson.ukm-hoffmann-questions.subtitle': 'Ihre Fragen, Dokumentenanforderungen & heikle Momente',

  // ── Shell sidebar ────────────────────────────────────────────────────────
  'shell.backToFields':    'Pfade',
  'shell.backToModules':   'Module',
  'shell.modulesTitle':    'Module',
  'shell.lessonsTitle':    'Lektionen',
  'shell.currentModule':   'Aktuelles Modul',
  'shell.globalLMS':       'Gesamtfortschritt',
  'shell.resetButton':     'Alle Fortschritte zurücksetzen',
  'shell.chooseModule':    'Modul wählen',
  'shell.chooseModuleSub': 'Mit Datenbank beginnen oder zum Frontend- bzw. Mobile-Pfad wechseln.',
  'shell.backToField':     'Module',
  'shell.chooseLesson':    'Lektion wählen',

  // ── Welcome panel ────────────────────────────────────────────────────────
  'welcome.heading': 'Deine Lernplattform',
  'welcome.body':    'Wähle ein Modul aus der linken Seitenleiste und dann eine Lektion zum Starten.',

  // ── Personalized Lessons entry (fields-landing card) ─────────────────────
  'pl.fieldTitle':      'Personalisierte Lektionen',
  'pl.fieldSubtitle':   'Lektionen, die für dich gemacht sind',
  'pl.signInRequired':  'Anmeldung erforderlich',
  'pl.lessonsReady':    'Lektionen bereit',

  // ── Auth panel ───────────────────────────────────────────────────────────
  'auth.accountMenu':  'Konto',
  'auth.signInTitle':  'Anmelden zum Synchronisieren des Fortschritts',
  'auth.googleButton': 'Mit Google fortfahren',
  'auth.orDivider':    'oder',
  'auth.signInButton': 'Anmelden',
  'auth.signUpButton': 'Konto erstellen',
  'auth.adminPanel':   'Adminbereich ↗',
  'auth.signOut':      'Abmelden',

  // ── Lesson gate prompts (needs-auth / needs-pro) ─────────────────────────
  'gate.authHeading': 'Anmelden erforderlich',
  'gate.authBody':    'Erstelle ein kostenloses Konto, um deinen Fortschritt zu verfolgen und diesen Inhalt freizuschalten.',
  'gate.proHeading':  'Pro-Zugang erforderlich',
  'gate.proBody':     'Diese Lektion ist im Pro-Plan verfügbar. Upgraden, um personalisierte Inhalte und KI-Übungen freizuschalten.',
  'gate.authCta':     'Anmelden oder Konto erstellen →',
  'gate.signInLabel': 'Anmelden',
  'gate.proLabel':    'Pro',

  // ── Progress bars ────────────────────────────────────────────────────────
  'progress.module':   'Modul',
  'progress.overall':  'Gesamt',
  'progress.complete': '% abgeschlossen',

  // ── Module card labels ───────────────────────────────────────────────────
  'module.lessons':        'Lektionen',

  // ── Lesson nav labels ────────────────────────────────────────────────────
  'lesson.referenceLabel': 'Referenz',
};