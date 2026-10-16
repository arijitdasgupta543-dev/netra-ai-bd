<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Netra AI rules
- All UI text goes through `useLang().L(en, bn)` / `T({en,bn})`; default language Bangla. Why: every label must be bilingual.
- Data pages live under `src/routes/_authenticated/` and wrap content in `RoleGate`; real access control is RLS + `has_role`/`has_any_role`. Why: UI gates are cosmetic.
- Photos live in private bucket `eye-photos`, read only through signed URLs (`src/lib/storage.ts`). Why: patient privacy.
- Pupil circle is stored normalised: cx/width, cy/height, r/width. Crops (export + demo) use `cropPupil` (side 2.5×r, 224px). Why: training/inference must match.
- Consensus label = strict majority (`majority` in `src/lib/labels.ts`); ties count as no consensus/unlabelled.
