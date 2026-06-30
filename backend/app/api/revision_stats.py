"""Revision diagnostics for the vintage workbench — pure-Python, stdlib `math` only.

Computes, over a series' full revision history, the standard real-time-data statistics (mean revision,
mean absolute revision, RMS revision, fraction-correct-sign, lag-1 persistence) and an HONEST bias
significance test. The test is the EWC (equal-weighted-cosine) fixed-b statistic (Lazarus-Lewis-Stock-
Watson 2018), referred to a fixed-b *asymptotic* t_B distribution — a finite-B correction to the normal
reference that reduces, but does not eliminate, the over-rejection a naive Newey-West-with-normal-criticals
test suffers on short autocorrelated panels.

Why a dedicated bias test + a GATE: revision panels are short and serially correlated (GDP revision
persistence rho ~= 0.90, Aruoba 2008), and HAC t-tests OVER-REJECT there — they would emit a false
"significant bias". The driver of that distortion is the autocorrelation rho, NOT the sample size, so the
verdict is withheld whenever |rho_hat_1| is high OR n is small; in those states the point estimate ships
with a wide CI and an explicit "can't test reliably" readout, never "significant at 5%". A symmetric
power caveat (minimum detectable effect) guards the opposite error — a false "no bias".

No numpy/scipy/statsmodels: every quantity is elementary arithmetic over a 1-D list; the Student-t CDF is
the regularized incomplete beta via a Lentz continued fraction. Verified against R's qt() to 4 dp
(t_ppf(.975, 10) = 2.2281, t_ppf(.975, 3) = 3.1824).
"""

from __future__ import annotations

import math
from datetime import date, timedelta

N_GATE = 24  # conservative floor above the B>=3 onset (n=21); config-overridable. NOT the primary defense.
RHO_HIGH = 0.7  # |rho_hat_1| above which EWC over-rejects (measured size > ~7.5% near the gate) -> withhold.
REVISED_EPS = 1e-9  # series-fallback tolerance: a revision counts only beyond float-subtraction noise.
HORIZON_DAYS = 400  # measure the revision over ~1 year, not first-to-latest, to EXCLUDE multi-year rebasing.
REL_GUARD = 0.10  # a within-horizon change > 10% of the level is a base redefinition, not a revision -> drop.

_FREQ_NOUN = {"D": "days", "W": "weeks", "M": "months", "Q": "quarters", "A": "years"}


# ── Student-t CDF / inverse via the regularized incomplete beta (Numerical Recipes) ──────────


def _betacf(a: float, b: float, x: float) -> float:
    """Continued fraction for the incomplete beta (Lentz's method)."""
    MAXIT, EPS, FPMIN = 200, 3.0e-12, 1.0e-300
    qab, qap, qam = a + b, a + 1.0, a - 1.0
    c = 1.0
    d = 1.0 - qab * x / qap
    if abs(d) < FPMIN:
        d = FPMIN
    d = 1.0 / d
    h = d
    for m in range(1, MAXIT + 1):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        if abs(d) < FPMIN:
            d = FPMIN
        c = 1.0 + aa / c
        if abs(c) < FPMIN:
            c = FPMIN
        d = 1.0 / d
        h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d
        if abs(d) < FPMIN:
            d = FPMIN
        c = 1.0 + aa / c
        if abs(c) < FPMIN:
            c = FPMIN
        d = 1.0 / d
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < EPS:
            break
    return h


def _betai(a: float, b: float, x: float) -> float:
    """Regularized incomplete beta I_x(a, b)."""
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0
    lbeta = math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b)
    bt = math.exp(lbeta + a * math.log(x) + b * math.log(1.0 - x))
    if x < (a + 1.0) / (a + b + 2.0):
        return bt * _betacf(a, b, x) / a
    return 1.0 - bt * _betacf(b, a, 1.0 - x) / b


def _t_cdf(t: float, df: float) -> float:
    """Student-t CDF — general (both tails); the t<0 branch is included so a one-sided caller can't
    silently get the wrong tail."""
    x = df / (df + t * t)
    ib = 0.5 * _betai(df / 2.0, 0.5, x)
    return 1.0 - ib if t >= 0 else ib


def _t_ppf(q: float, df: float) -> float:
    """Inverse Student-t CDF via bisection (monotone, robust; no scipy)."""
    lo, hi = -1.0e6, 1.0e6
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if _t_cdf(mid, df) < q:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


# ── Point statistics + persistence ───────────────────────────────────────────────────────


def _mean(xs: list[float]) -> float:
    return sum(xs) / len(xs)


def _lag1_autocorr(r: list[float], mr: float) -> float | None:
    """First-order sample autocorrelation of the revision series (observation-date order)."""
    n = len(r)
    if n < 3:
        return None
    denom = sum((x - mr) ** 2 for x in r)
    if denom == 0:
        return None
    num = sum((r[t] - mr) * (r[t - 1] - mr) for t in range(1, n))
    return num / denom


# ── The EWC fixed-b bias test ──────────────────────────────────────────────────────────────


