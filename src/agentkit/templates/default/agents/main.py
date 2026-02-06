from agentkit import define_agent, get_tools


agent = define_agent(
    name="Assistant",
    instructions="You are a helpful assistant. Use the tools available to help the user.",
    # Use "provider/model" for non-OpenAI models (e.g. "anthropic/claude-3-5-sonnet-20240620")
    model="gpt-5.2",
    tools=get_tools("greet"),
    # builtin_tools=["web_search"],  # Enable web search (OpenAI models only)
)
