# QualityOS Phase 1 — domain model

QualityOS treats quality work as a traceable chain from a measurable signal to a controlled, owned action. Phase 1 uses a small fixture that exercises this chain without attempting to become a full MES, QMS, or supplier portal.

## Core entities

| Entity | Purpose | Phase 1 fields |
| --- | --- | --- |
| Part | The manufactured or purchased item under quality control. | `partNumber`, `revision`, `description`, `criticalCharacteristics` |
| Supplier | The external source responsible for supplied material or processing. | `supplierId`, `name`, `site`, `qualityContact` |
| Process | The operation and station where a measurement is made. | `processId`, `name`, `station`, `line` |
| Lot | A traceability boundary for material or production. | `lotId`, `partNumber`, `supplierId`, `receivedAt`, `quantity`, `status` |
| Inspection | A measurement or inspection event against a lot, part, or process. | `inspectionId`, `lotId`, `characteristic`, `value`, `unit`, `measuredAt`, `inspector` |
| Defect | A classified departure from a requirement. | `defectId`, `family`, `code`, `severity`, `sourceInspectionId` |
| Quality signal | A detected pattern or threshold breach that merits attention. | `signalId`, `signalType`, `severity`, `rule`, `detectedAt`, `status`, `sourceIds[]` |
| Nonconformance | The controlled record for a confirmed or suspected quality issue. | `ncrId`, `title`, `riskScore`, `owner`, `lotIds[]`, `status` |
| Containment | Immediate action that limits exposure while cause is investigated. | `containmentId`, `ncrId`, `scope`, `action`, `verifiedBy`, `verifiedAt` |
| Corrective action | An owned action intended to remove the cause and prevent recurrence. | `actionId`, `ncrId`, `title`, `owner`, `dueAt`, `priority`, `status`, `acceptanceCriteria` |
| CAPA / 8D | A structured root-cause and systemic-improvement record. | `capaId`, `ncrId`, `method`, `team`, `rootCause`, `effectivenessCheck` |
| Evidence | A file, image, measurement set, or note that supports a quality decision. | `evidenceId`, `entityType`, `entityId`, `kind`, `name`, `uploadedBy`, `uploadedAt` |

## Relationships

```text
Part ──< Lot >── Supplier
  │       │
  └──< Inspection >── Process
            │
            └──< Defect >── Quality signal
                              │
                              └── Nonconformance
                                   ├── Containment
                                   ├── Corrective action
                                   ├── CAPA / 8D
                                   └── Evidence
```

## Status vocabulary

- Signal: `new`, `acknowledged`, `contained`, `investigating`, `resolved`, `dismissed`
- Lot: `released`, `quarantined`, `under_sort`, `rejected`, `closed`
- Action: `open`, `in_progress`, `blocked`, `complete`, `effectiveness_check`
- Evidence: `requested`, `received`, `verified`, `rejected`

## Phase 1 fixture

The UI fixture centers on `BRK-204`, lot `L240908-17`, supplied by Northstar Precision. A burr-height trend crosses the `0.42 mm` upper control limit on Press 04. The path demonstrated in the app is:

1. SPC rule 1 detects a trend and creates a quality signal.
2. The lot is quarantined and a 100% sort begins.
3. `NCR-0264` captures the affected lot, supplier, owner, and suspected tool-wear cause.
4. The operator creates `CA-0142` with an owner, due date, and acceptance criteria.

