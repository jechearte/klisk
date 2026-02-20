"""Centralized CLI output with Rich — colors, spinners, tables."""

from __future__ import annotations

import sys
from contextlib import contextmanager
from typing import Iterator, Sequence

from rich.console import Console
from rich.padding import Padding
from rich.table import Table
from rich.text import Text

console = Console(highlight=False)
err_console = Console(stderr=True, highlight=False)


# ── Status messages ──────────────────────────────────────────────────────────

def success(msg: str) -> None:
    console.print(f"  [green]✓[/green] {msg}")


def error(msg: str) -> None:
    err_console.print(f"  [red]✗[/red] {msg}")


def warning(msg: str) -> None:
    console.print(f"  [yellow]⚠[/yellow] {msg}")


def info(msg: str) -> None:
    console.print(f"  [dim]ℹ {msg}[/dim]")


def step(msg: str) -> None:
    console.print(f"  [bold]→[/bold] {msg}")


# ── Structure ────────────────────────────────────────────────────────────────

def header(msg: str) -> None:
    console.print()
    console.print(f"  [bold]{msg}[/bold]")


def kv(key: str, value: str, indent: int = 2) -> None:
    pad = " " * indent
    console.print(f"{pad}[bold]{key + ':':<12}[/bold] {value}")


def url(label: str, link: str) -> None:
    console.print(f"  [bold]{label + ':':<12}[/bold] [cyan]{link}[/cyan]")


def dim(msg: str) -> None:
    console.print(f"  [dim]{msg}[/dim]")


def next_steps(items: list[str]) -> None:
    console.print()
    console.print("  [bold]Next steps:[/bold]")
    for i, item in enumerate(items, 1):
        console.print(f"    {i}. {item}")


def plain(msg: str = "") -> None:
    console.print(msg)


def plain_err(msg: str) -> None:
    err_console.print(msg)


# ── Progress ─────────────────────────────────────────────────────────────────

@contextmanager
def spinner(msg: str) -> Iterator[None]:
    """Show a spinner while a long operation runs.

    Falls back to a simple print when stdout is not a TTY (e.g. CI, piped).
    """
    if not sys.stdout.isatty():
        console.print(f"  {msg}...")
        yield
        return

    with console.status(f"  {msg}...", spinner="dots"):
        yield


# ── Tables ───────────────────────────────────────────────────────────────────

def table(headers: Sequence[str], rows: Sequence[Sequence[str]], indent: int = 2) -> None:
    t = Table(show_edge=True, pad_edge=False)
    for h in headers:
        t.add_column(h)
    for row in rows:
        t.add_row(*row)
    console.print(Padding(t, (0, 0, 0, indent)))
