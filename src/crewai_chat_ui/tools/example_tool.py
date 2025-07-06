from crewai.tools.base_tool import BaseTool
from pydantic import BaseModel, Field
from typing import Annotated, Type


class ExampleToolInput(BaseModel):
    query: Annotated[str, Field(description="The search query string")]


class MySimpleTool(BaseTool):
    name: str = "My Simple Tool"
    description: str = "A simple tool that does something."
    args_schema: Type[BaseModel] = ExampleToolInput

    def _run(self, query: str) -> str:
        """A simple tool that takes a string and returns it."""
        return f"You said: {query}"
