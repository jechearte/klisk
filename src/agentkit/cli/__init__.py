"""AgentKit CLI powered by Typer."""

import typer

from agentkit.cli.create import create
from agentkit.cli.delete import delete
from agentkit.cli.dev import dev
from agentkit.cli.run import run
from agentkit.cli.check import check
from agentkit.cli.list_projects import list_cmd
from agentkit.cli.serve import serve

app = typer.Typer(
    name="agentkit",
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
