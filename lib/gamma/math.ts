/** Black-76 與數值工具（取代 scipy.stats.norm / scipy.optimize.brentq） */

export const R = 0.017; // 無風險利率
export const MULT = 50; // TXO 每點 50 元

const INV_SQRT_2PI = 1 / Math.sqrt(2 * Math.PI);

export function normPdf(x: number): number {
  return INV_SQRT_2PI * Math.exp(-0.5 * x * x);
}

/** 標準常態 CDF（透過 erfc 的 Chebyshev 逼近，相對誤差 < 1.2e-7） */
export function normCdf(x: number): number {
  return 0.5 * erfc(-x / Math.SQRT2);
}

function erfc(x: number): number {
  // Numerical Recipes erfcc（Chebyshev），誤差 < 1.2e-7；對 IV 反推已足夠
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t *
                          (0.27886807 +
                            t *
                              (-1.13520398 +
                                t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))
    );
  return x >= 0 ? r : 2 - r;
}

export type CallPut = "C" | "P";

export function b76(F: number, K: number, T: number, s: number, cp: CallPut): number {
  const sq = s * Math.sqrt(T);
  const d1 = (Math.log(F / K) + 0.5 * s * s * T) / sq;
  const d2 = d1 - sq;
  const df = Math.exp(-R * T);
  return cp === "C"
    ? df * (F * normCdf(d1) - K * normCdf(d2))
    : df * (K * normCdf(-d2) - F * normCdf(-d1));
}

export function gamma(F: number, K: number, T: number, s: number): number {
  const sq = s * Math.sqrt(T);
  const d1 = (Math.log(F / K) + 0.5 * s * s * T) / sq;
  return (Math.exp(-R * T) * normPdf(d1)) / (F * sq);
}

/** Brent 求根；端點同號時回傳 NaN（對應 Python 的 except → nan） */
export function brent(f: (x: number) => number, lo: number, hi: number, tol = 1e-10, maxIter = 100): number {
  let a = lo;
  let b = hi;
  let fa = f(a);
  let fb = f(b);
  if (!Number.isFinite(fa) || !Number.isFinite(fb) || fa * fb > 0) return NaN;
  let c = a;
  let fc = fa;
  let d = b - a;
  let e = d;
  for (let i = 0; i < maxIter; i++) {
    if (fb * fc > 0) {
      c = a;
      fc = fa;
      d = b - a;
      e = d;
    }
    if (Math.abs(fc) < Math.abs(fb)) {
      a = b;
      b = c;
      c = a;
      fa = fb;
      fb = fc;
      fc = fa;
    }
    const tol1 = 2 * Number.EPSILON * Math.abs(b) + 0.5 * tol;
    const xm = 0.5 * (c - b);
    if (Math.abs(xm) <= tol1 || fb === 0) return b;
    if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
      const s = fb / fa;
      let p: number;
      let q: number;
      if (a === c) {
        p = 2 * xm * s;
        q = 1 - s;
      } else {
        const qq = fa / fc;
        const r = fb / fc;
        p = s * (2 * xm * qq * (qq - r) - (b - a) * (r - 1));
        q = (qq - 1) * (r - 1) * (s - 1);
      }
      if (p > 0) q = -q;
      p = Math.abs(p);
      if (2 * p < Math.min(3 * xm * q - Math.abs(tol1 * q), Math.abs(e * q))) {
        e = d;
        d = p / q;
      } else {
        d = xm;
        e = d;
      }
    } else {
      d = xm;
      e = d;
    }
    a = b;
    fa = fb;
    b += Math.abs(d) > tol1 ? d : xm > 0 ? tol1 : -tol1;
    fb = f(b);
  }
  return b;
}

/** 反推 Black-76 隱含波動率；價格不高於內含價值 + 0.05 時無法反推 → NaN */
export function impliedVol(F: number, K: number, T: number, px: number, cp: CallPut): number {
  const intrinsic = Math.max(0, cp === "C" ? F - K : K - F) * Math.exp(-R * T);
  if (!(px > intrinsic + 0.05)) return NaN;
  return brent((s) => b76(F, K, T, s, cp) - px, 0.01, 5);
}

/** 依序位置線性內插，再 bfill / ffill（對應 pandas interpolate().bfill().ffill()） */
export function fillByPosition(values: readonly number[]): number[] {
  const known = values.flatMap((v, i) => (Number.isNaN(v) ? [] : [i]));
  if (known.length === 0) return [...values];
  return values.map((v, i) => {
    if (!Number.isNaN(v)) return v;
    if (i < known[0]) return values[known[0]];
    const last = known[known.length - 1];
    if (i > last) return values[last];
    const right = known.find((k) => k > i)!;
    const left = [...known].reverse().find((k) => k < i)!;
    const w = (i - left) / (right - left);
    return values[left] + w * (values[right] - values[left]);
  });
}