def _ewc_bias_test(r: list[float], rho_hat_1: float | None, alpha: float = 0.05) -> dict:
    """EWC fixed-b test of H0: mean(r) = 0, `r` in observation-date order. Gated on n AND rho."""
    n = len(r)
    if n < 4:  # B < 3 -> the t_B reference is not usable; MR/MAR shown by the caller, NO CI here.
        return {"verdict": "insufficient", "n": n, "significant": None}
    b_df = min(max(1, math.floor(0.4 * n ** (2.0 / 3.0))), n - 1)
    mr = _mean(r)
    z = [x - mr for x in r]
    # Type-II DCT projection onto low-frequency cosines j=1..B; EWC long-run variance = mean of squares.
    omega = (
        sum(
            (math.sqrt(2.0 / n) * sum(z[t] * math.cos(math.pi * j * (t + 0.5) / n) for t in range(n))) ** 2
            for j in range(1, b_df + 1)
        )
        / b_df
    )
    se = math.sqrt(omega / n)  # Var(mean) = Omega / n
    if se == 0:
        return {"verdict": "no_variation", "n": n, "mr": mr, "significant": None}

    t_stat = mr / se
    tcrit = _t_ppf(1.0 - alpha / 2.0, b_df)  # >> 1.96 at small B -> an honestly wide interval
    p = 2.0 * (1.0 - _t_cdf(abs(t_stat), b_df))
    ci_low, ci_high = mr - tcrit * se, mr + tcrit * se
    mde = tcrit * se  # minimum detectable effect = CI half-width (the power floor)

    too_small = n < N_GATE
    too_persistent = (rho_hat_1 is not None) and (abs(rho_hat_1) > RHO_HIGH)
    gated = too_small or too_persistent

    return {
        "verdict": "estimate_only" if gated else "test",
        "n": n,
        "df_b": b_df,
        "rho_hat_1": rho_hat_1,
        "n_gate": N_GATE,
        "rho_high": RHO_HIGH,
        "mr": mr,
        "bias_se": se,
        "t_stat": t_stat,
        "p_value": None if gated else p,
        "ci_low": ci_low,
        "ci_high": ci_high,
        "ci_level": 1.0 - alpha,
        "mde": mde,
        "significant": None if gated else (p < alpha),
        "gate_reason": "low_n" if too_small else ("high_persistence" if too_persistent else None),
        "se_method": "ewc_fixed_b",
        "ref_dist": "fixed_b_asymptotic_t_b",
        "size_note": (
            "residual over-rejection under autocorrelation; see rho_hat_1"
            if (rho_hat_1 is not None and abs(rho_hat_1) > 0.5)
            else None
        ),
    }


# ── The readout sentence (computed tokens only — no hardcoded magnitudes, no-advice) ────────


def _fmt(v: float, dp: int = 2) -> str:
    return f"{v:.{dp}f}"


def _signed(v: float, dp: int = 2) -> str:
    return f"{v:+.{dp}f}"


def _build_readout(s: dict, period_noun: str) -> str:
    n = s["N"]
    bt = s["bias_test"]
    mr = s["mr"]
    direction = "upward" if mr > 0 else ("downward" if mr < 0 else "negligible")
    sign_clause = (
        f"; the advance sign was correct in {round(s['frac_correct_sign'] * 100)}% of cases"
        if s.get("frac_correct_sign") is not None
        else ""
    )
    head = (
        f"Across {n} revised {period_noun}, first prints of this series carry a mean {direction} "
        f"revision of {_signed(mr)} within a year of first publication "
        f"(typical size {_fmt(s['mar'])}, RMS {_fmt(s['rmsr'])}){sign_clause}."
    )
    verdict = bt["verdict"]

    if verdict == "test":
        sig = bt["significant"]
        sig_clause = (
            "is statistically distinguishable from zero" if sig else "is not statistically distinguishable from zero"
        )
        power_clause = ""
        if (sig is False) and bt["df_b"] < 8:
            power_clause = (
                f"; with n={n} (B={bt['df_b']}) the test has limited power — a true bias up to "
                f"±{_fmt(bt['mde'])} would not be detected"
            )
        bias_tail = (" and biased low" if mr > 0 else " and biased high") if sig else ""
        return (
            f"{head} The mean revision {sig_clause} "
            f"(95% CI {_signed(bt['ci_low'])} to {_signed(bt['ci_high'])}, n={n}, "
            f"lag-1 autocorrelation {_fmt(bt['rho_hat_1'], 2)}){power_clause}. "
            f"Treat the advance level as provisional{bias_tail}."
        )

    if verdict == "estimate_only" and bt.get("gate_reason") == "high_persistence":
        return (
            f"{head} These revisions are strongly serially correlated "
            f"(lag-1 autocorrelation {_fmt(bt['rho_hat_1'], 2)}), so a reliable 5% significance test is "
            f"not available — the point estimate is shown with a wide {round(bt['ci_level'] * 100)}% interval "
            f"({_signed(bt['ci_low'])} to {_signed(bt['ci_high'])}). Treat the advance level as provisional."
        )

    if verdict == "estimate_only":  # low_n
        return (
            f"{head} With only {n} revised observations this is insufficient vintages for a reliable "
            f"significance test — the point estimate is shown with a wide {round(bt['ci_level'] * 100)}% "
            f"interval ({_signed(bt['ci_low'])} to {_signed(bt['ci_high'])}); do not read it as a confirmed "
            f"bias. Treat the advance level as provisional."
        )

    if verdict == "no_variation":
        return (
            f"Across {n} revised {period_noun}, every revision was identical at {_signed(mr)}; "
            f"no significance test is required."
        )

    # insufficient (N < 4)
    return (
        f"{head} With only {n} revised observations there are insufficient vintages to estimate an "
        f"interval or test for bias. Treat the advance level as provisional."
    )


