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
- Stored eye displays use the shared `StoredEyePhoto` with the current pupil ROI path; original reads require explicit admin selection and storage RLS. Why: hiding controls alone cannot enforce patient privacy.
- Pupil circle is stored normalised: cx/width, cy/height, r/width. Crops (export + demo) use `cropPupil` (side 2.5×r, 224px). Why: training/inference must match.
- Consensus label = strict majority (`majority` in `src/lib/labels.ts`); ties count as no consensus/unlabelled.
- Shared guided capture owns camera tracks and closes them on exit; browser-only iris detection is dynamically imported with externalized WASM assets. Why: privacy and SSR safety.
- Capture metadata is normalized to the full video frame; masked ROI storage is additive, versioned via a separate path column, and uses a separate image helper from inference. Why: preserve existing data and model preprocessing.
- Research model settings are read by approved roles and writable only under admin RLS. Why: configuration cannot grant client-side privileges.

- Circle confirmation is invalidated by every circle edit and gates screening save and demo inference. Why: automatic landmarks alone are not trustworthy for pupil selection.
- Admin regeneration and ZIP masked exports derive current ROIs from saved circles and originals, never legacy wide masks. Why: all privacy images must share the same crop geometry.
- Stored-photo path selection is centralized and fail-closed when a current ROI is absent. Why: no view may accidentally fall back to an original for non-admin roles.
