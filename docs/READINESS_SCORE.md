# Pivot-Readiness Score

The score answers “Am I ready to apply now?” using evidence and market signals. It is a deterministic decision aid, not a hiring probability. All component calculations live in `lib/readiness/score.ts`; no language model participates in the arithmetic.

## Formula and weights

`Overall = round(0.30 × skills + 0.20 × portfolio + 0.20 × interviews + 0.15 × application quality + 0.15 × market demand)`

| Component | Formula and inputs |
| --- | --- |
| Skill coverage (30%) | Evidence-weighted share of must-have and differentiator skills, using each skill’s posting frequency as its weight. Confirmed resume evidence, user confirmations, and linked work count. |
| Portfolio (20%) | A completed project mapped to a role gap earns 1 unit; a linked artifact adds 0.75 and a met success metric adds 0.5. Three units reach 100. |
| Interviews (20%) | Mean of scores on a 0–100 scale, decayed by `exp(-ageDays / 180)`, multiplied by a question-type coverage factor (0.7–1.0) and a session-count factor capped at 3 sessions. |
| Application quality (15%) | Resume keyword coverage, minus 15 points per unsupported claim (penalty capped at 45), plus a small response-signal adjustment after 10 applications. Clamped to 0–100. |
| Market demand (15%) | 35 baseline + up to 35 points from collected postings + up to 20 from recent postings + 10% of location fit; clamped to 0–100. |

Every displayed component includes its raw input counts, counted evidence, missing evidence, and component weight. Missing evidence contributes zero; AI-generated suggestions do not count as proof.

## Verdict bands

| Score | Verdict |
| --- | --- |
| 0–39 | Not yet |
| 40–59 | Build first |
| 60–74 | Nearly ready |
| 75–100 | Ready to apply |

The score is an explicit directional answer, not a guarantee. At 60+, the product encourages selective applications while the user continues to strengthen weak areas.

## Confidence and range

- **High:** at least 20 postings, 5 scored interviews, and 10 applications; range is score ±5.
- **Medium:** at least 8 postings and 2 interviews; range is score ±10.
- **Low:** anything sparser; range is score ±18.

Bounds are clipped to 0–100. Confidence is about evidence quantity, not model certainty. Application segments below 10 records are labeled low confidence.

## Worked example

Suppose skill coverage is 72, portfolio 75, interviews 64, application quality 68, and market demand 80:

`0.30×72 + 0.20×75 + 0.20×64 + 0.15×68 + 0.15×80 = 71.0`

That yields **71, Nearly ready**. With sparse inputs, the UI would show a likely range of **53–89** and explain which missing signals would narrow it. The current demo data scores approximately 68 with medium confidence and a range of 58–78.

## Action simulations and history

Actions are applied to a copy of the current inputs and rescored. Ranking uses projected score gain divided by estimated effort hours; no external AI call is involved. The database stores score snapshots with the event type and component JSON, enabling a role-specific timeline. Recalculate after skills, completed tasks, linked project artifacts, scored interviews, application updates, and job refreshes.
