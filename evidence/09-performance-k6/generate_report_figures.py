from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


HERE = Path(__file__).resolve().parent
DATA_PATH = HERE / "2026-08-21T061829217Z-cloudwatch-summary.json"
FIGURE_20 = HERE / "figure-20-k6-load-test-results.png"
FIGURE_21 = HERE / "figure-21-aws-resource-behaviour.png"

NAVY = "#0F2747"
BLUE = "#2F6FED"
CYAN = "#12A8C4"
GREEN = "#0B8F55"
AMBER = "#C97800"
RED = "#C43D3D"
MUTED = "#586174"
GRID = "#D9E0EA"
LIGHT = "#F5F7FA"
WHITE = "#FFFFFF"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    name = "segoeuib.ttf" if bold else "segoeui.ttf"
    return ImageFont.truetype(str(Path("C:/Windows/Fonts") / name), size=size)


def rounded_card(draw: ImageDraw.ImageDraw, xy: tuple[int, int, int, int]) -> None:
    draw.rounded_rectangle(xy, radius=18, fill=WHITE, outline=GRID, width=2)


def metric_card(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int, int, int],
    label: str,
    value: str,
    detail: str,
    color: str = BLUE,
) -> None:
    rounded_card(draw, xy)
    x1, y1, _, _ = xy
    draw.rectangle((x1, y1, x1 + 10, xy[3]), fill=color)
    draw.text((x1 + 28, y1 + 22), label.upper(), font=font(21, True), fill=MUTED)
    draw.text((x1 + 28, y1 + 60), value, font=font(42, True), fill=NAVY)
    draw.text((x1 + 28, y1 + 117), detail, font=font(20), fill=MUTED)


def draw_line_chart(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    labels: list[str],
    series: list[tuple[str, list[float], str]],
    y_max: float,
    title: str,
    y_suffix: str = "",
) -> None:
    x1, y1, x2, y2 = box
    draw.text((x1, y1), title, font=font(25, True), fill=NAVY)
    plot = (x1 + 58, y1 + 50, x2 - 18, y2 - 48)
    px1, py1, px2, py2 = plot
    for i in range(5):
        y = py2 - (py2 - py1) * i / 4
        value = y_max * i / 4
        draw.line((px1, y, px2, y), fill=GRID, width=1)
        draw.text((x1, y - 12), f"{value:.0f}{y_suffix}", font=font(15), fill=MUTED)
    draw.line((px1, py1, px1, py2), fill=MUTED, width=2)
    draw.line((px1, py2, px2, py2), fill=MUTED, width=2)
    if len(labels) > 1:
        step = (px2 - px1) / (len(labels) - 1)
    else:
        step = 0
    for idx, label in enumerate(labels):
        x = px1 + idx * step
        draw.text((x - 22, py2 + 12), label, font=font(14), fill=MUTED)
    for name, values, color in series:
        points: list[tuple[float, float]] = []
        for idx, value in enumerate(values):
            x = px1 + idx * step
            y = py2 - min(value, y_max) / y_max * (py2 - py1)
            points.append((x, y))
        draw.line(points, fill=color, width=4, joint="curve")
        for point in points:
            draw.ellipse((point[0] - 4, point[1] - 4, point[0] + 4, point[1] + 4), fill=color)
    legend_x = px1
    legend_y = y2 - 22
    for name, _, color in series:
        draw.line((legend_x, legend_y, legend_x + 28, legend_y), fill=color, width=5)
        draw.text((legend_x + 36, legend_y - 11), name, font=font(16), fill=MUTED)
        legend_x += 210


