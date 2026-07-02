#!/usr/bin/env python3
"""Score a tenet-security run against a fixture's ground-truth manifest.

Measures recall (did the skill catch the planted vulnerabilities?) and precision
(did it avoid flagging the safe decoys?), broken down by vulnerability class.

Usage:
    python3 evals/score-fixtures.py \
        --expected evals/fixtures/security-recall/EXPECTED.json \
        --report   /path/to/scanned/.healthcheck/reports/security.json \
        [--secrets /path/to/scanned/.healthcheck/reports/secrets.json]

The report path is the security.json produced by running tenet-security with the
fixture directory as the project root. Exit code is non-zero if recall < --min-recall
or any precision violation occurs, so this can gate CI.
"""
import argparse
import json
import os
import sys

SEV_ORDER = {"info": 0, "minor": 1, "major": 2, "critical": 3}


def norm(path: str) -> str:
    """Normalize a finding file path for matching (strip leading ./, lowercase)."""
    if not path:
        return ""
    return path.replace("\\", "/").lstrip("./").lower()


def load_findings(report_path: str):
    if not report_path or not os.path.exists(report_path):
        return []
    with open(report_path) as f:
        data = json.load(f)
    return data.get("findings", [])


def file_matches(finding_file: str, expected_file: str) -> bool:
    ff, ef = norm(finding_file), norm(expected_file)
    if not ff:
        return False
    return ff == ef or ff.endswith("/" + ef) or ef.endswith("/" + ff) or os.path.basename(ff) == os.path.basename(ef)


def sev(finding) -> int:
    return SEV_ORDER.get(str(finding.get("severity", "info")).lower(), 0)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--expected", required=True)
    ap.add_argument("--report", required=True, help="produced security.json")
    ap.add_argument("--secrets", help="produced secrets.json (optional, for secrets decoys)")
    ap.add_argument("--min-recall", type=float, default=0.8)
    args = ap.parse_args()

    with open(args.expected) as f:
        expected = json.load(f)

    sec_findings = load_findings(args.report)
    secret_findings = load_findings(args.secrets) if args.secrets else []
    all_findings = sec_findings + secret_findings

    # ---- Recall ----
    per_class = {}
    matched, missed = [], []
    for exp in expected["expected_findings"]:
        need = SEV_ORDER[exp["min_severity"]]
        hit = next(
            (fd for fd in all_findings if file_matches(fd.get("file", ""), exp["file"]) and sev(fd) >= need),
            None,
        )
        cls = exp["class"]
        per_class.setdefault(cls, {"hit": 0, "total": 0})
        per_class[cls]["total"] += 1
        if hit:
            per_class[cls]["hit"] += 1
            matched.append(exp)
        else:
            missed.append(exp)

    recall = len(matched) / len(expected["expected_findings"]) if expected["expected_findings"] else 1.0

    # ---- Precision (decoy false positives) ----
    fp = []
    expected_files = {norm(e["file"]) for e in expected["expected_findings"]}
    for dec in expected["decoys"]:
        cap = dec.get("allowed_max_severity")
        cap_lvl = SEV_ORDER[cap] if cap else -1
        for fd in all_findings:
            if file_matches(fd.get("file", ""), dec["file"]) and sev(fd) > cap_lvl:
                fp.append({"decoy": dec["id"], "file": dec["file"], "label": dec["label"],
                           "flagged_as": fd.get("severity"), "title": fd.get("title", "")})

    # Findings on files that are neither a plant nor a decoy = stray false positives (informational)
    known = expected_files | {norm(d["file"]) for d in expected["decoys"]}
    stray = [fd for fd in sec_findings if norm(fd.get("file", "")) and norm(fd.get("file", "")) not in known
             and sev(fd) >= SEV_ORDER["major"]]

    tp = len(matched)
    precision = tp / (tp + len(fp)) if (tp + len(fp)) else 1.0

    # ---- Report ----
    print("=" * 60)
    print(f"Fixture: {expected['fixture']}")
    print("=" * 60)
    print("\nRecall by class:")
    for cls in sorted(per_class):
        c = per_class[cls]
        print(f"  {cls:16s} {c['hit']}/{c['total']}")
    print(f"\n  OVERALL RECALL   : {tp}/{len(expected['expected_findings'])} = {recall:.0%}")
    print(f"  OVERALL PRECISION: {precision:.0%}  ({len(fp)} decoy false positive(s))")

    if missed:
        print("\nMISSED plants (recall gaps):")
        for m in missed:
            print(f"  - {m['id']} {m['rule']:18s} {m['file']}")
    if fp:
        print("\nDECOY FALSE POSITIVES (precision gaps):")
        for f in fp:
            print(f"  - {f['decoy']} {f['label']:22s} {f['file']} flagged {f['flagged_as']}: {f['title']}")
    if stray:
        print("\nSTRAY findings on non-fixture files (review — may be extra FPs):")
        for s in stray:
            print(f"  - {s.get('severity')} {s.get('file')}: {s.get('title','')}")

    ok = recall >= args.min_recall and not fp
    print("\n" + ("PASS" if ok else "FAIL") +
          f"  (threshold: recall >= {args.min_recall:.0%}, zero decoy FPs)")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
