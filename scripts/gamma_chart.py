"""
加權指數日 K ＋ 斐波那契回撤 ＋ gamma 價位圖。

用法：
  node scripts/gamma_today.ts 2026-11-20 > snap.json
  node scripts/fib_today.ts   2026-11-20 > fib.json
  python scripts/gamma_chart.py snap.json fib.json out.png
"""
import json
import sys

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.patches import Rectangle  # noqa: E402

plt.rcParams["font.sans-serif"] = ["Microsoft JhengHei", "Noto Sans CJK TC", "sans-serif"]
plt.rcParams["axes.unicode_minus"] = False

BG = "#1e1f22"  # Discord 深色背景
FG = "#dbdee1"
GRID = "#3a3c42"
UP = "#e5534b"  # 台股慣例：紅漲
DOWN = "#3fb950"  # 綠跌
FIB = "#d4a72c"
CALL = "#f0883e"
PUT = "#58a6ff"
FLIP = "#bc8cff"
SIGMA = "#8b949e"
CONFLUENCE_TOL = 0.01  # 回撤價位與 gamma 價位相距 1% 以內視為重疊


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def gamma_levels(snap):
    levels = [("買權牆", snap.get("callWall"), CALL), ("賣權牆", snap.get("putWall"), PUT), ("flip", snap.get("flip"), FLIP)]
    return [(name, price, color) for name, price, color in levels if price is not None]


def draw_candles(ax, bars):
    for i, b in enumerate(bars):
        color = UP if b["close"] >= b["open"] else DOWN
        ax.vlines(i, b["low"], b["high"], color=color, linewidth=1)
        body_low = min(b["open"], b["close"])
        body_h = max(abs(b["close"] - b["open"]), 1)
        ax.add_patch(Rectangle((i - 0.35, body_low), 0.7, body_h, color=color))


def draw_hline(ax, x_end, price, color, label, style="-", width=1.2):
    ax.axhline(price, color=color, linestyle=style, linewidth=width, alpha=0.9)
    ax.text(x_end, price, f" {label} {price:,.0f}", color=color, va="center", fontsize=9)


def main(snap_path, fib_path, out_path):
    snap, fib = load(snap_path), load(fib_path)
    bars = fib["bars"]
    n = len(bars)
    fig, ax = plt.subplots(figsize=(12, 6.5), dpi=130)
    fig.patch.set_facecolor(BG)
    ax.set_facecolor(BG)

    draw_candles(ax, bars)
    x_end = n + 2.5

    for lv in fib["levels"]:
        draw_hline(ax, x_end, lv["price"], FIB, f"Fib {lv['ratio'] * 100:.1f}%", style="--", width=1)

    gl = gamma_levels(snap)
    for name, price, color in gl:
        draw_hline(ax, x_end, price, color, name, width=1.6)

    one_day = next((c for c in snap["cone"] if c["days"] == 1 and c["k"] == 1), None)
    if one_day:
        ax.add_patch(
            Rectangle((n - 0.5, one_day["lower"]), 2.5, one_day["upper"] - one_day["lower"], color=SIGMA, alpha=0.25)
        )

    for lv in fib["levels"]:
        for name, price, _ in gl:
            if abs(lv["price"] - price) <= price * CONFLUENCE_TOL:
                ax.axhspan(min(lv["price"], price), max(lv["price"], price), color=FIB, alpha=0.25)

    sw = fib["swing"]
    ax.annotate(f"高 {sw['high']:,.0f}\n{sw['highDate']}", xy=(next(i for i, b in enumerate(bars) if b["date"] == sw["highDate"]), sw["high"]),
                xytext=(0, 12), textcoords="offset points", ha="center", color=FG, fontsize=8)
    ax.annotate(f"低 {sw['low']:,.0f}\n{sw['lowDate']}", xy=(next(i for i, b in enumerate(bars) if b["date"] == sw["lowDate"]), sw["low"]),
                xytext=(-14, -4), textcoords="offset points", ha="right", va="top", color=FG, fontsize=8)

    prices = [sw["high"], sw["low"]] + [p for _, p, _ in gl]
    if one_day:
        prices += [one_day["lower"], one_day["upper"]]
    pad = (max(prices) - min(prices)) * 0.06
    ax.set_ylim(min(prices) - pad, max(prices) + pad * 2.5)
    ax.set_xlim(-1, n + 2)

    step = max(n // 8, 1)
    ax.set_xticks(range(0, n, step))
    ax.set_xticklabels([bars[i]["date"][5:] for i in range(0, n, step)], color=FG, fontsize=9)
    ax.tick_params(axis="y", colors=FG, labelsize=9)
    ax.yaxis.set_major_formatter(matplotlib.ticker.FuncFormatter(lambda v, _: f"{v:,.0f}"))
    ax.grid(color=GRID, linewidth=0.6)
    for spine in ax.spines.values():
        spine.set_color(GRID)

    notes = [f"次日 ±1σ（灰色區塊）：{one_day['lower']:,} ～ {one_day['upper']:,}"] if one_day else []
    cal = snap.get("calibrated")
    if cal:
        cal_flip = "flip 無" if cal["flip"] is None else f"flip {cal['flip']:,}"
        notes.append(f"法人校正：{cal['lightLabel']}・{cal['regime']['label']}・{cal_flip}")
    if notes:
        ax.text(0.01, 0.03, "\n".join(notes), transform=ax.transAxes, color=FG, fontsize=9, va="bottom",
                bbox={"facecolor": BG, "edgecolor": GRID, "boxstyle": "round,pad=0.4"})

    trend = "下跌波段（回撤＝反彈壓力）" if sw["direction"] == "down" else "上漲波段（回撤＝回檔支撐）"
    ax.set_title(
        f"加權指數 {fib['date']}｜近 {fib['lookback']} 日{trend}｜{snap['lightLabel']}・{snap['regime']['label']}",
        color=FG, fontsize=12, loc="left",
    )
    fig.text(0.01, 0.01, "選擇權結構與技術分析，不構成投資建議。", color=SIGMA, fontsize=8)
    fig.tight_layout(rect=(0, 0.02, 0.9, 1))
    fig.savefig(out_path, facecolor=BG)


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit("用法：python scripts/gamma_chart.py snap.json fib.json out.png")
    main(*sys.argv[1:])
