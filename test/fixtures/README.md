# Test fixtures

Real-shaped files the suites read with the actual SheetJS, not mocks.

| File | What it exercises |
| --- | --- |
| `KN02_Stock_Take_Witness_Count_Sample.xlsx` | the NBI count sheet: a header block above the table, a Physical Count and a Witness column, cable drum lines that must not be double-counted against the sheet figure |
| `Actavo_Ballinrobe_yard_check.xlsx` | a different contractor's shape — eight columns instead of seven, a lone "Count" heading, a location not on any register — so export round-trips the sheet that came in rather than a canonical one |
| `TLI_blank_count_sheet.xlsx` | nothing counted yet |
| `TLI_review_sheet.xlsx` | two near-identical coach screws and a fibre row measured in km, for the disambiguation and unit paths in a review walk |

`sample-data/` in the repo root is different: those are for a person to try the
importer with by hand. These are for the machine.
