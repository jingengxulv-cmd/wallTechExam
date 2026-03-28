#!/usr/bin/env python3
"""
Generate page-level PRD detailed design from recently added code.

Screenshot strategy:
1) Playwright screenshot (preferred for page-level image)
2) screen-control-ops fallback (desktop screenshot via capture_screen.ps1)
3) Placeholder text in markdown
"""

from __future__ import annotations

import argparse
import datetime as dt
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable


CODE_EXTENSIONS = {
    ".html",
    ".htm",
    ".css",
    ".scss",
    ".less",
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".vue",
    ".json",
}


@dataclass
class PageInfo:
    key: str
    root_dir: Path
    html: Path | None = None
    scripts: list[Path] = field(default_factory=list)
    styles: list[Path] = field(default_factory=list)
    others: list[Path] = field(default_factory=list)

    def all_files(self) -> list[Path]:
        return [p for p in [self.html, *self.scripts, *self.styles, *self.others] if p]


@dataclass
class ScreenshotConfig:
    enabled: bool
    mode: str
    screen_skill_dir: Path | None


def run_cmd(command: list[str], cwd: Path) -> tuple[int, str, str]:
    try:
        proc = subprocess.run(
            command,
            cwd=str(cwd),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="ignore",
            check=False,
        )
        return proc.returncode, proc.stdout.strip(), proc.stderr.strip()
    except Exception as exc:
        return 1, "", str(exc)


def is_git_repo(workspace: Path) -> bool:
    code, out, _ = run_cmd(["git", "rev-parse", "--is-inside-work-tree"], workspace)
    return code == 0 and out.lower() == "true"


def parse_file_list(raw: str) -> list[str]:
    return [line.strip() for line in raw.splitlines() if line.strip()]


def normalize_existing_files(workspace: Path, rel_paths: Iterable[str]) -> list[Path]:
    files: list[Path] = []
    seen: set[str] = set()
    for rel in rel_paths:
        p = (workspace / rel).resolve()
        if not p.exists() or not p.is_file():
            continue
        if p.suffix.lower() not in CODE_EXTENSIONS:
            continue
        key = str(p).lower()
        if key in seen:
            continue
        seen.add(key)
        files.append(p)
    return files


def detect_recent_files_from_git(workspace: Path, base_ref: str | None) -> tuple[list[Path], str]:
    candidates: list[str] = []

    commands = [
        ["git", "diff", "--name-only", "--diff-filter=AMRT", "HEAD"],
        ["git", "diff", "--cached", "--name-only", "--diff-filter=AMRT"],
        ["git", "ls-files", "--others", "--exclude-standard"],
    ]
    for command in commands:
        code, out, _ = run_cmd(command, workspace)
        if code == 0 and out:
            candidates.extend(parse_file_list(out))

    if base_ref:
        code, out, _ = run_cmd(
            ["git", "diff", "--name-only", "--diff-filter=AMRT", f"{base_ref}..HEAD"],
            workspace,
        )
        if code == 0 and out:
            candidates.extend(parse_file_list(out))
    elif not candidates:
        code, out, _ = run_cmd(
            ["git", "diff", "--name-only", "--diff-filter=AMRT", "HEAD~1..HEAD"],
            workspace,
        )
        if code == 0 and out:
            candidates.extend(parse_file_list(out))

    files = normalize_existing_files(workspace, candidates)
    return files, "git-diff"


def detect_recent_files_by_mtime(workspace: Path, since_hours: int) -> tuple[list[Path], str]:
    cutoff = dt.datetime.now() - dt.timedelta(hours=since_hours)
    out: list[Path] = []
    for file_path in workspace.rglob("*"):
        if not file_path.is_file():
            continue
        if file_path.suffix.lower() not in CODE_EXTENSIONS:
            continue
        try:
            mtime = dt.datetime.fromtimestamp(file_path.stat().st_mtime)
        except OSError:
            continue
        if mtime >= cutoff:
            out.append(file_path.resolve())
    out.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return out, f"mtime-{since_hours}h"


def detect_recent_files(workspace: Path, since_hours: int, base_ref: str | None) -> tuple[list[Path], str]:
    if is_git_repo(workspace):
        files, strategy = detect_recent_files_from_git(workspace, base_ref)
        if files:
            return files, strategy
    return detect_recent_files_by_mtime(workspace, since_hours)


def read_text(path: Path, limit: int = 20000) -> str:
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return ""
    if len(text) > limit:
        return text[:limit]
    return text


def clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def extract_title_from_html(html: str) -> str | None:
    for pattern in [r"<title[^>]*>(.*?)</title>", r"<h1[^>]*>(.*?)</h1>"]:
        m = re.search(pattern, html, re.IGNORECASE | re.DOTALL)
        if m:
            title = clean_text(re.sub(r"<[^>]+>", "", m.group(1)))
            if title:
                return title
    return None


def dedupe_keep_order(items: Iterable[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for item in items:
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def extract_buttons(html: str) -> list[str]:
    texts: list[str] = []
    for m in re.finditer(r"<button[^>]*>(.*?)</button>", html, re.IGNORECASE | re.DOTALL):
        val = clean_text(re.sub(r"<[^>]+>", "", m.group(1)))
        if val:
            texts.append(val)
    for m in re.finditer(r"<input[^>]*type=['\"]?(button|submit)['\"]?[^>]*>", html, re.IGNORECASE):
        attrs = m.group(0)
        v = re.search(r"value=['\"]([^'\"]+)['\"]", attrs, re.IGNORECASE)
        if v:
            texts.append(clean_text(v.group(1)))
    return dedupe_keep_order(texts)


def extract_inputs(html: str) -> list[str]:
    fields: list[str] = []
    for m in re.finditer(r"<input[^>]*>", html, re.IGNORECASE):
        attrs = m.group(0)
        for key in ["placeholder", "name", "id", "aria-label"]:
            mm = re.search(rf"{key}=['\"]([^'\"]+)['\"]", attrs, re.IGNORECASE)
            if mm:
                fields.append(mm.group(1).strip())
                break
    for m in re.finditer(r"<textarea[^>]*>", html, re.IGNORECASE):
        attrs = m.group(0)
        mm = re.search(r"placeholder=['\"]([^'\"]+)['\"]", attrs, re.IGNORECASE)
        if mm:
            fields.append(mm.group(1).strip())
    return dedupe_keep_order([x for x in fields if x])


def extract_events(js: str) -> list[str]:
    results: list[str] = []
    pattern = re.compile(
        r"([A-Za-z0-9_$.]+)\s*\.addEventListener\(\s*['\"]([a-zA-Z]+)['\"]\s*,\s*([A-Za-z0-9_$.]+)",
        re.MULTILINE,
    )
    for target, event_name, handler in pattern.findall(js):
        results.append(f"{event_name}: {target} -> {handler}")
    return dedupe_keep_order(results)


def extract_functions(js: str) -> list[str]:
    names: list[str] = []
    for pattern in [
        r"function\s+([A-Za-z0-9_]+)\s*\(",
        r"const\s+([A-Za-z0-9_]+)\s*=\s*\(",
        r"const\s+([A-Za-z0-9_]+)\s*=\s*async\s*\(",
        r"([A-Za-z0-9_]+)\s*:\s*function\s*\(",
    ]:
        names.extend(re.findall(pattern, js))
    blocked = {"function", "const", "return", "if", "for", "map", "set", "get"}
    return dedupe_keep_order([n for n in names if len(n) > 2 and n.lower() not in blocked])[:20]


def extract_apis(js: str) -> list[str]:
    apis: list[str] = []
    apis.extend(re.findall(r"fetch\(\s*['\"]([^'\"]+)['\"]", js))
    apis.extend(re.findall(r"axios\.(?:get|post|put|delete)\(\s*['\"]([^'\"]+)['\"]", js))
    return dedupe_keep_order(apis)


def extract_storage_keys(js: str) -> list[str]:
    keys: list[str] = []
    keys.extend(re.findall(r"localStorage\.(?:getItem|setItem)\(\s*['\"]([^'\"]+)['\"]", js))
    keys.extend(re.findall(r"sessionStorage\.(?:getItem|setItem)\(\s*['\"]([^'\"]+)['\"]", js))
    return dedupe_keep_order(keys)


def detect_edge_case_hints(text: str) -> list[str]:
    hints: list[str] = []
    rules = [
        ("empty", "存在空值处理逻辑，需定义字段为空时提示与阻断规则。"),
        ("required", "存在必填校验逻辑，需明确校验时机和提示文案。"),
        ("max", "存在上限控制，需明确边界值和超限反馈。"),
        ("min", "存在下限控制，需明确边界值和低于下限时行为。"),
        ("error", "存在错误分支，需覆盖接口失败、超时和离线提示。"),
        ("catch", "存在异常捕获，需定义重试机制和错误日志记录。"),
        ("disabled", "存在禁用态逻辑，需明确定义触发条件与恢复条件。"),
        ("debounce", "存在防抖/节流迹象，需说明触发频率和用户感知。"),
        ("confirm", "存在确认操作，需定义二次确认文案与取消路径。"),
    ]
    lowered = text.lower()
    for keyword, advice in rules:
        if keyword in lowered:
            hints.append(advice)
    return dedupe_keep_order(hints)


def relative_to(path: Path, workspace: Path) -> str:
    try:
        return str(path.resolve().relative_to(workspace.resolve())).replace("\\", "/")
    except ValueError:
        return str(path).replace("\\", "/")


def build_page_map(changed_files: list[Path], workspace: Path) -> tuple[dict[str, PageInfo], list[Path]]:
    pages: dict[str, PageInfo] = {}
    shared: list[Path] = []

    for f in changed_files:
        rel = relative_to(f, workspace)
        parts = rel.split("/")
        in_pages = "pages" in [p.lower() for p in parts]
        ext = f.suffix.lower()
        stem = f.stem

        if in_pages and ext in {".html", ".js", ".css"}:
            if stem not in pages:
                pages[stem] = PageInfo(key=stem, root_dir=f.parent)
            page = pages[stem]
            if ext == ".html":
                page.html = f
            elif ext == ".js":
                page.scripts.append(f)
            elif ext == ".css":
                page.styles.append(f)
        else:
            shared.append(f)

    for page in pages.values():
        if page.html is None:
            candidate = page.root_dir / f"{page.key}.html"
            if candidate.exists():
                page.html = candidate.resolve()

    return pages, shared


def to_display_name(raw: str) -> str:
    return raw.replace("-", " ").replace("_", " ").strip().title()


def detect_default_screen_skill_dir() -> Path | None:
    candidate = Path.home() / ".codex" / "skills" / "screen-control-ops"
    if candidate.exists():
        return candidate
    return None


def try_capture_with_playwright(html_file: Path, out_file: Path, workspace: Path) -> tuple[bool, str]:
    if shutil.which("node") is None or shutil.which("npx") is None:
        return False, "未检测到 node/npx，无法执行 Playwright 截图。"

    out_file.parent.mkdir(parents=True, exist_ok=True)
    url = html_file.resolve().as_uri()
    commands = [
        ["npx", "playwright", "screenshot", "--device=Desktop Chrome", url, str(out_file)],
        ["npx", "playwright", "screenshot", url, str(out_file)],
    ]
    last_error = "Playwright 截图失败。"
    for command in commands:
        code, _, err = run_cmd(command, workspace)
        if code == 0 and out_file.exists():
            return True, ""
        if err:
            last_error = err.splitlines()[0]
    return False, last_error


def try_capture_with_screen_skill(
    out_file: Path,
    workspace: Path,
    screen_skill_dir: Path | None,
) -> tuple[bool, str]:
    if screen_skill_dir is None:
        return False, "未提供 screen-control-ops skill 路径。"

    script = screen_skill_dir / "scripts" / "capture_screen.ps1"
    if not script.exists():
        return False, f"未找到截图脚本: {script}"

    out_file.parent.mkdir(parents=True, exist_ok=True)
    command = [
        "powershell",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        str(script),
        "-OutputPath",
        str(out_file),
    ]
    code, out, err = run_cmd(command, workspace)
    if code == 0 and out_file.exists():
        return True, out or ""
    if err:
        return False, err.splitlines()[0]
    return False, "screen-control-ops 截图失败。"


def try_capture_screenshot(
    html_file: Path | None,
    out_file: Path,
    workspace: Path,
    config: ScreenshotConfig,
) -> tuple[str | None, str | None]:
    if not config.enabled or config.mode == "none":
        return None, "截图功能未启用。"

    if config.mode in {"auto", "playwright"}:
        if html_file and html_file.exists():
            ok, err = try_capture_with_playwright(html_file, out_file, workspace)
            if ok:
                return "playwright", None
            if config.mode == "playwright":
                return None, err
            play_err = err
        else:
            play_err = "页面 HTML 文件不存在，无法执行 Playwright 截图。"
            if config.mode == "playwright":
                return None, play_err
    else:
        play_err = None

    if config.mode in {"auto", "screen-skill"}:
        ok, err = try_capture_with_screen_skill(out_file, workspace, config.screen_skill_dir)
        if ok:
            return "screen-control-ops", None
        if config.mode == "screen-skill":
            return None, err
        if play_err:
            return None, f"Playwright失败: {play_err}; ScreenSkill失败: {err}"
        return None, err

    return None, play_err or "截图失败。"


def render_page_section(
    workspace: Path,
    page: PageInfo,
    shared_files: list[Path],
    image_rel_path: str | None,
    image_source: str | None,
    image_error: str | None,
) -> str:
    html_text = read_text(page.html) if page.html else ""
    js_text = "\n".join(read_text(p) for p in page.scripts)
    css_text = "\n".join(read_text(p) for p in page.styles)
    all_text = "\n".join([html_text, js_text, css_text])

    page_title = extract_title_from_html(html_text) if html_text else None
    page_name = page_title or to_display_name(page.key)
    buttons = extract_buttons(html_text) if html_text else []
    inputs = extract_inputs(html_text) if html_text else []
    events = extract_events(js_text) if js_text else []
    funcs = extract_functions(js_text) if js_text else []
    apis = extract_apis(js_text) if js_text else []
    storage_keys = extract_storage_keys(js_text) if js_text else []
    edge_hints = detect_edge_case_hints(all_text)

    lines = [f"## 页面: {page_name}", ""]
    lines.append("### 变更代码范围")
    for f in page.all_files():
        lines.append(f"- `{relative_to(f, workspace)}`")
    if shared_files:
        lines.append("- 共享依赖:")
        for sf in shared_files[:5]:
            lines.append(f"  - `{relative_to(sf, workspace)}`")
    lines.append("")

    lines.append("### 功能点详细设计")
    if events:
        for idx, item in enumerate(events[:12], 1):
            lines.append(f"{idx}. 触发机制: `{item}`")
            lines.append("   - 入口交互: 用户触发事件。")
            lines.append("   - 系统行为: 执行对应逻辑并更新状态。")
            lines.append("   - 结果反馈: 展示成功、失败或空态。")
    elif funcs:
        for idx, fn in enumerate(funcs[:10], 1):
            lines.append(f"{idx}. 功能模块: `{fn}`")
            lines.append("   - 入口交互: 页面加载或用户操作触发。")
            lines.append("   - 系统行为: 执行逻辑并刷新视图。")
            lines.append("   - 结果反馈: 提供可见反馈。")
    else:
        lines.append("1. 未识别到明确事件函数，请补充触发动作和处理函数。")
    lines.append("")

    lines.append("### 交互流程")
    lines.append("1. 用户进入页面，系统初始化默认状态。")
    if inputs:
        lines.append("2. 用户可输入/筛选字段:")
        for it in inputs[:10]:
            lines.append(f"   - `{it}`")
    if buttons:
        lines.append("3. 用户可触发按钮动作:")
        for bt in buttons[:10]:
            lines.append(f"   - `{bt}`")
    if apis:
        lines.append("4. 系统调用接口并处理结果:")
        for api in apis[:10]:
            lines.append(f"   - `{api}`")
    else:
        lines.append("4. 系统在本地状态层处理并刷新界面。")
    lines.append("5. 页面进入成功态、失败态或空态。")
    lines.append("")

    lines.append("### 边界情况")
    if edge_hints:
        for hint in edge_hints:
            lines.append(f"- {hint}")
    else:
        lines.append("- 未识别到边界处理逻辑，请补充必填校验、失败重试与空态展示。")
    if storage_keys:
        lines.append("- 本地存储键存在，需定义一致性与过期策略:")
        for k in storage_keys[:10]:
            lines.append(f"  - `{k}`")
    lines.append("")

    lines.append("### 开发实现要点")
    lines.append("- 明确状态机: 初始态 -> 处理中 -> 成功/失败。")
    lines.append("- 按钮防重复提交和接口超时兜底必须落实。")
    lines.append("- 关键输入字段需定义校验规则与错误提示文案。")
    lines.append("")

    lines.append("### 页面截图")
    if image_rel_path:
        lines.append(f"![{page_name}]({image_rel_path})")
        if image_source:
            lines.append(f"> 截图来源: `{image_source}`")
    else:
        lines.append("> [截图占位] 建议放置以下图片:")
        lines.append("> 1) 页面首屏(默认态)")
        lines.append("> 2) 核心操作后的结果态(提交成功/筛选结果)")
        lines.append("> 3) 失败或空态(接口错误/无数据)")
        if image_error:
            lines.append(f"> 自动截图失败原因: {image_error}")
    lines.append("")
    return "\n".join(lines)


def generate_markdown(
    workspace: Path,
    files: list[Path],
    strategy: str,
    output_file: Path,
    screenshot_config: ScreenshotConfig,
) -> None:
    pages, shared = build_page_map(files, workspace)
    now = dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    lines = [
        "# PRD 详细设计(按页面)",
        "",
        f"- 生成时间: `{now}`",
        f"- 代码识别策略: `{strategy}`",
        f"- 分析文件数量: `{len(files)}`",
        f"- 截图模式: `{screenshot_config.mode if screenshot_config.enabled else 'disabled'}`",
        "",
        "## 本次纳入分析的新增/变更文件",
    ]
    for f in files:
        lines.append(f"- `{relative_to(f, workspace)}`")
    lines.append("")

    if not pages:
        lines.append("## 页面识别结果")
        lines.append("- 未识别到 `pages/*.html|js|css` 命名模式的页面文件。")
        lines.append("- 可根据变更文件列表手动补全页面拆分。")
    else:
        lines.append("## 页面设计清单")
        for key in sorted(pages.keys()):
            lines.append(f"- `{key}`")
        lines.append("")

    image_dir = output_file.parent / "images"
    for key in sorted(pages.keys()):
        page = pages[key]
        image_rel: str | None = None
        image_source: str | None = None
        image_error: str | None = None

        if screenshot_config.enabled:
            image_file = image_dir / f"{page.key}.png"
            source, err = try_capture_screenshot(
                html_file=page.html,
                out_file=image_file,
                workspace=workspace,
                config=screenshot_config,
            )
            if source and image_file.exists():
                image_rel = str(image_file.relative_to(output_file.parent)).replace("\\", "/")
                image_source = source
            else:
                image_error = err

        lines.append(
            render_page_section(
                workspace=workspace,
                page=page,
                shared_files=shared,
                image_rel_path=image_rel,
                image_source=image_source,
                image_error=image_error,
            )
        )

    output_file.parent.mkdir(parents=True, exist_ok=True)
    output_file.write_text("\n".join(lines), encoding="utf-8")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Generate page-level PRD detailed design from recent code changes."
    )
    parser.add_argument("--workspace", default=".", help="Project workspace path.")
    parser.add_argument(
        "--output",
        default="",
        help="Output markdown path. Default: docs/prd-detailed-design-<timestamp>.md",
    )
    parser.add_argument(
        "--since-hours",
        type=int,
        default=72,
        help="Fallback recent window in hours when git diff is unavailable.",
    )
    parser.add_argument("--base-ref", default="", help="Optional git base ref, e.g. origin/main.")
    parser.add_argument("--max-files", type=int, default=40, help="Maximum number of files.")
    parser.add_argument(
        "--with-screenshots",
        action="store_true",
        help="Enable screenshot generation.",
    )
    parser.add_argument(
        "--screenshot-mode",
        choices=["auto", "playwright", "screen-skill", "none"],
        default="auto",
        help="Screenshot mode. auto = playwright then screen-skill fallback.",
    )
    parser.add_argument(
        "--screenshot-skill-dir",
        default="",
        help="Path to screen-control-ops skill directory.",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    workspace = Path(args.workspace).resolve()
    if not workspace.exists() or not workspace.is_dir():
        print(f"[ERROR] Workspace does not exist: {workspace}")
        return 1

    if args.output:
        output = Path(args.output).resolve()
    else:
        stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
        output = workspace / "docs" / f"prd-detailed-design-{stamp}.md"

    files, strategy = detect_recent_files(
        workspace=workspace,
        since_hours=max(1, args.since_hours),
        base_ref=args.base_ref.strip() or None,
    )
    files = files[: max(1, args.max_files)]
    if not files:
        print("[ERROR] No recent code files detected.")
        print("Try a larger --since-hours or specify --base-ref in a git repository.")
        return 1

    screen_skill_dir: Path | None
    if args.screenshot_skill_dir.strip():
        screen_skill_dir = Path(args.screenshot_skill_dir).resolve()
    else:
        screen_skill_dir = detect_default_screen_skill_dir()

    screenshot_config = ScreenshotConfig(
        enabled=bool(args.with_screenshots),
        mode=args.screenshot_mode,
        screen_skill_dir=screen_skill_dir,
    )

    generate_markdown(
        workspace=workspace,
        files=files,
        strategy=strategy,
        output_file=output,
        screenshot_config=screenshot_config,
    )

    print(f"[OK] Generated: {output}")
    if screenshot_config.enabled and screenshot_config.mode in {"auto", "screen-skill"}:
        if screen_skill_dir:
            print(f"[INFO] screen-control-ops: {screen_skill_dir}")
        else:
            print("[INFO] screen-control-ops not found; fallback may be unavailable.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
