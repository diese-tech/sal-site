# Frontend styling contract

SAL is a Tailwind-first React application. Tailwind utilities remain the source
of layout, spacing, color, responsive behavior, and one-off visual treatment.
BEM names are stable semantic hooks layered alongside those utilities; they do
not replace Tailwind or change runtime behavior.

## Naming

- Component block: `sal-button`, `sal-ticker`, `sal-glow-panel`
- Component element: `sal-ticket__summary`
- Component modifier: `sal-button--ember`
- Single-purpose utility: `u-font-display`, `u-live-pulse`
- State hook: `is-active`, `has-results`

Modifiers must be used with their base block. For example:

```tsx
<button className="sal-button sal-button--ember px-4 py-2">Save</button>
```

Do not encode page position, React state values, or visual declarations into a
component block name. Tailwind responsive and state variants remain valid and
are excluded from the authored-class check.

## Where to edit

- Page composition: `src/app/**/page.tsx`
- Reusable public UI: `src/components/league`, `src/components/nav`,
  `src/components/rules`, `src/components/watch`
- Admin UI: `src/components/admin`
- Auth, bug-report, draft, and lab surfaces: their matching component folders
- Shared tokens, keyframes, and authored BEM hooks: `src/app/globals.css`

Avoid frontend-only changes in `src/app/api`, `src/lib`, `src/types`,
`supabase`, or the database contract files.

## Verification

Run `npm run check:bem` after adding or renaming an authored global class. The
check rejects legacy aliases, orphan modifiers, dead global selectors, and
custom class names outside the SAL BEM/utility/state namespaces.
