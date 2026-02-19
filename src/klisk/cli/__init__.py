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

    from klisk.core.paths import KLISK_HOME, PROJECTS_DIR

    first_run = not KLISK_HOME.exists()

    from klisk.core.paths import get_projects_dir
    from klisk.core.skill_installer import install_skill

    get_projects_dir()  # creates ~/klisk/ and ~/klisk/projects/
    install_skill(KLISK_HOME)  # downloads klisk-guide skill from GitHub

    home_display = f"~/{KLISK_HOME.relative_to(KLISK_HOME.parent)}"

    if first_run:
        _welcome_first_run(home_display)
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
        _welcome_no_projects(home_display)
    elif studio_info:
        _welcome_studio_running(studio_info, len(projects))
    else:
        _welcome_studio_off(len(projects))


def _welcome_first_run(home_display: str) -> None:
    typer.echo(f"""
  Welcome to Klisk!

  Your workspace is ready at {home_display}

  Get started:
    klisk studio             # open the Studio
    cd {home_display}
    claude                   # or your preferred AI agent
    > "Create an agent that ..."
""")


def _welcome_no_projects(home_display: str) -> None:
    typer.echo(f"""
  Klisk — no projects yet.

  Option 1 — Open the Studio:
    klisk studio

  Option 2 — Use an AI agent:
    cd {home_display}
    claude                   # or your preferred AI agent
    > "Create an agent that ..."
""")


def _welcome_studio_running(studio_info: object, project_count: int) -> None:
    label = "project" if project_count == 1 else "projects"
    typer.echo(f"""
  Klisk Studio is running ({project_count} {label}).

  Open in browser: http://localhost:{studio_info.port}
""")


def _welcome_studio_off(project_count: int) -> None:
    label = "project" if project_count == 1 else "projects"
    typer.echo(f"""
  Klisk — {project_count} {label} in workspace.

  Start the Studio to configure and test your agents:
    klisk studio
""")


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
