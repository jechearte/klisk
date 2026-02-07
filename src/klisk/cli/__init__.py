"""Klisk CLI powered by Typer."""

import typer

from klisk.cli.create import create
from klisk.cli.delete import delete
from klisk.cli.dev import dev
from klisk.cli.run import run
from klisk.cli.check import check
from klisk.cli.list_projects import list_cmd
from klisk.cli.serve import serve
from klisk.cli.deploy import deploy_app

app = typer.Typer(
    name="klisk",
    help="A framework for building AI agents programmatically.",
    add_completion=False,
)

app.command()(create)
app.command()(delete)
app.command()(dev)
app.command()(run)
app.command()(check)
app.command("list")(list_cmd)
app.command()(serve)
app.add_typer(deploy_app)
