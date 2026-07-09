# Kelly Education Intel

Kelly Education Intel is a local App-in-Skill cockpit for schools, tutoring centers, admissions advisors, and education operators. It converts exams, policy dates, visa updates, parent questions, and competitor course movement into enrollment actions.

## What It Shows

- Overview: the enrollment or parent-service trigger worth acting on today.
- Signals: exam, admissions, visa, scholarship, school-calendar, competitor, and parent-question signals.
- Actions: parent FAQ updates, course launch angles, webinar topics, advisor scripts, and checklist tasks.
- Drafts: editable enrollment messages, parent memos, webinar blurbs, and consultation scripts.
- Sources: education bureaus, exam boards, school notices, university updates, and parent discussion sources.

## How It Flows

1. The agent grounds every recommendation in dated public education sources or marks it blocked.
2. Kelly reviews the buyer anxiety behind each signal and approves the right enrollment or service action.
3. Approved drafts export only after a local dry run records exactly what would be handed off.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Education Intel overview"></td>
    <td width="50%"><img src="assets/screenshots/signals.webp" alt="Kelly Education Intel signals"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Education-intelligence desk with enrollment triggers, ready actions, blocked claims, and source freshness.</td>
    <td><strong>Signals</strong><br>Exam, admissions, visa, school-calendar, and parent-question movement interpreted as purchase anxiety.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/actions.webp" alt="Kelly Education Intel actions"></td>
    <td width="50%"><img src="assets/screenshots/drafts.webp" alt="Kelly Education Intel drafts"></td>
  </tr>
  <tr>
    <td><strong>Actions</strong><br>Parent FAQ, webinar, advisor, and course-launch actions with review status.</td>
    <td><strong>Drafts</strong><br>Editable parent memos and enrollment copy that avoid guarantees and unsupported claims.</td>
  </tr>
</table>

## Demo Mode

```bash
skills/kelly-education-intel/app/start.sh
```

Use `?demo=overview&lang=en#/overview`, `?demo=signals&lang=en#/signals`, `?demo=actions&lang=en#/actions`, or `?demo=drafts&lang=en#/drafts`.

## Boundary

The skill blocks admission guarantees, grade promises, immigration/legal advice, and unsourced claims about schools or credentials.