# ── The orchestrator ───────────────────────────────────────────────────────────────────────


def compute_revision_stats(
    observations: list[tuple[date, list[tuple[date, float]]]],
    frequency: str,
    commercial_ok: bool,
    attribution: str,
    strictly_positive_level: bool,
) -> dict:
    """Given each observation's (observation_date, [(vintage_date, value) in vintage order]), compute the
    revision stat block.

    The revision is measured over a SHORT HORIZON (first print vs the value ~1 year later), NOT
    first-to-all-time-latest: that captures the genuine data revision and excludes the multi-year
    benchmark/base-year rebasing that would otherwise dominate (a CPI index base change of −230 index
    points is a redefinition, not a measurement revision). A within-horizon change still exceeding
    `REL_GUARD` of the level is treated as a base change and dropped (counted in `benchmark_excluded`).

    `observations` is sorted here by observation_date (period order) — the bias test reads adjacency for
    serial correlation, so out-of-order input would corrupt rho_hat_1 and the EWC projection.
    """
    ordered = sorted(observations, key=lambda o: o[0])
    revisions: list[float] = []
    pairs: list[tuple[float, float]] = []  # (first_print, near_final)
    benchmark_excluded = 0
    for _obs_date, vints in ordered:
        if len(vints) < 2:
            continue  # single vintage -> not a revisable observation; excluded (never counted as a zero)
        first_vd, first_val = vints[0]
        horizon = first_vd + timedelta(days=HORIZON_DAYS)
        near_final = first_val
        for vd, val in vints[1:]:
            if vd <= horizon:
                near_final = val
            else:
                break
        denom = max(abs(first_val), abs(near_final))
        if denom > 0 and abs(near_final - first_val) / denom > REL_GUARD:
            benchmark_excluded += 1  # base redefinition inside the horizon -> not a measurement revision
            continue
        revisions.append(near_final - first_val)  # r_t = near_final - first_print
        pairs.append((first_val, near_final))

    n = len(revisions)
    if n == 0:
        return {"status": "unavailable", "reason": "no_revisable_observations", "N": 0, "commercial_ok": commercial_ok}

    mr = _mean(revisions)
    mar = _mean([abs(r) for r in revisions])
    rmsr = math.sqrt(_mean([r * r for r in revisions]))
    sd_r = math.sqrt(sum((r - mr) ** 2 for r in revisions) / (n - 1)) if n >= 2 else None
    n_revision_events = sum(1 for r in revisions if abs(r) > REVISED_EPS)
    rho_hat_1 = _lag1_autocorr(revisions, mr)

    # Fraction-correct-sign: only where sign is informative (excludes strictly-positive level series).
    sign_pairs = [(a, b) for (a, b) in pairs if a != 0 and b != 0]
    if not sign_pairs or strictly_positive_level:
        frac_correct_sign = None
    else:
        frac_correct_sign = sum(1 for (a, b) in sign_pairs if (a > 0) == (b > 0)) / len(sign_pairs)

    # Noise-to-signal = SD(revisions) / SD(latest values).
    latest_vals = [b for (_a, b) in pairs]
    sd_latest = math.sqrt(sum((x - _mean(latest_vals)) ** 2 for x in latest_vals) / (n - 1)) if n >= 2 else None
    noise_to_signal = (sd_r / sd_latest) if (sd_r is not None and sd_latest not in (None, 0)) else None

    bias_test = _ewc_bias_test(revisions, rho_hat_1)

    stats = {
        "N": n,
        "mode": "final_within_1y",
        "horizon_days": HORIZON_DAYS,
        "benchmark_excluded": benchmark_excluded,
        "n_revision_events": n_revision_events,
        "eps_basis": "series_fallback",
        "all_zero_revisions": n_revision_events == 0,
        "rho_hat_1": rho_hat_1,
        "mr": mr,
        "mar": mar,
        "rmsr": rmsr,
        "sd_r": sd_r,
        "noise_to_signal": noise_to_signal,
        "frac_correct_sign": frac_correct_sign,
        "bias_test": bias_test,
        "commercial_ok": commercial_ok,
        "attribution": attribution,
    }
    stats["readout"] = _build_readout(stats, _FREQ_NOUN.get(frequency, "observations"))
    return stats
