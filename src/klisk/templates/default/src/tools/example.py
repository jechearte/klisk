from klisk import tool


@tool
async def greet(name: str) -> str:
    """Greet someone by name."""
    return f"Hello, {name}! How can I help you today?"
