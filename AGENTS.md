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

- Frontend works standalone in Demo Mode; all chain access goes through src/lib/blockchain.ts and is enabled only by VITE_MST_* env vars — never hard-code network values.
- Simulated records must carry source "demo" and be labelled Simulated in UI.
