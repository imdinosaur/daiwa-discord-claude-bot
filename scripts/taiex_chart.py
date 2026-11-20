"""
加權指數日 K／週 K ＋ 均線 ＋ 乖離率圖。

用法：
  node scripts/taiex_bias.ts --compare 2025-04            # 先產生 output/taiex_series.json
  python scripts/taiex_chart.py [--from 2025-01] [--mark 2025-04-09 ...]
輸出：output/taiex_daily.png、output/taiex_weekly.png
"""
import argparse
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.patches import Rectangle  # noqa: E402
from matplotlib.ticker import FuncFormatter  # noqa: E402

plt.rcParams["font.sans-serif"] = ["Microsoft JhengHei", "Noto Sans CJK TC", "sans-serif"]
plt.rcParams["axes.unicode_minus"] = False

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "output"
BG, FG, GRID, MUTED = "#1e1f22", "#dbdee1", "#3a3c42", "#8b949e"
UP, DOWN, MA, MARK = "#e5534b", "#3fb950", "#d4a72c", "#bc8cff"  # 台股慣例：紅漲綠跌
BODY_WIDTH = 0.7
MAX_XTICKS = 12


def style(ax) -> None:
    ax.set_facecolor(BG)
    ax.grid(color=GRID, linewidth=0.6)
    ax.tick_params(colors=FG, labelsize=9)
    for spine in ax.spines.values():
        spine.set_color(GRID)


def index_of(rows: list, date: str) -> int | None:
    """日 K 找同一天；週 K 找包含該日的那一週"""
    for i, r in enumerate(rows):
        if r.get("start", r["date"]) <= date <= r["date"]:
            return i
    return None


def draw_candles(ax, rows: list) -> None:
    for i, r in enumerate(rows):
        color = UP if r["close"] >= r["open"] else DOWN
        ax.vlines(i, r["low"], r["high"], color=color, linewidth=0.8)
        body = max(abs(r["close"] - r["open"]), 1)
        ax.add_patch(Rectangle((i - BODY_WIDTH / 2, min(r["open"], r["close"])), BODY_WIDTH, body, color=color))


def draw_mark(ax, bx, rows: list, i: int, label: str) -> None:
    r = rows[i]
    ax.annotate(f"{label}\n收 {r['close']:,.0f}｜乖離 {r['bias']:.2f}%", xy=(i, r["low"]), xytext=(0, -40),
                textcoords="offset points", ha="center", color=MARK, fontsize=9,
                arrowprops={"arrowstyle": "->", "color": MARK})
    bx.scatter([i], [r["bias"]], color=MARK, zorder=3)
    bx.annotate(f"{r['bias']:.2f}%", xy=(i, r["bias"]), xytext=(6, -2), textcoords="offset points",
                color=MARK, fontsize=9, va="top")


def plot(rows: list, ma: int, unit: str, marks: list, out: Path) -> None:
    n = len(rows)
    fig, (ax, bx) = plt.subplots(2, 1, figsize=(14, 8), dpi=120, sharex=True, gridspec_kw={"height_ratios": [3, 1]})
    fig.patch.set_facecolor(BG)
    style(ax)
    style(bx)
    draw_candles(ax, rows)

    xs = [i for i, r in enumerate(rows) if r["ma"] is not None]
    ax.plot(xs, [rows[i]["ma"] for i in xs], color=MA, linewidth=1.5, label=f"{ma}MA")
    bx.plot(xs, [rows[i]["bias"] for i in xs], color=MA, linewidth=1.2)
    bx.axhline(0, color=FG, linewidth=0.6)

    for date in marks:
        i = index_of(rows, date)
        if i is not None and rows[i]["bias"] is not None:
            draw_mark(ax, bx, rows, i, date if unit == "日" else f"{rows[i]['start']} 週")

    lo, hi = min(r["low"] for r in rows), max(r["high"] for r in rows)
    ax.set_ylim(lo - (hi - lo) * 0.12, hi + (hi - lo) * 0.04)
    ax.set_xlim(-2, n + 1)
    ax.yaxis.set_major_formatter(FuncFormatter(lambda v, _: f"{v:,.0f}"))
    ax.legend(facecolor=BG, edgecolor=GRID, labelcolor=FG, loc="upper left")
    ax.set_title(f"加權指數 {unit}K｜{ma} {unit}均線與乖離率（{rows[0]['date'][:7]} ～ {rows[-1]['date']}）",
                 color=FG, fontsize=13, loc="left")
    bx.set_ylabel(f"{ma}MA 乖離率 %", color=FG, fontsize=9)
    step = max(n // MAX_XTICKS, 1)
    bx.set_xticks(range(0, n, step))
    bx.set_xticklabels([rows[i]["date"][:7] for i in range(0, n, step)], color=FG, fontsize=9)
    fig.text(0.01, 0.005, f"資料：證交所加權指數。乖離率 = 收盤 / {ma}MA - 1。不構成投資建議。", color=MUTED, fontsize=8)
    fig.tight_layout(rect=(0, 0.02, 1, 1))
    fig.savefig(out, facecolor=BG)
    plt.close(fig)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--from", dest="start", default="2025-01", help="日 K 起始月（週 K 一律畫全部）")
    p.add_argument("--mark", nargs="*", default=[], help="要標註的日期 YYYY-MM-DD；最新一天自動標註")
    a = p.parse_args()

    data = json.loads((OUT / "taiex_series.json").read_text(encoding="utf-8"))
    daily = [r for r in data["daily"] if r["date"] >= a.start]
    weekly = data["weekly"]
    marks = [*a.mark, daily[-1]["date"]]
    plot(daily, data["ma"], "日", marks, OUT / "taiex_daily.png")
    plot(weekly, data["ma"], "週", marks, OUT / "taiex_weekly.png")
    print(OUT / "taiex_daily.png")
    print(OUT / "taiex_weekly.png")


if __name__ == "__main__":
    main()
