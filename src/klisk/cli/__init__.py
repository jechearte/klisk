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

    from klisk.core.paths import get_projects_dir, KLISK_HOME
    from klisk.core.skill_installer import install_skill

    get_projects_dir()  # creates ~/klisk/ and ~/klisk/projects/
    install_skill(KLISK_HOME)  # downloads klisk-guide skill from GitHub

    home_display = f"~/{KLISK_HOME.relative_to(KLISK_HOME.parent)}"

    typer.echo(
        f"""
  Welcome to Klisk!

  Your workspace is ready at {home_display}

  Next steps:
    cd {home_display}
    claude               # or your preferred AI agent
    > "Create an agent that ..."

  Or create a project manually:
    klisk create my-agent
"""
    )


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
