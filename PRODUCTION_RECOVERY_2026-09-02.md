# WeaveRelay production recovery anchor — 2026-09-02

This file records the recovery points created after the cross-system diagnosis/provider control-plane release.

- Production merge commit: `15597b1047fabee53a31eb1c6c7e6f79592947e4`
- Production safety branch: `production-safe-2026-09-02`
- Reconciled pre-merge archive: `archive-cross-system-diagnosis-2026-09-02`
- Reconciled pre-merge commit: `1a21e2536d688aa255c4179c05444a076cc1cf0b`
- Earlier locked Client #2 rollback branch remains: `client2-known-good-2026-09-02`

Do not delete or repoint these branches during ordinary development. They exist so the complete September 2 release can be recovered even if later work regresses `main`.