def create_figure_20(data: dict) -> None:
    baseline = data["k6"]["baseline"]
    staged = data["k6"]["staged"]
    image = Image.new("RGB", (1800, 1120), LIGHT)
    draw = ImageDraw.Draw(image)
    draw.text((80, 56), "SmartRetailX bounded authenticated load test", font=font(43, True), fill=NAVY)
    draw.text(
        (80, 116),
        "Live read-only GET workload | ap-south-1 | 21 August 2026",
        font=font(23),
        fill=MUTED,
    )
    metric_card(draw, (80, 180, 600, 350), "Staged requests", f"{staged['requests']:,}", "9,155 two-endpoint iterations")
    metric_card(draw, (640, 180, 1160, 350), "Throughput", f"{staged['throughputRequestsPerSecond']:.2f}/s", "7-minute staged run", CYAN)
    metric_card(draw, (1200, 180, 1720, 350), "Maximum load", f"{staged['maximumVirtualUsers']} VUs", "5 -> 20 -> 50 -> 5 -> 0", GREEN)
    metric_card(draw, (80, 390, 600, 560), "Overall latency", f"p95 {staged['p95Milliseconds']:.2f} ms", f"p99 {staged['p99Milliseconds']:.2f} ms", BLUE)
    metric_card(draw, (640, 390, 1160, 560), "Endpoint p95", f"{staged['orderP95Milliseconds']:.2f} / {staged['catalogueP95Milliseconds']:.2f} ms", "Order / Catalogue", CYAN)
    metric_card(draw, (1200, 390, 1720, 560), "Failed requests", "1 of 18,310", "0.0055% — Catalogue Lambda throttle", AMBER)
    rounded_card(draw, (80, 610, 1720, 1000))
    draw.text((120, 650), "Threshold verdict", font=font(31, True), fill=NAVY)
    rows = [
        ("PASS", "Overall p95 < 1,500 ms", f"Observed {staged['p95Milliseconds']:.2f} ms", GREEN),
        ("PASS", "Overall p99 < 2,500 ms", f"Observed {staged['p99Milliseconds']:.2f} ms", GREEN),
        ("PASS", "Failed-request rate < 1%", "Observed 0.0055%", GREEN),
        ("FAIL", "Strict checks rate = 100%", "36,618 / 36,620 checks passed", RED),
    ]
    y = 725
    for verdict, condition, observed, color in rows:
        draw.rounded_rectangle((120, y, 240, y + 48), radius=13, fill=color)
        box = draw.textbbox((0, 0), verdict, font=font(20, True))
        tw = box[2] - box[0]
        draw.text((180 - tw / 2, y + 11), verdict, font=font(20, True), fill=WHITE)
        draw.text((280, y + 7), condition, font=font(23, True), fill=NAVY)
        draw.text((1050, y + 9), observed, font=font(21), fill=MUTED)
        y += 67
    draw.text(
        (80, 1045),
        f"Baseline reference: 5 VUs, {baseline['requests']} requests, p95 {baseline['p95Milliseconds']:.2f} ms, zero failures.",
        font=font(19),
        fill=MUTED,
    )
    image.save(FIGURE_20, quality=95)


def create_figure_21(data: dict) -> None:
    cw = data["cloudWatch"]
    labels = cw["minuteLabelsUtc"]
    image = Image.new("RGB", (1800, 1220), LIGHT)
    draw = ImageDraw.Draw(image)
    draw.text((80, 56), "AWS resource behaviour during the staged test", font=font(43, True), fill=NAVY)
    draw.text((80, 116), "CloudWatch one-minute telemetry | 06:19–06:27 UTC", font=font(23), fill=MUTED)
    rounded_card(draw, (80, 175, 1720, 590))
    draw_line_chart(
        draw,
        (120, 210, 1680, 555),
        labels,
        [
            ("Catalogue API requests/min", cw["catalogueApi"]["requestCountPerMinute"], BLUE),
            ("Order API requests/min", cw["orderApi"]["requestCountPerMinute"], CYAN),
        ],
        2800,
        "API Gateway request volume",
    )
    rounded_card(draw, (80, 630, 1120, 1080))
    draw_line_chart(
        draw,
        (120, 665, 1080, 1040),
        labels,
        [
            ("ECS CPU average", cw["orderEcs"]["averageCpuPercentPerMinute"], BLUE),
            ("ECS memory average", cw["orderEcs"]["averageMemoryPercentPerMinute"], GREEN),
        ],
        60,
        "Order ECS utilization",
        "%",
    )
    rounded_card(draw, (1160, 630, 1720, 1080))
    draw.text((1200, 675), "Capacity and reliability", font=font(27, True), fill=NAVY)
    facts = [
        ("51.73%", "peak ECS CPU"),
        ("9.57%", "peak ECS memory"),
        ("10", "peak Lambda concurrency"),
        ("1", "Catalogue Lambda throttle"),
        ("0", "Lambda execution errors"),
        ("1 / 1", "ECS running / desired tasks"),
    ]
    y = 735
    for value, label in facts:
        draw.text((1200, y), value, font=font(31, True), fill=NAVY if value != "1" else AMBER)
        draw.text((1380, y + 6), label, font=font(20), fill=MUTED)
        y += 55
    draw.text((80, 1145), "Source: AWS CloudWatch and ECS service state captured immediately after the bounded read-only run.", font=font(19), fill=MUTED)
    image.save(FIGURE_21, quality=95)


def main() -> None:
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    create_figure_20(data)
    create_figure_21(data)
    print(FIGURE_20)
    print(FIGURE_21)


if __name__ == "__main__":
    main()
