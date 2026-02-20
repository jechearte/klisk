"""Klisk CLI powered by Typer."""

import typer

from klisk.cli.assistant import assistant
from klisk.cli.create import create
from klisk.cli.delete import delete
from klisk.cli.studio import studio
from klisk.cli.run import run
from klisk.cli.check import check
from klisk.cli.list_projects import list_cmd
from klisk.cli.start import start
from klisk.cli.config import config
from klisk.cli.deploy import deploy
from klisk.cli.status import status
from klisk.cli.docker import docker

app = typer.Typer(
    name="klisk",
    help="A framework for building AI agents programmatically.",
    add_completion=False,
)


@app.callback(invoke_without_command=True)
def main(ctx: typer.Context) -> None:
    """A framework for building AI agents programmatically."""
    if ctx.invoked_subcommand is not None:
        return

    from klisk.cli import ui
    from klisk.core.paths import KLISK_HOME, PROJECTS_DIR

    first_run = not KLISK_HOME.exists()

    from klisk.core.paths import get_projects_dir
    from klisk.core.skill_installer import install_skill

    get_projects_dir()  # creates ~/klisk/ and ~/klisk/projects/
    install_skill(KLISK_HOME)  # downloads klisk-guide skill from GitHub

    home_display = f"~/{KLISK_HOME.relative_to(KLISK_HOME.parent)}"

    if first_run:
        _welcome_first_run(ui, home_display)
        return

    # Count projects (dirs with klisk.config.yaml)
    projects = [
        d for d in PROJECTS_DIR.iterdir()
        if d.is_dir() and (d / "klisk.config.yaml").exists()
    ] if PROJECTS_DIR.exists() else []

    # Check if studio is running
    from klisk.core.daemon import read_pid_info

    studio_info = read_pid_info(None)  # workspace mode

    if not projects:
        _welcome_no_projects(ui, home_display)
    elif studio_info:
        _welcome_studio_running(ui, studio_info, len(projects))
    else:
        _welcome_studio_off(ui, len(projects))


def _welcome_first_run(ui, home_display: str) -> None:
    ui.header("Welcome to Klisk!")
    ui.plain()
    ui.step(f"Your workspace has been created at {home_display}")
    ui.plain()
    ui.dim("To create your first agent you have two options:")
    ui.plain()
    ui.dim("1. Open the Studio and ask the Klisk assistant for help:")
    ui.dim("   klisk studio")
    ui.plain()
    ui.dim("2. Use any AI coding agent from your workspace:")
    ui.dim(f"   cd {home_display}")
    ui.dim("   claude                  # or cursor, windsurf, etc.")
    ui.plain()


def _welcome_no_projects(ui, home_display: str) -> None:
    ui.header("Klisk")
    ui.info("No projects yet.")
    ui.plain()
    ui.dim("Option 1 — Open the Studio:")
    ui.dim("  klisk studio")
    ui.plain()
    ui.dim("Option 2 — Use an AI agent:")
    ui.dim(f"  cd {home_display}")
    ui.dim('  claude                   # or your preferred AI agent')
    ui.dim('  > "Create an agent that ..."')
    ui.plain()


def _welcome_studio_running(ui, studio_info: object, project_count: int) -> None:
    label = "project" if project_count == 1 else "projects"
    ui.header(f"Klisk Studio is running ({project_count} {label}).")
    ui.plain()
    ui.url("Open in browser", f"http://localhost:{studio_info.port}")
    ui.plain()


def _welcome_studio_off(ui, project_count: int) -> None:
    label = "project" if project_count == 1 else "projects"
    ui.header(f"Klisk — {project_count} {label} in workspace.")
    ui.plain()
    ui.dim("Start the Studio to configure and test your agents:")
    ui.dim("  klisk studio")
    ui.plain()


app.command()(assistant)
app.command()(create)
app.command()(delete)
app.command()(studio)
app.command()(run)
app.command()(check)
app.command("list")(list_cmd)
app.command()(start)
app.command()(config)
app.command()(docker)
app.command()(deploy)
app.command()(status)
